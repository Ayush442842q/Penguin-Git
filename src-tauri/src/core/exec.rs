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

/// A completed git invocation, including runs that exited non-zero.
#[derive(Debug, Clone)]
pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

impl GitOutput {
    pub fn success(&self) -> bool {
        self.exit_code == Some(0)
    }
}

/// Runs `git <args>` in `cwd` and returns stdout on success.
///
/// On a non-zero exit code, returns `GitError::CommandFailed` carrying the
/// process's exit code and trimmed stderr — callers should not need to
/// re-parse stderr text to distinguish failure modes; add a more specific
/// variant here if a later phase needs to branch on a particular git error.
pub fn run_git(cwd: &Path, args: &[&str]) -> Result<String, GitError> {
    let output = run_git_raw(cwd, args)?;

    if output.success() {
        Ok(output.stdout)
    } else {
        Err(GitError::CommandFailed {
            exit_code: output.exit_code,
            stderr: output.stderr,
        })
    }
}

/// Runs `git <args>` and hands back the result whatever the exit code.
///
/// For the subcommands where a non-zero exit is a *result* rather than a
/// failure — `diff` with `--exit-code`/`--no-index` exits 1 to mean "there are
/// differences", `merge` exits 1 on conflicts — and stdout still matters. Both
/// this and [`run_git`] funnel through the one `Command::new("git")` below, so
/// git invocation stays auditable in a single place.
pub fn run_git_raw(cwd: &Path, args: &[&str]) -> Result<GitOutput, GitError> {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args)
        // A GUI has no terminal for git to prompt on. Left to its own devices,
        // git blocks forever waiting for a username, a password, or an SSH
        // passphrase, and the Tauri command never returns — the window just
        // hangs with no way to recover. Failing fast turns that into an error
        // the UI can show. Credential *helpers* (libsecret, store, osxkeychain)
        // are unaffected; only interactive prompting is disabled.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        // Stops ssh reaching for a graphical passphrase prompt. Deliberately
        // *not* `GIT_SSH_COMMAND`: that environment variable takes precedence
        // over the user's `core.sshCommand`, so forcing `ssh -oBatchMode=yes`
        // would silently discard a configured wrapper, proxy command, chosen
        // identity file, or non-OpenSSH client — breaking the very thing this
        // project promises to respect. Enforcing non-interactivity is enough;
        // replacing the transport is not ours to do. With no controlling
        // terminal and no askpass, ssh fails fast rather than hanging.
        .env("SSH_ASKPASS", "")
        .env("SSH_ASKPASS_REQUIRE", "never")
        .output()?;

    Ok(GitOutput {
        // Diff and blame output can carry non-UTF-8 bytes from binary or
        // legacy-encoded files; lossy conversion keeps those readable instead
        // of failing the whole operation.
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        exit_code: output.status.code(),
    })
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
    fn a_configured_ssh_command_is_left_intact() {
        // The whole point of shelling out to system git is that the user's own
        // configuration keeps working. Overriding `core.sshCommand` — which is
        // what setting `GIT_SSH_COMMAND` would do — silently breaks custom keys,
        // proxy commands, and non-OpenSSH clients.
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Initial commit");
        repo.git(&["config", "core.sshCommand", "/usr/bin/my-custom-ssh -v"]);

        let configured = run_git(repo.path(), &["config", "--get", "core.sshCommand"])
            .expect("reading the config back should succeed");

        assert_eq!(configured.trim(), "/usr/bin/my-custom-ssh -v");
    }

    #[test]
    fn run_git_log_on_fixture_repo() {
        let repo = FixtureRepo::new();
        repo.commit("first.txt", "hello", "Initial commit");
        let out = run_git(repo.path(), &["log", "--oneline"]).expect("log should succeed");
        assert!(out.contains("Initial commit"));
    }

    #[test]
    fn run_git_failure_carries_the_exit_code() {
        let repo = FixtureRepo::new();
        // `rev-parse` on a ref that doesn't exist exits 128, not 1 — callers that
        // branch on failure mode need the number, not just "it failed".
        let err = run_git(repo.path(), &["rev-parse", "--verify", "no-such-ref"])
            .expect_err("an unknown ref should fail");
        match err {
            GitError::CommandFailed { exit_code, .. } => {
                assert_eq!(exit_code, Some(128));
            }
            other => panic!("expected CommandFailed, got {other:?}"),
        }
    }

    #[test]
    fn run_git_raw_hands_back_a_non_zero_exit_instead_of_erroring() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "one\n", "Initial commit");
        repo.write("a.txt", "two\n");

        // `diff --exit-code` exits 1 to mean "there are differences" — a result,
        // not a failure. `run_git` would turn that into an error and throw the
        // diff away; `run_git_raw` is what keeps both.
        let output = run_git_raw(repo.path(), &["diff", "--exit-code", "--no-color"])
            .expect("spawning git should succeed even when git exits non-zero");

        assert_eq!(output.exit_code, Some(1));
        assert!(!output.success());
        assert!(
            output.stdout.contains("+two"),
            "stdout must survive a non-zero exit, got: {}",
            output.stdout
        );
    }

    #[test]
    fn git_output_reports_success_only_for_exit_zero() {
        let base = GitOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: Some(0),
        };
        assert!(base.success());
        assert!(!GitOutput {
            exit_code: Some(1),
            ..base.clone()
        }
        .success());
        assert!(
            !GitOutput {
                exit_code: None,
                ..base
            }
            .success(),
            "a process killed by a signal has no exit code and is not a success"
        );
    }

    #[test]
    fn non_utf8_output_is_read_lossily_rather_than_failing() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        // Latin-1 bytes: valid in a real file, invalid as UTF-8. A diff viewer
        // that errors out on legacy-encoded files is useless.
        std::fs::write(repo.file_path("legacy.txt"), [0xC0, 0xC1, 0xFF, b'\n'])
            .expect("write raw bytes");
        repo.git(&["add", "legacy.txt"]);

        let output = run_git_raw(repo.path(), &["diff", "--cached", "--no-color"])
            .expect("a diff containing invalid UTF-8 must not fail the whole operation");

        assert!(output.success());
        assert!(output.stdout.contains("legacy.txt"));
    }

    #[test]
    fn interactive_prompting_is_disabled_in_the_child_environment() {
        // A `!` alias runs through the shell, which is the only way to observe
        // the environment git actually hands its children. Without this, a
        // credential prompt would block the GUI forever with no terminal to
        // answer on — the hang has no recovery path from the UI.
        let repo = FixtureRepo::new();
        let probe = run_git(
            repo.path(),
            &[
                "-c",
                "alias.probe=!echo prompt=$GIT_TERMINAL_PROMPT askpass=[$GIT_ASKPASS] ssh=[$SSH_ASKPASS_REQUIRE]",
                "probe",
            ],
        )
        .expect("alias probe should run");

        assert!(
            probe.contains("prompt=0"),
            "GIT_TERMINAL_PROMPT must be 0, got: {probe}"
        );
        assert!(
            probe.contains("askpass=[]"),
            "GIT_ASKPASS must be blanked, got: {probe}"
        );
        assert!(
            probe.contains("ssh=[never]"),
            "SSH_ASKPASS_REQUIRE must be never, got: {probe}"
        );
        assert!(
            !probe.contains("GIT_SSH_COMMAND"),
            "GIT_SSH_COMMAND must never be set — it overrides core.sshCommand"
        );
    }
}
