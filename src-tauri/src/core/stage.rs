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
/// `reset` rather than `restore --staged`: the latter resolves its source ref
/// eagerly and dies with "could not resolve 'HEAD'" on a repository that has no
/// commits yet. `reset` special-cases the unborn branch and unstages against the
/// empty tree instead — which matters, because staging then unstaging is exactly
/// what a user does while assembling their very first commit.
///
/// `-q` suppresses the "Unstaged changes after reset" summary; the UI reads the
/// new state from `get_status`, not from git's stdout.
pub fn unstage_file(repo_path: &Path, path: &str) -> Result<(), GitError> {
    run_git(repo_path, &["reset", "-q", "--", path])?;
    Ok(())
}

pub fn unstage_all(repo_path: &Path) -> Result<(), GitError> {
    run_git(repo_path, &["reset", "-q", "--", "."])?;
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

    #[test]
    fn unstaging_works_before_the_first_commit() {
        // The whole reason `restore --staged` is used instead of `reset HEAD --`:
        // in a repo with no commits there is no HEAD to reset against, and the
        // very first thing a new user does is stage something.
        let repo = FixtureRepo::new();
        repo.write("first.txt", "hello");
        stage_file(repo.path(), "first.txt").expect("stage");
        assert_eq!(get_status(repo.path()).expect("status").staged.len(), 1);

        unstage_file(repo.path(), "first.txt").expect("unstage must work with no HEAD");

        let status = get_status(repo.path()).expect("status");
        assert!(status.staged.is_empty());
        assert_eq!(
            status.untracked.len(),
            1,
            "the file itself must survive unstaging"
        );
    }

    #[test]
    fn unstage_all_clears_the_whole_index() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("one.txt", "1");
        repo.write("two.txt", "2");
        repo.write("nested/three.txt", "3");
        stage_all(repo.path()).expect("stage all");
        assert_eq!(get_status(repo.path()).expect("status").staged.len(), 3);

        unstage_all(repo.path()).expect("unstage all");

        let status = get_status(repo.path()).expect("status");
        assert!(status.staged.is_empty());
        assert_eq!(status.untracked.len(), 3, "nothing may be deleted");
    }

    #[test]
    fn a_path_that_looks_like_a_flag_is_staged_as_a_path() {
        // Every call here puts `--` before the path so a file named `-f` or
        // `--force` can't be reinterpreted as an option.
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("--force", "not a flag\n");

        stage_file(repo.path(), "--force").expect("stage");

        let status = get_status(repo.path()).expect("status");
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "--force");
    }

    #[test]
    fn discard_untracked_does_not_cascade_through_a_flag_named_path() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("-rf", "delete me");
        repo.write("keep.txt", "keep me");

        discard_untracked(repo.path(), "-rf").expect("clean");

        assert!(!repo.file_path("-rf").exists());
        assert!(repo.file_path("keep.txt").exists());
    }

    #[test]
    fn staging_a_directory_stages_everything_under_it() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("src/a.rs", "a");
        repo.write("src/nested/b.rs", "b");
        repo.write("outside.txt", "not part of it");

        stage_file(repo.path(), "src").expect("stage directory");

        let status = get_status(repo.path()).expect("status");
        let mut staged: Vec<&str> = status.staged.iter().map(|e| e.path.as_str()).collect();
        staged.sort_unstable();
        assert_eq!(staged, vec!["src/a.rs", "src/nested/b.rs"]);
        assert_eq!(status.untracked.len(), 1);
    }

    #[test]
    fn discarding_one_file_leaves_the_others_alone() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "a original\n", "Initial commit");
        repo.commit("b.txt", "b original\n", "Second");
        repo.write("a.txt", "a edited\n");
        repo.write("b.txt", "b edited\n");

        discard_file_changes(repo.path(), "a.txt").expect("discard");

        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "a original\n"
        );
        assert_eq!(
            std::fs::read_to_string(repo.file_path("b.txt")).expect("read"),
            "b edited\n",
            "discarding one file must not touch another"
        );
    }

    #[test]
    fn a_staged_deletion_is_recorded_as_a_deletion() {
        let repo = FixtureRepo::new();
        repo.commit("gone.txt", "bye\n", "Initial commit");
        std::fs::remove_file(repo.file_path("gone.txt")).expect("remove");

        stage_file(repo.path(), "gone.txt").expect("stage the deletion");

        let status = get_status(repo.path()).expect("status");
        assert_eq!(status.staged.len(), 1);
        assert_eq!(
            status.staged[0].kind,
            crate::core::status::ChangeKind::Deleted
        );
    }
}
