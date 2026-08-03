//! Patch generation and application for file-based sharing.
//!
//! "Share via file" — export a `.patch` from `git format-patch` or `git diff`,
//! import one via `git apply` or `git am`, all fully offline. The cloud-sharing
//! path (sub-scope B) is an optional layer on top; this local path is always
//! available as a permanent fallback.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::branch::reject_option_like;
use super::exec::{run_git, run_git_raw_with_stdin, run_git_with_stdin, GitError};

/// Metadata returned alongside exported patch content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchExport {
    /// The raw patch text (suitable for writing to a `.patch` file).
    pub content: String,
    /// A suggested filename derived from the commit subject or range.
    pub suggested_name: String,
}

/// Preview information for a patch about to be imported.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPreview {
    /// Human-readable summary of what the patch would change (`git apply --stat`).
    pub stat: String,
    /// The raw patch text for display in DiffViewer.
    pub diff_text: String,
    /// Whether `git apply --check` says the patch applies cleanly.
    pub applies_cleanly: bool,
    /// If the patch doesn't apply cleanly, the error message.
    pub check_error: Option<String>,
}

/// Generates patch content for export.
///
/// - If `commit_range` is `Some("HEAD~3..HEAD")` or similar, uses
///   `git format-patch --stdout` to produce email-formatted patches.
/// - If `commit_range` is `None`, exports the current working-tree diff
///   (unstaged + staged combined).
pub fn export_patch(repo_path: &Path, commit_range: Option<&str>) -> Result<PatchExport, GitError> {
    match commit_range {
        Some(range) => {
            reject_option_like(range)?;
            let content = run_git(repo_path, &["format-patch", "--stdout", range])?;
            let suggested = sanitize_filename(range);
            Ok(PatchExport {
                content,
                suggested_name: format!("{suggested}.patch"),
            })
        }
        None => {
            // Combine staged + unstaged into one diff.
            let content = run_git(repo_path, &["diff", "--no-color", "HEAD"])?;
            let repo_name = repo_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "patch".to_string());
            Ok(PatchExport {
                content,
                suggested_name: format!("{repo_name}-changes.patch"),
            })
        }
    }
}

/// Previews a patch: runs `git apply --stat` and `git apply --check` to report
/// what would change and whether it applies cleanly, without modifying files.
pub fn preview_patch(repo_path: &Path, patch_content: &str) -> Result<PatchPreview, GitError> {
    let stat_output =
        run_git_raw_with_stdin(repo_path, &["apply", "--stat"], patch_content.as_bytes())?;

    let check_output =
        run_git_raw_with_stdin(repo_path, &["apply", "--check"], patch_content.as_bytes())?;

    Ok(PatchPreview {
        stat: stat_output.stdout,
        diff_text: patch_content.to_string(),
        applies_cleanly: check_output.success(),
        check_error: if check_output.success() {
            None
        } else {
            Some(check_output.stderr)
        },
    })
}

/// Applies a patch to the working tree.
///
/// Tries `git am` first (handles `format-patch` output with commit metadata);
/// falls back to `git apply` for plain diffs.
pub fn apply_patch(repo_path: &Path, patch_content: &str) -> Result<String, GitError> {
    // Try `git am` first — it understands email-formatted patches produced by
    // `format-patch` and creates commits with the original author/message.
    let am_result = run_git_raw_with_stdin(repo_path, &["am", "--3way"], patch_content.as_bytes())?;

    if am_result.success() {
        return Ok("Patch applied and committed via git am.".to_string());
    }

    // `git am` failed — abort the in-progress am to restore clean state, then
    // fall back to `git apply` which applies the diff without committing.
    let _ = run_git(repo_path, &["am", "--abort"]);

    run_git_with_stdin(repo_path, &["apply"], patch_content.as_bytes())?;

    Ok("Patch applied to working tree via git apply.".to_string())
}

/// Turns a commit range string into a safe filename component.
fn sanitize_filename(input: &str) -> String {
    input
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn export_patch_with_commit_range() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "v1\n", "First commit");
        repo.commit("a.txt", "v2\n", "Second commit");

        let patch = export_patch(repo.path(), Some("HEAD~1..HEAD")).expect("export should succeed");

        assert!(patch.content.contains("Second commit"));
        assert!(patch.content.contains("+v2"));
        assert!(patch.suggested_name.ends_with(".patch"));
    }

    #[test]
    fn export_patch_working_tree_changes() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "original\n", "Initial commit");
        repo.write("a.txt", "modified\n");

        let patch = export_patch(repo.path(), None).expect("export should succeed");

        assert!(patch.content.contains("+modified"));
        assert!(patch.suggested_name.ends_with("-changes.patch"));
    }

    #[test]
    fn preview_patch_reports_clean_application() {
        let repo = FixtureRepo::new();
        let _sha = repo.commit("a.txt", "v1\n", "First commit");
        repo.commit("a.txt", "v2\n", "Second commit");

        let patch = export_patch(repo.path(), Some("HEAD~1..HEAD")).unwrap();

        // Reset to before the change so the patch can apply.
        repo.git(&["reset", "--hard", "HEAD~1"]);

        let preview = preview_patch(repo.path(), &patch.content).expect("preview should succeed");

        assert!(preview.applies_cleanly);
        assert!(preview.check_error.is_none());
        assert!(!preview.stat.is_empty());
    }

    #[test]
    fn preview_patch_reports_failure_for_already_applied() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "v1\n", "First commit");
        repo.commit("a.txt", "v2\n", "Second commit");

        let patch = export_patch(repo.path(), Some("HEAD~1..HEAD")).unwrap();

        // Don't reset — the change is already applied, so applying again fails.
        let preview = preview_patch(repo.path(), &patch.content)
            .expect("preview should succeed even when patch doesn't apply");

        assert!(!preview.applies_cleanly);
        assert!(preview.check_error.is_some());
    }

    #[test]
    fn apply_patch_round_trip_via_format_patch() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "v1\n", "First commit");
        repo.commit("b.txt", "hello\n", "Add b.txt");

        let patch = export_patch(repo.path(), Some("HEAD~1..HEAD")).unwrap();

        // Reset to before the change.
        repo.git(&["reset", "--hard", "HEAD~1"]);

        let result = apply_patch(repo.path(), &patch.content).expect("apply should succeed");

        assert!(result.contains("git am"));

        // Verify the file was actually created.
        let content = std::fs::read_to_string(repo.file_path("b.txt"))
            .expect("b.txt should exist after applying patch");
        assert_eq!(content, "hello\n");
    }

    #[test]
    fn apply_patch_falls_back_to_git_apply_for_plain_diff() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "original\n", "Initial commit");

        // Create a plain diff (not format-patch).
        repo.write("a.txt", "modified\n");
        let patch_content = run_git(repo.path(), &["diff", "--no-color"]).unwrap();
        repo.git(&["checkout", "--", "a.txt"]);

        let result =
            apply_patch(repo.path(), &patch_content).expect("apply should succeed via fallback");

        assert!(result.contains("git apply"));

        let content = std::fs::read_to_string(repo.file_path("a.txt")).unwrap();
        assert_eq!(content, "modified\n");
    }

    #[test]
    fn sanitize_filename_removes_special_chars() {
        assert_eq!(sanitize_filename("HEAD~3..HEAD"), "HEAD_3__HEAD");
        assert_eq!(sanitize_filename("main"), "main");
        assert_eq!(sanitize_filename("v1.0..v2.0"), "v1_0__v2_0");
    }

    #[test]
    fn export_patch_refuses_option_like_commit_range() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "v1\n", "First commit");
        repo.commit("a.txt", "v2\n", "Second commit");

        for range in ["--all", "-o", "--output-directory=/tmp", "-1"] {
            let err = export_patch(repo.path(), Some(range))
                .expect_err("option-like range must be rejected");
            assert!(
                err.to_string().contains("refusing to pass"),
                "expected rejection error for range {range:?}, got: {err}"
            );
        }
    }
}
