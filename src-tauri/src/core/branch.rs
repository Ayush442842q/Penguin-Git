use std::path::Path;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    /// True for remote-tracking branches (`origin/main`).
    pub is_remote: bool,
    pub is_head: bool,
    pub upstream: Option<String>,
    /// Commits on this branch that the upstream lacks.
    pub ahead: u32,
    /// Commits on the upstream that this branch lacks.
    pub behind: u32,
    pub tip: String,
    pub subject: String,
}

/// Lists local and remote-tracking branches.
///
/// Built from `for-each-ref` with an explicit field format rather than parsing
/// `git branch -vv`: that output is laid out for humans, is locale-dependent,
/// and packs ahead/behind into a parenthetical that changes shape between git
/// versions. Ahead/behind here comes from `rev-list --count`, which is exact.
pub fn list_branches(repo_path: &Path) -> Result<Vec<Branch>, GitError> {
    let raw = run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(HEAD)%00%(contents:subject)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    let mut branches = Vec::new();
    for line in raw.lines().filter(|l| !l.trim().is_empty()) {
        let mut fields = line.splitn(6, '\0');
        let (Some(full_ref), Some(name), Some(tip), Some(upstream), Some(head_marker)) = (
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
        ) else {
            continue;
        };
        let subject = fields.next().unwrap_or_default().to_string();

        // The namespace is authoritative. The short name isn't: a local branch
        // may legally be called `origin/main`, which is indistinguishable from
        // the remote-tracking ref of the same name once the namespace is
        // stripped. Reading `%(refname)` also avoids spawning a `show-ref` probe
        // per branch on the request path.
        let is_remote = full_ref.starts_with("refs/remotes/");

        // git lists the symbolic `origin/HEAD` alongside real branches; it's a
        // pointer, not something a user can check out meaningfully. Scoped to
        // remotes so a local branch named `foo/HEAD` isn't swallowed too.
        if is_remote && full_ref.ends_with("/HEAD") {
            continue;
        }

        let upstream = (!upstream.is_empty()).then(|| upstream.to_string());

        let (ahead, behind) = match &upstream {
            Some(upstream) => ahead_behind(repo_path, name, upstream)?,
            None => (0, 0),
        };

        branches.push(Branch {
            name: name.to_string(),
            is_remote,
            is_head: head_marker == "*",
            upstream,
            ahead,
            behind,
            tip: tip.to_string(),
            subject,
        });
    }

    // Local branches first, then alphabetical — the order the UI lists them in.
    branches.sort_by(|a, b| {
        a.is_remote
            .cmp(&b.is_remote)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(branches)
}

/// Rejects a ref or branch name that git would parse as an option.
///
/// A trailing `--` separates revisions from paths, but it does *not* stop git
/// reading a leading-dash value as a flag — `--` only helps for arguments that
/// come after it. Anything user- or repository-supplied is screened here before
/// it reaches the command line.
pub(crate) fn reject_option_like(value: &str) -> Result<(), GitError> {
    if value.starts_with('-') {
        return Err(GitError::CommandFailed {
            exit_code: None,
            stderr: format!("refusing to pass {value:?} to git: names beginning with '-' are ambiguous with options"),
        });
    }
    Ok(())
}

/// Exact divergence between two refs.
///
/// `--left-right --count` on a symmetric difference returns "<left> <right>" —
/// commits reachable from only one side each. This is the ground truth that
/// `git status -sb` itself reports.
pub fn ahead_behind(repo_path: &Path, local: &str, upstream: &str) -> Result<(u32, u32), GitError> {
    let range = format!("{upstream}...{local}");
    let raw = match run_git(repo_path, &["rev-list", "--left-right", "--count", &range]) {
        Ok(raw) => raw,
        // An upstream that no longer exists locally (deleted remote branch, or
        // a fetch that hasn't happened yet) isn't an error worth failing the
        // whole branch list over.
        Err(GitError::CommandFailed { .. }) => return Ok((0, 0)),
        Err(other) => return Err(other),
    };

    let mut counts = raw.split_whitespace();
    let behind = counts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
    let ahead = counts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
    Ok((ahead, behind))
}

pub fn create_branch(
    repo_path: &Path,
    name: &str,
    start_point: Option<&str>,
) -> Result<(), GitError> {
    reject_option_like(name)?;
    match start_point {
        Some(start) => {
            reject_option_like(start)?;
            run_git(repo_path, &["branch", "--", name, start])?
        }
        None => run_git(repo_path, &["branch", "--", name])?,
    };
    Ok(())
}

/// Deletes a branch. `force` allows deleting one that isn't fully merged.
pub fn delete_branch(repo_path: &Path, name: &str, force: bool) -> Result<(), GitError> {
    reject_option_like(name)?;
    let flag = if force { "-D" } else { "-d" };
    run_git(repo_path, &["branch", flag, "--", name])?;
    Ok(())
}

pub fn rename_branch(repo_path: &Path, old: &str, new: &str) -> Result<(), GitError> {
    reject_option_like(old)?;
    reject_option_like(new)?;
    run_git(repo_path, &["branch", "-m", "--", old, new])?;
    Ok(())
}

/// Switches to `target`.
///
/// The trailing `--` matters more here than anywhere else: without it, a
/// `target` that also matches a working-tree path makes git restore that path
/// from the index instead of switching branches, discarding the user's edits to
/// it with no confirmation.
pub fn checkout(repo_path: &Path, target: &str) -> Result<(), GitError> {
    reject_option_like(target)?;
    run_git(repo_path, &["checkout", target, "--"])?;
    Ok(())
}

/// Creates a branch at `start_point` and switches to it in one step.
pub fn checkout_new(
    repo_path: &Path,
    name: &str,
    start_point: Option<&str>,
) -> Result<(), GitError> {
    reject_option_like(name)?;
    match start_point {
        Some(start) => {
            reject_option_like(start)?;
            run_git(repo_path, &["checkout", "-b", name, start, "--"])?
        }
        None => run_git(repo_path, &["checkout", "-b", name, "--"])?,
    };
    Ok(())
}

/// Merges `branch` into the current branch.
///
/// `--no-edit` keeps git's generated merge message instead of launching an
/// editor, which has no terminal to attach to in a GUI.
pub fn merge_branch(repo_path: &Path, branch: &str) -> Result<(), GitError> {
    reject_option_like(branch)?;
    run_git(repo_path, &["merge", "--no-edit", branch])?;
    Ok(())
}

/// Replays the current branch on top of `onto`.
pub fn rebase_onto(repo_path: &Path, onto: &str) -> Result<(), GitError> {
    reject_option_like(onto)?;
    run_git(repo_path, &["rebase", onto])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn lists_local_branches_and_marks_head() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        repo.git(&["branch", "feature"]);

        let branches = list_branches(repo.path()).expect("list");

        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(names, vec!["feature", "main"]);
        assert!(branches.iter().find(|b| b.name == "main").unwrap().is_head);
        assert!(
            !branches
                .iter()
                .find(|b| b.name == "feature")
                .unwrap()
                .is_head
        );
    }

    #[test]
    fn branch_carries_its_tip_and_subject() {
        let repo = FixtureRepo::new();
        let hash = repo.commit("a.txt", "x", "The subject line");

        let branches = list_branches(repo.path()).expect("list");
        let main = branches.iter().find(|b| b.name == "main").unwrap();

        assert_eq!(main.tip, hash);
        assert_eq!(main.subject, "The subject line");
    }

    #[test]
    fn ahead_behind_matches_git_status_ground_truth() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        let _bare = repo.add_bare_remote("origin");
        repo.git(&["push", "-u", "origin", "main"]);

        // Two local commits the remote doesn't have.
        repo.commit("b.txt", "b", "Local one");
        repo.commit("c.txt", "c", "Local two");

        let branches = list_branches(repo.path()).expect("list");
        let main = branches.iter().find(|b| b.name == "main").unwrap();

        assert_eq!(main.upstream.as_deref(), Some("origin/main"));
        assert_eq!(main.ahead, 2);
        assert_eq!(main.behind, 0);

        // Cross-check against exactly what `git status -sb` reports.
        let sb = repo.git(&["status", "-sb"]);
        assert!(
            sb.contains("[ahead 2]"),
            "expected `git status -sb` to agree, got: {sb}"
        );
    }

    #[test]
    fn ahead_and_behind_are_both_counted_when_diverged() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        let _bare = repo.add_bare_remote("origin");
        repo.git(&["push", "-u", "origin", "main"]);

        // Push a commit from a second clone so the remote moves ahead.
        repo.commit("remote-side.txt", "r", "Remote work");
        repo.git(&["push", "origin", "main"]);
        // Then rewind locally and commit something else, creating divergence.
        repo.git(&["reset", "--hard", "HEAD~1"]);
        repo.commit("local-side.txt", "l", "Local work");
        repo.git(&["fetch", "origin"]);

        let (ahead, behind) = ahead_behind(repo.path(), "main", "origin/main").expect("counts");

        assert_eq!(ahead, 1, "one local commit the remote lacks");
        assert_eq!(behind, 1, "one remote commit the local branch lacks");
    }

    #[test]
    fn branch_without_upstream_reports_zero_divergence() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");

        let branches = list_branches(repo.path()).expect("list");
        let main = branches.iter().find(|b| b.name == "main").unwrap();

        assert_eq!(main.upstream, None);
        assert_eq!((main.ahead, main.behind), (0, 0));
    }

    #[test]
    fn local_branch_with_a_slash_is_not_mistaken_for_a_remote() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        repo.git(&["branch", "feature/login"]);

        let branches = list_branches(repo.path()).expect("list");
        let feature = branches.iter().find(|b| b.name == "feature/login").unwrap();

        assert!(
            !feature.is_remote,
            "a slash in the name doesn't make it remote"
        );
    }

    #[test]
    fn remote_tracking_branches_are_flagged() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        let _bare = repo.add_bare_remote("origin");
        repo.git(&["push", "-u", "origin", "main"]);

        let branches = list_branches(repo.path()).expect("list");
        let remote = branches.iter().find(|b| b.name == "origin/main").unwrap();

        assert!(remote.is_remote);
    }

    #[test]
    fn create_rename_and_delete_a_branch() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");

        create_branch(repo.path(), "temp", None).expect("create");
        assert!(list_branches(repo.path())
            .unwrap()
            .iter()
            .any(|b| b.name == "temp"));

        rename_branch(repo.path(), "temp", "renamed").expect("rename");
        let branches = list_branches(repo.path()).unwrap();
        assert!(branches.iter().any(|b| b.name == "renamed"));
        assert!(!branches.iter().any(|b| b.name == "temp"));

        delete_branch(repo.path(), "renamed", false).expect("delete");
        assert!(!list_branches(repo.path())
            .unwrap()
            .iter()
            .any(|b| b.name == "renamed"));
    }

    #[test]
    fn checkout_switches_the_head_branch() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        checkout_new(repo.path(), "feature", None).expect("checkout -b");

        let branches = list_branches(repo.path()).expect("list");
        assert!(
            branches
                .iter()
                .find(|b| b.name == "feature")
                .unwrap()
                .is_head
        );

        checkout(repo.path(), "main").expect("checkout main");
        let branches = list_branches(repo.path()).expect("list");
        assert!(branches.iter().find(|b| b.name == "main").unwrap().is_head);
    }

    #[test]
    fn merge_brings_in_the_other_branch() {
        let repo = FixtureRepo::new();
        repo.commit("base.txt", "base", "Base");
        checkout_new(repo.path(), "feature", None).expect("branch");
        repo.commit("feature.txt", "f", "Feature work");
        checkout(repo.path(), "main").expect("checkout");

        merge_branch(repo.path(), "feature").expect("merge");

        assert!(repo.file_path("feature.txt").exists());
    }
}
