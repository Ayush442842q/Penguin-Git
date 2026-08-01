use std::path::Path;

use serde::{Deserialize, Serialize};

use super::exec::{run_git, run_git_raw, GitError};
use super::log::{parse_log, Commit};

/// Unified diff text for a single path.
///
/// `staged` selects the index-vs-HEAD diff instead of worktree-vs-index — the
/// staging UI needs both views of the same file.
pub fn diff_file(repo_path: &Path, path: &str, staged: bool) -> Result<String, GitError> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    // `--` terminates option parsing, so a file named like a flag (or a path
    // that collides with a ref name) can't be reinterpreted as one.
    args.push("--");
    args.push(path);
    run_git(repo_path, &args)
}

/// Unified diff for an entire commit.
///
/// `--first-parent` on merges keeps the output to what the merge actually
/// brought in, rather than the full combined diff against every parent.
pub fn diff_commit(repo_path: &Path, hash: &str) -> Result<String, GitError> {
    run_git(
        repo_path,
        &["show", "--no-color", "--first-parent", "--format=", hash],
    )
}

/// Diff of an untracked file against nothing, so new files preview like any other.
///
/// `--no-index` compares paths outside the index and exits 1 to mean "these
/// differ" — which is the expected outcome for every new file, not an error.
/// Hence `run_git_raw`: exit 1 with stdout is the success case here, and only a
/// code above 1 is a real failure.
pub fn diff_untracked(repo_path: &Path, path: &str) -> Result<String, GitError> {
    let output = run_git_raw(
        repo_path,
        &["diff", "--no-color", "--no-index", "--", "/dev/null", path],
    )?;

    match output.exit_code {
        Some(0) | Some(1) => Ok(output.stdout),
        exit_code => Err(GitError::CommandFailed {
            exit_code,
            stderr: output.stderr,
        }),
    }
}

/// Commits that touched `path`, following it across renames.
pub fn file_history(repo_path: &Path, path: &str, limit: usize) -> Result<Vec<Commit>, GitError> {
    let limit_arg = format!("--max-count={limit}");
    let raw = run_git(
        repo_path,
        &[
            "log",
            "--follow",
            &limit_arg,
            "--pretty=format:%H%x00%h%x00%an%x00%ae%x00%at%x00%P%x00%D%x00%s%x1e",
            "--",
            path,
        ],
    )?;
    Ok(parse_log(&raw))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub hash: String,
    pub author_name: String,
    /// Author timestamp, seconds since the Unix epoch.
    pub timestamp: i64,
    /// 1-indexed line number in the file as it exists now.
    pub line_number: usize,
    pub content: String,
    pub summary: String,
}

/// Per-line authorship for a file.
///
/// `--line-porcelain` repeats the full commit header for every line, so each
/// line is self-contained and we never have to carry state across git's
/// abbreviated repeat-blocks.
pub fn blame(repo_path: &Path, path: &str) -> Result<Vec<BlameLine>, GitError> {
    let raw = run_git(repo_path, &["blame", "--line-porcelain", "--", path])?;
    Ok(parse_blame(&raw))
}

/// Parses `git blame --line-porcelain` output.
///
/// Each line is a header block (`<hash> <orig-line> <final-line> [<count>]`,
/// then `key value` pairs) terminated by the content line, which is the only
/// line starting with a TAB.
pub fn parse_blame(raw: &str) -> Vec<BlameLine> {
    let mut lines = Vec::new();
    let mut hash = String::new();
    let mut author_name = String::new();
    let mut timestamp = 0i64;
    let mut summary = String::new();
    let mut line_number = 0usize;

    for line in raw.lines() {
        if let Some(content) = line.strip_prefix('\t') {
            lines.push(BlameLine {
                hash: std::mem::take(&mut hash),
                author_name: author_name.clone(),
                timestamp,
                line_number,
                content: content.to_string(),
                summary: summary.clone(),
            });
        } else if let Some(rest) = line.strip_prefix("author ") {
            author_name = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            timestamp = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("summary ") {
            summary = rest.to_string();
        } else if !line.starts_with(char::is_alphabetic) || is_header_line(line) {
            // Header: "<40-char hash> <orig line> <final line> [<lines in group>]"
            let mut parts = line.split(' ');
            if let (Some(h), Some(_orig), Some(final_line)) =
                (parts.next(), parts.next(), parts.next())
            {
                if h.len() == 40 && h.chars().all(|c| c.is_ascii_hexdigit()) {
                    hash = h.to_string();
                    line_number = final_line.parse().unwrap_or(0);
                }
            }
        }
    }

    lines
}

/// A blame header starts with a full 40-character hex hash.
fn is_header_line(line: &str) -> bool {
    line.len() >= 40
        && line
            .split(' ')
            .next()
            .is_some_and(|first| first.len() == 40 && first.chars().all(|c| c.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn diff_file_shows_unstaged_edits() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "original\n", "Initial commit");
        repo.write("a.txt", "changed\n");

        let diff = diff_file(repo.path(), "a.txt", false).expect("diff should succeed");

        assert!(diff.contains("-original"));
        assert!(diff.contains("+changed"));
    }

    #[test]
    fn diff_file_staged_and_unstaged_are_different_views() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "one\n", "Initial commit");
        repo.write("a.txt", "two\n");
        repo.git(&["add", "a.txt"]);
        repo.write("a.txt", "three\n");

        let staged = diff_file(repo.path(), "a.txt", true).expect("staged diff");
        let unstaged = diff_file(repo.path(), "a.txt", false).expect("unstaged diff");

        // Staged holds one->two; unstaged holds two->three.
        assert!(
            staged.contains("+two"),
            "staged diff should show the indexed change"
        );
        assert!(
            unstaged.contains("+three"),
            "unstaged diff should show the worktree change"
        );
        assert!(!unstaged.contains("+two"));
    }

    #[test]
    fn diff_commit_shows_that_commits_changes() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "first\n", "First");
        let second = repo.commit("b.txt", "second\n", "Second");

        let diff = diff_commit(repo.path(), &second).expect("show should succeed");

        assert!(diff.contains("b.txt"));
        assert!(diff.contains("+second"));
        assert!(
            !diff.contains("+first"),
            "only this commit's changes belong here"
        );
    }

    #[test]
    fn file_history_follows_a_rename() {
        let repo = FixtureRepo::new();
        repo.commit("before.txt", "stable content here\n", "Add before.txt");
        repo.git(&["mv", "before.txt", "after.txt"]);
        repo.commit_all("Rename to after.txt");

        let history = file_history(repo.path(), "after.txt", 50).expect("history should succeed");

        assert_eq!(history.len(), 2, "--follow should reach past the rename");
        assert_eq!(history[1].subject, "Add before.txt");
    }

    #[test]
    fn blame_attributes_each_line_to_its_commit() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "line one\n", "First");
        repo.write("a.txt", "line one\nline two\n");
        repo.git(&["add", "a.txt"]);
        let second = repo.commit_all("Second");

        let lines = blame(repo.path(), "a.txt").expect("blame should succeed");

        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].content, "line one");
        assert_eq!(lines[1].content, "line two");
        assert_eq!(
            lines[1].hash, second,
            "the new line belongs to the newer commit"
        );
        assert_ne!(lines[0].hash, lines[1].hash);
        assert_eq!(lines[0].line_number, 1);
        assert_eq!(lines[1].line_number, 2);
        assert_eq!(lines[1].author_name, "PenguinGit Test");
        assert_eq!(lines[1].summary, "Second");
    }

    #[test]
    fn diff_untracked_treats_exit_code_one_as_content() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "x", "Initial commit");
        repo.write("new.txt", "brand new line\n");

        // `diff --no-index` exits 1 here; if that were treated as a failure the
        // staging UI could never preview a newly added file.
        let diff = diff_untracked(repo.path(), "new.txt").expect("untracked diff should succeed");

        assert!(diff.contains("+brand new line"));
    }
}
