//! End-to-end exercises across the whole core layer.
//!
//! The per-module tests cover each function in isolation; these walk the same
//! sequences a user drives through the UI, so a regression in how the modules
//! fit together is caught even when every unit test still passes.

use super::test_support::FixtureRepo;
use super::{branch, commit, diff, log, remote, repo, stage, stash, status};

/// Architecture guard: `core/exec.rs` is the single place allowed to spawn a
/// `git` subprocess (plus `core/test_support.rs`, which sets up fixtures).
///
/// This is the rule the whole design rests on — auditability of every git
/// invocation, and the Phase 4 MCP server reusing the core layer unchanged. It
/// is easy to break by accident and invisible in review, so it is checked here
/// rather than left to a habit.
#[test]
fn no_module_spawns_git_outside_exec() {
    let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let allowed = ["exec.rs", "test_support.rs"];
    let mut offenders = Vec::new();

    let mut stack = vec![src.clone()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).expect("read src dir") {
            let path = entry.expect("dir entry").path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().is_none_or(|ext| ext != "rs") {
                continue;
            }
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if allowed.contains(&name.as_ref()) {
                continue;
            }
            let contents = std::fs::read_to_string(&path).expect("read source file");
            if contents.contains("Command::new(\"git\")") {
                offenders.push(
                    path.strip_prefix(&src)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
    }

    offenders.sort();
    assert!(
        offenders.is_empty(),
        "git must only be spawned from core/exec.rs (or core/test_support.rs for \
         fixtures); these files spawn it directly: {offenders:?}"
    );
}

/// The first-commit flow, in a repository that has no commits at all.
///
/// Every operation here runs without a HEAD to resolve against, which is a
/// distinct code path from everything the other round trips exercise — and the
/// very first thing a new user does.
#[test]
fn first_commit_in_an_empty_repository() {
    let fixture = FixtureRepo::new();

    let state = repo::open_repo(fixture.path()).expect("an empty repo must open");
    assert_eq!(state.head_branch.as_deref(), Some("main"));

    let s = status::get_status(&state.path).expect("status");
    assert!(s.is_clean());

    fixture.write("README.md", "# New project\n");
    assert_eq!(
        status::get_status(&state.path)
            .expect("status")
            .untracked
            .len(),
        1
    );

    stage::stage_file(&state.path, "README.md").expect("stage");
    let s = status::get_status(&state.path).expect("status");
    assert_eq!(s.staged.len(), 1);
    assert_eq!(s.staged[0].kind, status::ChangeKind::Added);

    // Changing one's mind before the first commit must work — there is no HEAD
    // to restore from, so this is where a `restore --staged` would die.
    stage::unstage_file(&state.path, "README.md").expect("unstage with no HEAD");
    assert_eq!(
        status::get_status(&state.path)
            .expect("status")
            .untracked
            .len(),
        1
    );

    stage::stage_all(&state.path).expect("stage all");
    let hash = commit::commit(&state.path, "Initial commit", None, false).expect("commit");

    assert!(status::get_status(&state.path).expect("status").is_clean());
    let commits = log::get_log(&state.path, 10).expect("log");
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].hash, hash);
    assert!(
        commits[0].parents.is_empty(),
        "the first commit is a root commit"
    );

    let layout = log::compute_lanes(&commits);
    assert_eq!(layout.lane_count, 1);
    assert!(layout.rows[0].outgoing.is_empty());
}

/// Hit a merge conflict, see it reported, resolve it, and commit the merge.
///
/// Conflict handling crosses status parsing, staging, and committing at once —
/// each is unit-tested, but only this proves the mid-merge repository state
/// stays coherent from one step to the next.
#[test]
fn conflicted_merge_is_reported_then_resolved() {
    let fixture = FixtureRepo::new();
    fixture.commit("shared.txt", "base\n", "Base");

    branch::checkout_new(fixture.path(), "theirs", None).expect("branch");
    fixture.commit("shared.txt", "their version\n", "Their change");

    branch::checkout(fixture.path(), "main").expect("back to main");
    fixture.commit("shared.txt", "our version\n", "Our change");

    // The merge is expected to fail — that is what puts the tree in conflict.
    branch::merge_branch(fixture.path(), "theirs").expect_err("this merge must conflict");

    let s = status::get_status(fixture.path()).expect("status mid-merge");
    assert_eq!(s.conflicted.len(), 1);
    assert_eq!(s.conflicted[0].path, "shared.txt");
    assert!(!s.is_clean());

    // The diff viewer has to keep working while the tree is conflicted, or the
    // user cannot see what they are resolving.
    let d = diff::diff_file(fixture.path(), "shared.txt", false).expect("diff mid-merge");
    assert!(
        d.contains("their version") || d.contains("our version"),
        "got: {d}"
    );

    // Resolve by hand, stage, and finish the merge.
    fixture.write("shared.txt", "reconciled\n");
    stage::stage_file(fixture.path(), "shared.txt").expect("stage the resolution");
    assert!(status::get_status(fixture.path())
        .expect("status")
        .conflicted
        .is_empty());

    commit::commit(fixture.path(), "Merge theirs into main", None, false).expect("merge commit");

    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());
    let commits = log::get_log(fixture.path(), 10).expect("log");
    assert_eq!(
        commits[0].parents.len(),
        2,
        "the resolution should land as a merge commit"
    );
    assert_eq!(log::compute_lanes(&commits).lane_count, 2);
}

/// Rewriting recent history: amend the tip, then reset back and recommit.
///
/// These are the operations that can silently destroy work, so the round trip
/// asserts what survives at each step rather than just that nothing errored.
#[test]
fn amend_and_reset_rewrite_history_predictably() {
    let fixture = FixtureRepo::new();
    let base = fixture.commit("a.txt", "one\n", "First");
    fixture.commit("b.txt", "two\n", "Typo in teh second");

    // --- amend: message changes, history length does not ---
    let amended = commit::commit(fixture.path(), "Fix the second", None, true).expect("amend");
    let commits = log::get_log(fixture.path(), 10).expect("log");
    assert_eq!(commits.len(), 2, "amend replaces rather than adds");
    assert_eq!(commits[0].hash, amended);
    assert_eq!(commits[0].subject, "Fix the second");
    assert!(fixture.file_path("b.txt").exists());

    // --- soft reset: the commit goes, the work stays staged ---
    commit::reset(fixture.path(), &base, commit::ResetMode::Soft).expect("soft reset");
    let s = status::get_status(fixture.path()).expect("status");
    assert_eq!(log::get_log(fixture.path(), 10).expect("log").len(), 1);
    assert_eq!(s.staged.len(), 1, "the work is back in the index");
    assert!(fixture.file_path("b.txt").exists());

    // --- recommit and confirm the graph is linear again ---
    commit::commit(fixture.path(), "Second, done properly", None, false).expect("recommit");
    let commits = log::get_log(fixture.path(), 10).expect("log");
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].subject, "Second, done properly");
    let layout = log::compute_lanes(&commits);
    assert_eq!(layout.lane_count, 1, "no branching happened");
    assert!(layout.rows.iter().all(|r| r.lane == 0));
}

/// Create a branch, work on it, merge it, and delete it — the everyday branch
/// lifecycle, checked against the branch list at each step.
#[test]
fn branch_lifecycle_from_creation_to_deletion() {
    let fixture = FixtureRepo::new();
    fixture.commit("base.txt", "base\n", "Base");

    branch::checkout_new(fixture.path(), "feature/tabs", None).expect("create and switch");
    assert_eq!(
        repo::head_branch(fixture.path()).expect("head"),
        Some("feature/tabs".to_string())
    );

    fixture.commit("tabs.rs", "// tabs\n", "Add tabs");

    branch::checkout(fixture.path(), "main").expect("back to main");
    // Unmerged work must not be droppable by accident.
    branch::delete_branch(fixture.path(), "feature/tabs", false)
        .expect_err("git must refuse to delete unmerged work");

    branch::merge_branch(fixture.path(), "feature/tabs").expect("merge");
    assert!(fixture.file_path("tabs.rs").exists());

    // Once merged, a plain delete is safe and the branch leaves the list.
    branch::delete_branch(fixture.path(), "feature/tabs", false).expect("delete after merge");
    let names: Vec<String> = branch::list_branches(fixture.path())
        .expect("branches")
        .into_iter()
        .map(|b| b.name)
        .collect();
    assert_eq!(names, vec!["main".to_string()]);

    // The commit itself survives the branch that carried it.
    assert!(log::get_log(fixture.path(), 10)
        .expect("log")
        .iter()
        .any(|c| c.subject == "Add tabs"));
}

/// A stash taken on one branch, restored on another — the flow that motivates
/// stashing in the first place, and the one where a stale index would bite.
#[test]
fn stash_moves_work_between_branches() {
    let fixture = FixtureRepo::new();
    fixture.commit("a.txt", "base\n", "Base");

    fixture.write("a.txt", "work in progress\n");
    fixture.write("scratch.txt", "notes\n");
    stash::save_stash(fixture.path(), Some("wrong branch"), true).expect("stash");

    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());

    branch::checkout_new(fixture.path(), "correct-branch", None).expect("branch");
    let entry = stash::list_stashes(fixture.path()).expect("list")[0].clone();
    stash::pop_stash(fixture.path(), entry.index, &entry.hash).expect("pop");

    let s = status::get_status(fixture.path()).expect("status");
    assert_eq!(s.unstaged.len(), 1, "the tracked edit came back");
    assert_eq!(s.untracked.len(), 1, "so did the untracked file");
    assert!(
        stash::list_stashes(fixture.path())
            .expect("list")
            .is_empty(),
        "pop consumes the entry"
    );

    stage::stage_all(fixture.path()).expect("stage");
    commit::commit(fixture.path(), "Work, on the right branch", None, false).expect("commit");
    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());
}

/// The definition-of-done flow: open a repo, stage, commit, push, and confirm
/// every view the UI renders agrees at each step.
#[test]
fn stage_commit_push_round_trip() {
    let fixture = FixtureRepo::new();
    fixture.commit("README.md", "# Project\n", "Initial commit");
    let _bare = fixture.add_bare_remote("origin");
    fixture.git(&["push", "-u", "origin", "main"]);

    // --- open ---
    let state = repo::open_repo(fixture.path()).expect("open");
    assert_eq!(state.head_branch.as_deref(), Some("main"));

    // --- edit -> shows up as unstaged ---
    fixture.write("README.md", "# Project\n\nNow with docs.\n");
    fixture.write("new-file.txt", "brand new\n");

    let s = status::get_status(&state.path).expect("status");
    assert_eq!(s.unstaged.len(), 1);
    assert_eq!(s.untracked.len(), 1);
    assert!(s.staged.is_empty());

    // --- stage -> moves between lists ---
    stage::stage_file(&state.path, "README.md").expect("stage README");
    stage::stage_file(&state.path, "new-file.txt").expect("stage new file");

    let s = status::get_status(&state.path).expect("status");
    assert_eq!(s.staged.len(), 2);
    assert!(s.unstaged.is_empty());
    assert!(s.untracked.is_empty());

    // --- commit -> tree clean, graph grows, branch goes ahead ---
    let hash = commit::commit(&state.path, "Document the project", None, false).expect("commit");

    let s = status::get_status(&state.path).expect("status");
    assert!(
        s.is_clean(),
        "the working tree should be clean after committing"
    );
    assert_eq!(s.ahead, 1, "one commit ahead of origin/main");
    assert_eq!(s.behind, 0);

    let commits = log::get_log(&state.path, 50).expect("log");
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].hash, hash);
    assert_eq!(commits[0].subject, "Document the project");

    // The branch list must agree with the status header — these are computed by
    // two different code paths (`rev-list --count` vs porcelain v2), so
    // disagreement means one of them is wrong.
    let branches = branch::list_branches(&state.path).expect("branches");
    let main = branches
        .iter()
        .find(|b| b.name == "main")
        .expect("main branch");
    assert_eq!(
        (main.ahead, main.behind),
        (s.ahead, s.behind),
        "branch list and status header disagree about divergence"
    );

    // --- push -> divergence clears ---
    remote::push(&state.path, None, None, false).expect("push");

    let s = status::get_status(&state.path).expect("status");
    assert_eq!(
        s.ahead, 0,
        "pushing should leave the branch level with origin"
    );
    assert_eq!(s.behind, 0);
}

/// Branch, commit, merge — then confirm the graph lays out the merge correctly.
#[test]
fn branch_merge_and_graph_layout_agree() {
    let fixture = FixtureRepo::new();
    fixture.commit("base.txt", "base\n", "Base");

    branch::checkout_new(fixture.path(), "feature", None).expect("create feature");
    fixture.commit("feature.txt", "feature\n", "Feature work");

    branch::checkout(fixture.path(), "main").expect("back to main");
    fixture.commit("main.txt", "main\n", "Mainline work");

    branch::merge_branch(fixture.path(), "feature").expect("merge");

    let commits = log::get_log(fixture.path(), 50).expect("log");
    let layout = log::compute_lanes(&commits);

    assert_eq!(commits.len(), 4, "base, feature, main, merge");
    assert_eq!(commits[0].parents.len(), 2, "the tip is a merge commit");
    assert_eq!(layout.rows.len(), 4);
    assert_eq!(layout.lane_count, 2);

    // Every row must reference a lane inside the reported width, or the
    // renderer would draw outside its viewport.
    for row in &layout.rows {
        assert!(
            row.lane < layout.lane_count,
            "row {} is out of bounds",
            row.hash
        );
    }

    // The base commit is where the side lane rejoins the mainline.
    let base = layout.rows.last().expect("base row");
    assert_eq!(base.lane, 0);
    assert_eq!(base.merged_from.len(), 1);
}

/// Stash a change, confirm the tree is clean, restore it, and commit — the
/// "put this aside for a moment" flow end to end.
#[test]
fn stash_then_restore_then_commit() {
    let fixture = FixtureRepo::new();
    fixture.commit("a.txt", "one\n", "Initial commit");

    fixture.write("a.txt", "two\n");
    stash::save_stash(fixture.path(), Some("half-finished"), true).expect("stash");

    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());
    assert_eq!(stash::list_stashes(fixture.path()).expect("list").len(), 1);

    // Apply keeps the entry, so the safety net is still there. The hash comes
    // from the listing, exactly as the UI supplies it.
    let entry = stash::list_stashes(fixture.path()).expect("list")[0].clone();
    stash::apply_stash(fixture.path(), entry.index, &entry.hash).expect("apply");
    assert_eq!(
        stash::list_stashes(fixture.path()).expect("list").len(),
        1,
        "apply must not consume the stash"
    );

    stage::stage_file(fixture.path(), "a.txt").expect("stage");
    commit::commit(fixture.path(), "Finish the work", None, false).expect("commit");

    // Now the stash is genuinely redundant and can be dropped.
    let entry = stash::list_stashes(fixture.path()).expect("list")[0].clone();
    stash::drop_stash(fixture.path(), entry.index, &entry.hash).expect("drop");
    assert!(stash::list_stashes(fixture.path())
        .expect("list")
        .is_empty());
    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());
}
