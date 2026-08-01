//! End-to-end exercises across the whole core layer.
//!
//! The per-module tests cover each function in isolation; these walk the same
//! sequences a user drives through the UI, so a regression in how the modules
//! fit together is caught even when every unit test still passes.

use super::test_support::FixtureRepo;
use super::{branch, commit, log, remote, repo, stage, stash, status};

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

    // Apply keeps the entry, so the safety net is still there.
    stash::apply_stash(fixture.path(), 0).expect("apply");
    assert_eq!(
        stash::list_stashes(fixture.path()).expect("list").len(),
        1,
        "apply must not consume the stash"
    );

    stage::stage_file(fixture.path(), "a.txt").expect("stage");
    commit::commit(fixture.path(), "Finish the work", None, false).expect("commit");

    // Now the stash is genuinely redundant and can be dropped.
    stash::drop_stash(fixture.path(), 0).expect("drop");
    assert!(stash::list_stashes(fixture.path())
        .expect("list")
        .is_empty());
    assert!(status::get_status(fixture.path())
        .expect("status")
        .is_clean());
}
