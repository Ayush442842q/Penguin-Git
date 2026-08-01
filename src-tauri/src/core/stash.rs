use std::path::Path;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, GitError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    /// Position in the stash stack; also its `stash@{index}` selector.
    ///
    /// Positions shift whenever an entry is added or removed, so this is a
    /// display/selection handle only — never act on it without checking `hash`.
    pub index: usize,
    /// The stash commit itself. Stable for the life of the entry, so it can be
    /// used to confirm that `stash@{index}` still refers to what the UI showed.
    pub hash: String,
    pub message: String,
    /// Branch the stash was created on.
    pub branch: String,
    /// Creation time, seconds since the Unix epoch.
    pub timestamp: i64,
}

/// Lists the stash stack, newest first.
///
/// Formatted explicitly rather than parsed from `git stash list`'s default
/// human output, which packs everything into one colon-separated string that
/// breaks as soon as a stash message contains a colon.
pub fn list_stashes(repo_path: &Path) -> Result<Vec<Stash>, GitError> {
    let raw = run_git(
        repo_path,
        &["stash", "list", "--pretty=format:%gd%x00%gs%x00%at%x00%H"],
    )?;

    Ok(raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .enumerate()
        .map(|(index, line)| {
            let mut fields = line.splitn(4, '\0');
            let selector = fields.next().unwrap_or_default();
            let subject = fields.next().unwrap_or_default();
            let timestamp = fields
                .next()
                .and_then(|t| t.trim().parse().ok())
                .unwrap_or(0);
            let hash = fields.next().unwrap_or_default().trim().to_string();

            // `%gs` reads "WIP on main: 1a2b3c subject" or "On main: message".
            // Split the branch out of the prefix, leaving the message itself.
            let (branch, message) = split_stash_subject(subject);

            Stash {
                // Prefer the index encoded in the selector, falling back to
                // enumeration order if the format ever surprises us.
                index: parse_selector_index(selector).unwrap_or(index),
                hash,
                message,
                branch,
                timestamp,
            }
        })
        .collect())
}

/// `stash@{2}` -> `2`
fn parse_selector_index(selector: &str) -> Option<usize> {
    selector
        .split_once('{')
        .and_then(|(_, rest)| rest.strip_suffix('}'))
        .and_then(|n| n.parse().ok())
}

/// Splits git's stash subject into (branch, message).
fn split_stash_subject(subject: &str) -> (String, String) {
    let trimmed = subject
        .strip_prefix("WIP on ")
        .or_else(|| subject.strip_prefix("On "))
        .unwrap_or(subject);

    match trimmed.split_once(": ") {
        Some((branch, message)) => (branch.to_string(), message.to_string()),
        None => (trimmed.to_string(), subject.to_string()),
    }
}

/// Stashes the current changes.
///
/// `include_untracked` also sweeps up files git isn't tracking yet, which is
/// usually what a user means by "put my work aside" but is not git's default.
pub fn save_stash(
    repo_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<(), GitError> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("--include-untracked");
    }
    if let Some(message) = message.filter(|m| !m.trim().is_empty()) {
        args.push("-m");
        args.push(message);
    }
    run_git(repo_path, &args)?;
    Ok(())
}

/// Diff of a stash's contents, without applying it.
pub fn stash_diff(repo_path: &Path, index: usize) -> Result<String, GitError> {
    let selector = selector(index);
    run_git(repo_path, &["stash", "show", "-p", "--no-color", &selector])
}

/// Confirms `stash@{index}` still points at `expected_hash` before acting on it.
///
/// Stash positions are not stable — every push, pop, or drop renumbers the whole
/// stack. A UI list rendered a moment ago can therefore name an index that now
/// refers to a *different* entry, and dropping or popping the wrong one destroys
/// work the user never chose. The hash captured at list time is stable, so it
/// serves as an optimistic-concurrency check: mismatch means the stack moved
/// underneath us and the caller should refresh rather than guess.
///
/// Known limitation: this is a check-then-act, not an atomic operation. A stash
/// entry is a reflog entry on `refs/stash`, and git exposes no compare-and-swap
/// for one — `update-ref` can guard a ref's value, but not a reflog position.
/// Closing the window entirely would mean manipulating the reflog directly
/// instead of shelling out to `git stash`, which is the opposite of this
/// project's architecture. What the check does eliminate is the realistic
/// failure: a UI list that has been stale for seconds or minutes. What remains
/// is the microsecond gap between two subprocesses, and only if another git
/// process is mutating the same stack concurrently.
fn verify_stash(repo_path: &Path, index: usize, expected_hash: &str) -> Result<(), GitError> {
    let actual = run_git(repo_path, &["rev-parse", &selector(index)])?
        .trim()
        .to_string();

    if actual != expected_hash {
        return Err(GitError::CommandFailed {
            exit_code: None,
            stderr: format!(
                "the stash list changed since it was loaded: stash@{{{index}}} is now {}, not {}. Refresh and try again.",
                short(&actual),
                short(expected_hash)
            ),
        });
    }
    Ok(())
}

fn short(hash: &str) -> &str {
    hash.get(..7).unwrap_or(hash)
}

/// Restores a stash's changes **and keeps the stash entry**.
///
/// Deliberately distinct from [`pop_stash`]. Conflating the two is a real data-loss
/// hazard: a user who expects `apply` and gets `pop` loses their safety net the
/// moment the working tree turns out wrong.
pub fn apply_stash(repo_path: &Path, index: usize, expected_hash: &str) -> Result<(), GitError> {
    verify_stash(repo_path, index, expected_hash)?;
    run_git(repo_path, &["stash", "apply", &selector(index)])?;
    Ok(())
}

/// Restores a stash's changes **and removes the stash entry**.
///
/// See [`apply_stash`] — these are two different operations and must stay that way.
pub fn pop_stash(repo_path: &Path, index: usize, expected_hash: &str) -> Result<(), GitError> {
    verify_stash(repo_path, index, expected_hash)?;
    run_git(repo_path, &["stash", "pop", &selector(index)])?;
    Ok(())
}

/// Deletes a stash entry without restoring it. Irreversible.
pub fn drop_stash(repo_path: &Path, index: usize, expected_hash: &str) -> Result<(), GitError> {
    verify_stash(repo_path, index, expected_hash)?;
    run_git(repo_path, &["stash", "drop", &selector(index)])?;
    Ok(())
}

fn selector(index: usize) -> String {
    format!("stash@{{{index}}}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::status::get_status;
    use crate::core::test_support::FixtureRepo;

    /// Current hash of `stash@{index}` — what a freshly-loaded UI list would hold.
    fn stash_hash(repo: &FixtureRepo, index: usize) -> String {
        list_stashes(repo.path()).expect("list")[index].hash.clone()
    }

    fn repo_with_a_stash() -> FixtureRepo {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "original\n", "Initial commit");
        repo.write("a.txt", "modified\n");
        save_stash(repo.path(), Some("my work in progress"), false).expect("stash");
        repo
    }

    #[test]
    fn save_stash_clears_the_working_tree() {
        let repo = repo_with_a_stash();

        assert!(get_status(repo.path()).expect("status").is_clean());
        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "original\n"
        );
    }

    #[test]
    fn list_stashes_reads_the_custom_message() {
        let repo = repo_with_a_stash();

        let stashes = list_stashes(repo.path()).expect("list");

        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].index, 0);
        assert_eq!(stashes[0].message, "my work in progress");
        assert_eq!(stashes[0].branch, "main");
    }

    #[test]
    fn stash_message_containing_a_colon_survives() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "one\n", "Initial commit");
        repo.write("a.txt", "two\n");
        save_stash(repo.path(), Some("fix: the thing: properly"), false).expect("stash");

        let stashes = list_stashes(repo.path()).expect("list");

        assert_eq!(stashes[0].message, "fix: the thing: properly");
        assert_eq!(stashes[0].branch, "main");
    }

    #[test]
    fn include_untracked_stashes_new_files_too() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("brand-new.txt", "hi");

        save_stash(repo.path(), Some("with untracked"), true).expect("stash");

        assert!(
            !repo.file_path("brand-new.txt").exists(),
            "--include-untracked should have swept up the new file"
        );
    }

    #[test]
    fn untracked_files_are_left_alone_without_the_flag() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("tracked-change.txt", "hi");
        repo.git(&["add", "tracked-change.txt"]);
        repo.commit_all("Track it");
        repo.write("tracked-change.txt", "changed");
        repo.write("untracked.txt", "not tracked");

        save_stash(repo.path(), None, false).expect("stash");

        assert!(
            repo.file_path("untracked.txt").exists(),
            "plain stash must not touch untracked files"
        );
    }

    #[test]
    fn stash_diff_previews_without_applying() {
        let repo = repo_with_a_stash();

        let diff = stash_diff(repo.path(), 0).expect("stash show");

        assert!(diff.contains("-original"));
        assert!(diff.contains("+modified"));
        // Previewing must not restore anything.
        assert!(get_status(repo.path()).expect("status").is_clean());
        assert_eq!(list_stashes(repo.path()).expect("list").len(), 1);
    }

    /// The definition-of-done test: apply and pop are not the same operation.
    #[test]
    fn apply_keeps_the_stash_but_pop_removes_it() {
        // --- apply: the entry survives ---
        let repo = repo_with_a_stash();
        assert_eq!(list_stashes(repo.path()).expect("list").len(), 1);

        apply_stash(repo.path(), 0, &stash_hash(&repo, 0)).expect("apply");

        assert_eq!(
            list_stashes(repo.path()).expect("list").len(),
            1,
            "apply must leave the stash entry in place"
        );
        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "modified\n",
            "apply must still restore the changes"
        );

        // --- pop: the entry is consumed ---
        let repo = repo_with_a_stash();
        assert_eq!(list_stashes(repo.path()).expect("list").len(), 1);

        pop_stash(repo.path(), 0, &stash_hash(&repo, 0)).expect("pop");

        assert_eq!(
            list_stashes(repo.path()).expect("list").len(),
            0,
            "pop must consume the stash entry"
        );
        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "modified\n",
            "pop must restore the changes too"
        );
    }

    #[test]
    fn drop_removes_a_stash_without_restoring_it() {
        let repo = repo_with_a_stash();

        drop_stash(repo.path(), 0, &stash_hash(&repo, 0)).expect("drop");

        assert!(list_stashes(repo.path()).expect("list").is_empty());
        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "original\n",
            "drop must not restore the changes"
        );
    }

    #[test]
    fn acting_on_a_stale_stash_index_is_refused() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "base\n", "Initial commit");
        repo.write("a.txt", "first\n");
        save_stash(repo.path(), Some("older"), false).expect("stash");

        // What a UI list loaded at this moment would hold for index 0.
        let stale_hash = stash_hash(&repo, 0);

        // Another push renumbers the stack: the old entry is now index 1.
        repo.write("a.txt", "second\n");
        save_stash(repo.path(), Some("newer"), false).expect("stash");

        // Acting on the remembered index would now hit the *newer* stash and
        // destroy work the user never selected.
        let err = drop_stash(repo.path(), 0, &stale_hash)
            .expect_err("a stale index must be refused, not silently retargeted");
        assert!(err.to_string().contains("changed since it was loaded"));

        // Nothing was dropped.
        assert_eq!(list_stashes(repo.path()).expect("list").len(), 2);
    }

    #[test]
    fn stashes_are_indexed_newest_first() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "base\n", "Initial commit");

        repo.write("a.txt", "first change\n");
        save_stash(repo.path(), Some("older"), false).expect("stash");
        repo.write("a.txt", "second change\n");
        save_stash(repo.path(), Some("newer"), false).expect("stash");

        let stashes = list_stashes(repo.path()).expect("list");

        assert_eq!(stashes.len(), 2);
        assert_eq!(
            stashes[0].message, "newer",
            "index 0 is the most recent stash"
        );
        assert_eq!(stashes[0].index, 0);
        assert_eq!(stashes[1].message, "older");
        assert_eq!(stashes[1].index, 1);
    }
}
