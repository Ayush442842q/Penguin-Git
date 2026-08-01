use std::path::Path;

use super::exec::{run_git, GitError};

/// Creates a commit from whatever is currently staged.
///
/// `subject` and the optional `body` are passed as separate `-m` arguments,
/// which is how git itself builds the conventional "subject, blank line, body"
/// message — safer than concatenating them by hand.
///
/// Passing the message via argv (never through a shell) means a message
/// containing quotes, newlines, or `$(...)` is inert.
pub fn commit(
    repo_path: &Path,
    subject: &str,
    body: Option<&str>,
    amend: bool,
) -> Result<String, GitError> {
    let mut args = vec!["commit", "-m", subject];
    if let Some(body) = body.filter(|b| !b.trim().is_empty()) {
        args.push("-m");
        args.push(body);
    }
    if amend {
        args.push("--amend");
    }

    run_git(repo_path, &args)?;
    Ok(run_git(repo_path, &["rev-parse", "HEAD"])?
        .trim()
        .to_string())
}

/// The message of an existing commit, for pre-filling the amend editor.
pub fn commit_message(repo_path: &Path, hash: &str) -> Result<String, GitError> {
    Ok(
        run_git(repo_path, &["log", "-1", "--pretty=format:%B", hash])?
            .trim_end()
            .to_string(),
    )
}

/// Applies a commit's changes on top of HEAD as a new commit.
pub fn cherry_pick(repo_path: &Path, hash: &str) -> Result<(), GitError> {
    run_git(repo_path, &["cherry-pick", hash])?;
    Ok(())
}

/// Creates a new commit that undoes `hash`, preserving history.
///
/// `--no-edit` keeps the generated message rather than opening an editor that
/// would block on a GUI with no terminal attached.
pub fn revert(repo_path: &Path, hash: &str) -> Result<(), GitError> {
    run_git(repo_path, &["revert", "--no-edit", hash])?;
    Ok(())
}

/// How far a reset rewinds the working tree and index along with HEAD.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetMode {
    /// Move HEAD only; changes stay staged.
    Soft,
    /// Move HEAD and reset the index; changes stay in the working tree.
    Mixed,
    /// Move HEAD, index, and working tree. Destroys uncommitted work.
    Hard,
}

impl ResetMode {
    fn as_flag(self) -> &'static str {
        match self {
            Self::Soft => "--soft",
            Self::Mixed => "--mixed",
            Self::Hard => "--hard",
        }
    }

    /// Parses the mode name sent from the frontend.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "soft" => Some(Self::Soft),
            "mixed" => Some(Self::Mixed),
            "hard" => Some(Self::Hard),
            _ => None,
        }
    }
}

/// Moves the current branch to `hash`.
///
/// `ResetMode::Hard` discards uncommitted work irreversibly; the caller must
/// confirm intent before selecting it.
pub fn reset(repo_path: &Path, hash: &str, mode: ResetMode) -> Result<(), GitError> {
    run_git(repo_path, &["reset", mode.as_flag(), hash])?;
    Ok(())
}

/// Creates a lightweight or annotated tag at `hash`.
pub fn create_tag(
    repo_path: &Path,
    name: &str,
    hash: &str,
    message: Option<&str>,
) -> Result<(), GitError> {
    match message.filter(|m| !m.trim().is_empty()) {
        Some(message) => run_git(repo_path, &["tag", "-a", name, "-m", message, hash])?,
        None => run_git(repo_path, &["tag", name, hash])?,
    };
    Ok(())
}

pub fn delete_tag(repo_path: &Path, name: &str) -> Result<(), GitError> {
    run_git(repo_path, &["tag", "-d", name])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::log::get_log;
    use crate::core::status::get_status;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn commit_creates_a_commit_from_the_index() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("a.txt", "hello");
        repo.git(&["add", "a.txt"]);

        let hash = commit(repo.path(), "Add a.txt", None, false).expect("commit should succeed");

        assert_eq!(hash, repo.head());
        assert!(get_status(repo.path()).expect("status").is_clean());
    }

    #[test]
    fn commit_with_body_produces_subject_blank_line_body() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("a.txt", "hello");
        repo.git(&["add", "a.txt"]);

        let hash = commit(
            repo.path(),
            "Short subject",
            Some("A longer explanation."),
            false,
        )
        .expect("commit");

        let message = commit_message(repo.path(), &hash).expect("message");
        assert_eq!(message, "Short subject\n\nA longer explanation.");
    }

    #[test]
    fn commit_message_containing_shell_metacharacters_is_inert() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("a.txt", "hello");
        repo.git(&["add", "a.txt"]);

        // Passed through argv, never a shell — so this is just text.
        let nasty = "fix: $(touch pwned) && `whoami`; \"quoted\"";
        let hash = commit(repo.path(), nasty, None, false).expect("commit");

        assert_eq!(commit_message(repo.path(), &hash).expect("message"), nasty);
        assert!(
            !repo.file_path("pwned").exists(),
            "no subshell should have run"
        );
    }

    #[test]
    fn amend_replaces_the_previous_commit() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "x", "Original message");

        commit(repo.path(), "Corrected message", None, true).expect("amend");

        let log = get_log(repo.path(), 10).expect("log");
        assert_eq!(log.len(), 1, "amend must replace, not add");
        assert_eq!(log[0].subject, "Corrected message");
    }

    #[test]
    fn revert_adds_an_inverse_commit() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "keep\n", "First");
        let second = repo.commit("b.txt", "remove\n", "Second");

        revert(repo.path(), &second).expect("revert");

        assert!(
            !repo.file_path("b.txt").exists(),
            "the revert should remove b.txt"
        );
        assert_eq!(
            get_log(repo.path(), 10).expect("log").len(),
            3,
            "history is preserved"
        );
    }

    #[test]
    fn reset_modes_differ_in_what_they_keep() {
        // Soft keeps the change staged.
        let repo = FixtureRepo::new();
        let base = repo.commit("a.txt", "one\n", "First");
        repo.commit("a.txt", "two\n", "Second");
        reset(repo.path(), &base, ResetMode::Soft).expect("soft reset");
        let status = get_status(repo.path()).expect("status");
        assert_eq!(status.staged.len(), 1, "soft reset keeps changes staged");

        // Hard discards it entirely.
        let repo = FixtureRepo::new();
        let base = repo.commit("a.txt", "one\n", "First");
        repo.commit("a.txt", "two\n", "Second");
        reset(repo.path(), &base, ResetMode::Hard).expect("hard reset");
        assert!(get_status(repo.path()).expect("status").is_clean());
        assert_eq!(
            std::fs::read_to_string(repo.file_path("a.txt")).expect("read"),
            "one\n"
        );
    }

    #[test]
    fn cherry_pick_copies_a_commit_onto_the_current_branch() {
        let repo = FixtureRepo::new();
        repo.commit("base.txt", "base\n", "Base");
        repo.git(&["checkout", "-b", "side"]);
        let side = repo.commit("side.txt", "side\n", "Side work");
        repo.git(&["checkout", "main"]);

        cherry_pick(repo.path(), &side).expect("cherry-pick");

        assert!(repo.file_path("side.txt").exists());
        assert_eq!(
            get_log(repo.path(), 10).expect("log")[0].subject,
            "Side work"
        );
    }

    #[test]
    fn tags_can_be_created_and_deleted() {
        let repo = FixtureRepo::new();
        let hash = repo.commit("a.txt", "x", "First");

        create_tag(repo.path(), "v1.0.0", &hash, Some("First release")).expect("tag");
        assert!(repo.git(&["tag", "--list"]).contains("v1.0.0"));

        delete_tag(repo.path(), "v1.0.0").expect("delete tag");
        assert!(!repo.git(&["tag", "--list"]).contains("v1.0.0"));
    }

    #[test]
    fn reset_mode_parses_frontend_values() {
        assert_eq!(ResetMode::parse("soft"), Some(ResetMode::Soft));
        assert_eq!(ResetMode::parse("mixed"), Some(ResetMode::Mixed));
        assert_eq!(ResetMode::parse("hard"), Some(ResetMode::Hard));
        assert_eq!(ResetMode::parse("nonsense"), None);
    }
}
