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
        self.write(relative_path, contents);
        // `--` so a fixture can legitimately be named `-x.txt` or `--cached`;
        // those are exactly the paths the option-injection tests need.
        run(self.dir.path(), &["add", "--", relative_path]);
        self.commit_all(message)
    }

    /// Writes `contents` to `relative_path` without staging or committing it.
    pub fn write(&self, relative_path: &str, contents: &str) {
        let target = self.file_path(relative_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("failed to create parent dirs in fixture repo");
        }
        std::fs::write(&target, contents).expect("failed to write fixture file");
    }

    /// Commits whatever is currently staged. Returns the resulting commit hash.
    ///
    /// `--allow-empty` so tests can create merge/branch topology without having
    /// to invent file changes they don't care about.
    pub fn commit_all(&self, message: &str) -> String {
        run(self.dir.path(), &["commit", "--allow-empty", "-m", message]);
        self.head()
    }

    pub fn head(&self) -> String {
        run(self.dir.path(), &["rev-parse", "HEAD"])
            .trim()
            .to_string()
    }

    /// Runs an arbitrary git command against the fixture, returning stdout.
    /// Test setup only — production code goes through `super::exec::run_git`.
    pub fn git(&self, args: &[&str]) -> String {
        run(self.dir.path(), args)
    }

    /// Adds a real remote pointing at a second bare repository, so tests can
    /// exercise upstream-tracking, ahead/behind, and fetch/push paths without
    /// touching the network. Returns the bare repo's `TempDir`, which the
    /// caller must keep alive for as long as the remote is used.
    pub fn add_bare_remote(&self, name: &str) -> TempDir {
        let bare = TempDir::new().expect("failed to create tempdir for bare remote");
        run(bare.path(), &["init", "--bare", "--initial-branch=main"]);
        let url = bare.path().to_string_lossy().to_string();
        run(self.dir.path(), &["remote", "add", name, &url]);
        bare
    }
}

/// Runs a git command in any directory — a bare remote, a second clone, a
/// plain temp dir — for tests that need to set up state outside the fixture.
///
/// Exists so `Command::new("git")` stays confined to this file and `exec.rs`;
/// `no_module_spawns_git_outside_exec` enforces that.
pub fn git_in(cwd: &Path, args: &[&str]) -> String {
    run(cwd, args)
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
