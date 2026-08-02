use std::io::Write;
use std::path::Path;

use tempfile::NamedTempFile;

use super::exec::{run_git, GitError};

/// Applies a unified-diff patch to the git index (`git apply --cached`).
///
/// This allows hunk-level and line-level staging by constructing a valid patch
/// for selected hunks/lines and applying it directly to the staging area.
pub fn git_stage_hunk(repo_path: &Path, patch: &str) -> Result<(), GitError> {
    if patch.trim().is_empty() {
        return Ok(());
    }

    let mut temp_file = NamedTempFile::new().map_err(GitError::Spawn)?;
    temp_file
        .write_all(patch.as_bytes())
        .map_err(GitError::Spawn)?;
    temp_file.flush().map_err(GitError::Spawn)?;

    let temp_path = temp_file
        .path()
        .to_str()
        .ok_or_else(|| GitError::CommandFailed {
            exit_code: None,
            stderr: "Invalid temp file path".to_string(),
        })?;

    // Apply the patch to the index
    run_git(repo_path, &["apply", "--cached", temp_path])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::diff::diff_repo;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn git_stage_hunk_stages_only_the_selected_hunk() {
        let repo = FixtureRepo::new();
        let file_name = "test.txt";
        let initial_content =
            "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n";
        repo.commit(file_name, initial_content, "Initial commit");

        // Modify lines at the top and bottom to create two distinct hunks
        let modified_content = "Line 1 CHANGED\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10 CHANGED\n";
        repo.write(file_name, modified_content);

        // Verify working tree has both changes
        let full_diff = diff_repo(repo.path(), false).expect("diff working tree");
        assert!(full_diff.contains("Line 1 CHANGED"));
        assert!(full_diff.contains("Line 10 CHANGED"));

        // Construct a valid patch for ONLY the first hunk
        let patch = [
            format!("diff --git a/{file_name} b/{file_name}"),
            format!("--- a/{file_name}"),
            format!("+++ b/{file_name}"),
            "@@ -1,3 +1,3 @@".to_string(),
            "-Line 1".to_string(),
            "+Line 1 CHANGED".to_string(),
            " Line 2".to_string(),
            " Line 3".to_string(),
            "".to_string(),
        ]
        .join("\n");

        git_stage_hunk(repo.path(), &patch).expect("stage hunk");

        // Check index diff (`git diff --cached`)
        let staged_diff = diff_repo(repo.path(), true).expect("staged diff");

        // Staged diff MUST contain the first hunk change and MUST NOT contain the second hunk change
        assert!(
            staged_diff.contains("Line 1 CHANGED"),
            "staged diff must contain Line 1 CHANGED, got: {staged_diff}"
        );
        assert!(
            !staged_diff.contains("Line 10 CHANGED"),
            "staged diff must NOT contain Line 10 CHANGED, got: {staged_diff}"
        );
    }
}
