use std::path::Path;
use std::process::Command;

/// The single place in the whole codebase allowed to spawn a `git` subprocess.
/// Every git operation added in later phases must go through this function —
/// never call `std::process::Command::new("git")` anywhere else.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("failed to execute git: {0}")]
    Spawn(#[from] std::io::Error),

    #[error("git command failed (exit code {exit_code:?}): {stderr}")]
    CommandFailed {
        exit_code: Option<i32>,
        stderr: String,
    },

    #[error("git produced invalid UTF-8 output: {0}")]
    InvalidUtf8(#[from] std::string::FromUtf8Error),
}

/// Runs `git <args>` in `cwd` and returns stdout on success.
///
/// On a non-zero exit code, returns `GitError::CommandFailed` carrying the
/// process's exit code and trimmed stderr — callers should not need to
/// re-parse stderr text to distinguish failure modes; add a more specific
/// variant here if a later phase needs to branch on a particular git error.
pub fn run_git(cwd: &Path, args: &[&str]) -> Result<String, GitError> {
    let output = Command::new("git").current_dir(cwd).args(args).output()?;

    if output.status.success() {
        Ok(String::from_utf8(output.stdout)?)
    } else {
        Err(GitError::CommandFailed {
            exit_code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn run_git_version_succeeds() {
        let repo = FixtureRepo::new();
        let out = run_git(repo.path(), &["--version"]).expect("git --version should succeed");
        assert!(out.starts_with("git version"));
    }

    #[test]
    fn run_git_reports_failure_with_stderr() {
        let repo = FixtureRepo::new();
        let err = run_git(repo.path(), &["not-a-real-git-command"])
            .expect_err("an invalid git subcommand should fail");
        match err {
            GitError::CommandFailed { stderr, .. } => {
                assert!(!stderr.is_empty(), "stderr should be captured on failure");
            }
            other => panic!("expected CommandFailed, got {other:?}"),
        }
    }

    #[test]
    fn run_git_log_on_fixture_repo() {
        let repo = FixtureRepo::new();
        repo.commit("first.txt", "hello", "Initial commit");
        let out = run_git(repo.path(), &["log", "--oneline"]).expect("log should succeed");
        assert!(out.contains("Initial commit"));
    }
}
