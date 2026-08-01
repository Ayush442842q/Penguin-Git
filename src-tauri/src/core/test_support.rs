use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

use tempfile::TempDir;

/// A throwaway git repository in a temp directory, for use by any test in this
/// crate that needs to exercise real git behavior. Reused across every phase's
/// git-wrapping tests — extend this helper rather than hand-rolling `git init`
/// setup in individual test modules.
pub struct FixtureRepo {
    dir: TempDir,
}

impl Default for FixtureRepo {
    fn default() -> Self {
        Self::new()
    }
}

impl FixtureRepo {
    /// Creates a new empty repo with a committer identity configured, so
    /// `git commit` works without relying on the host's global git config.
    pub fn new() -> Self {
        let dir = TempDir::new().expect("failed to create tempdir for fixture repo");
        run(dir.path(), &["init", "--initial-branch=main"]);
        run(dir.path(), &["config", "user.name", "PenguinGit Test"]);
        run(
            dir.path(),
            &["config", "user.email", "test@penguingit.invalid"],
        );
        Self { dir }
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    pub fn file_path(&self, relative: &str) -> PathBuf {
        self.dir.path().join(relative)
    }

    /// Writes `contents` to `relative_path`, stages it, and commits it with
    /// `message`. Returns the resulting commit hash.
    pub fn commit(&self, relative_path: &str, contents: &str, message: &str) -> String {
        let target = self.file_path(relative_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("failed to create parent dirs in fixture repo");
        }
        std::fs::write(&target, contents).expect("failed to write fixture file");
        run(self.dir.path(), &["add", relative_path]);
        run(self.dir.path(), &["commit", "-m", message]);
        run(self.dir.path(), &["rev-parse", "HEAD"])
            .trim()
            .to_string()
    }
}

/// Runs a git command against `cwd` and panics on failure — test setup only,
/// production code must go through `super::exec::run_git` instead.
fn run(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .output()
        .unwrap_or_else(|e| panic!("failed to spawn git {args:?}: {e}"));

    if !output.status.success() {
        panic!(
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    String::from_utf8(output.stdout).expect("git produced invalid UTF-8 in fixture setup")
}
