use std::path::Path;

use super::exec::{run_git, GitError};

/// Stages a path (or a whole directory) for the next commit.
pub fn stage_file(repo_path: &Path, path: &str) -> Result<(), GitError> {
    run_git(repo_path, &["add", "--", path])?;
    Ok(())
}

/// Stages everything in the working tree, including untracked files.
pub fn stage_all(repo_path: &Path) -> Result<(), GitError> {
    run_git(repo_path, &["add", "-A"])?;
    Ok(())
}

/// Removes a path from the index, leaving the working tree untouched.
///
/// `restore --staged` rather than `reset HEAD --`, because it behaves correctly
/// on a repository with no commits yet — where there is no HEAD to reset against.
pub fn unstage_file(repo_path: &Path, path: &str) -> Result<(), GitError> {
    run_git(repo_path, &["restore", "--staged", "--", path])?;
    Ok(())
}

pub fn unstage_all(repo_path: &Path) -> Result<(), GitError> {
    run_git(repo_path, &["restore", "--staged", "--", "."])?;
    Ok(())
}

/// Throws away uncommitted changes to a tracked path.
///
/// Destructive and unrecoverable — the caller is responsible for confirming
/// intent before invoking this.
pub fn discard_file_changes(repo_path: &Path, path: &str) -> Result<(), GitError> {
    run_git(repo_path, &["restore", "--worktree", "--", path])?;
    Ok(())
}

/// Deletes an untracked file from the working tree.
///
/// `clean -f` limited to the single path, so it can't cascade into deleting
/// anything the caller didn't name.
pub fn discard_untracked(repo_path: &Path, path: &str) -> Result<(), GitError> {
    run_git(repo_path, &["clean", "-f", "--", path])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::status::get_status;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn stage_then_unstage_round_trips() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "one\n", "Initial commit");
        repo.write("a.txt", "two\n");

        stage_file(repo.path(), "a.txt").expect("stage");
        let staged = get_status(repo.path()).expect("status");
        assert_eq!(staged.staged.len(), 1);
        assert!(staged.unstaged.is_empty());

        unstage_file(repo.path(), "a.txt").expect("unstage");
        let unstaged = get_status(repo.path()).expect("status");
        assert!(unstaged.staged.is_empty());
        assert_eq!(
            unstaged.unstaged.len(),
            1,
            "the edit must survive unstaging"
        );
    }

    #[test]
    fn discard_reverts_the_working_tree() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "original\n", "Initial commit");
        repo.write("a.txt", "modified\n");

        discard_file_changes(repo.path(), "a.txt").expect("discard");

        let contents = std::fs::read_to_string(repo.file_path("a.txt")).expect("read");
        assert_eq!(contents, "original\n");
        assert!(get_status(repo.path()).expect("status").is_clean());
    }

    #[test]
    fn discard_untracked_removes_only_the_named_file() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("junk.txt", "delete me");
        repo.write("keep.txt", "keep me");

        discard_untracked(repo.path(), "junk.txt").expect("clean");

        assert!(!repo.file_path("junk.txt").exists());
        assert!(
            repo.file_path("keep.txt").exists(),
            "clean must not cascade"
        );
    }

    #[test]
    fn stage_all_picks_up_untracked_files() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("new.txt", "hi");
        repo.write("seed.txt", "changed");

        stage_all(repo.path()).expect("stage all");

        let status = get_status(repo.path()).expect("status");
        assert_eq!(status.staged.len(), 2);
        assert!(status.untracked.is_empty());
    }
}
