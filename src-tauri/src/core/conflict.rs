use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::core::exec::{run_git, run_git_raw, run_git_raw_with_env, GitError};
use crate::core::merge_state::OperationKind;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conflict3Way {
    pub path: String,
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub has_base: bool,
    pub has_ours: bool,
    pub has_theirs: bool,
}

/// Reads the three index stages (`:1:<path>` base, `:2:<path>` ours, `:3:<path>` theirs) for a conflicted file.
/// If a stage does not exist in the index (e.g. file created on one side or deleted on another), it returns an empty string with its corresponding `has_*` flag set to false.
pub fn read_conflict_stages(cwd: &Path, relative_path: &str) -> Result<Conflict3Way, GitError> {
    let fetch_stage = |stage_num: u8| -> (String, bool) {
        let target = format!(":{stage_num}:{relative_path}");
        match run_git_raw(cwd, &["show", &target]) {
            Ok(out) if out.success() => (out.stdout, true),
            _ => (String::new(), false),
        }
    };

    let (base, has_base) = fetch_stage(1);
    let (ours, has_ours) = fetch_stage(2);
    let (theirs, has_theirs) = fetch_stage(3);

    Ok(Conflict3Way {
        path: relative_path.to_string(),
        base,
        ours,
        theirs,
        has_base,
        has_ours,
        has_theirs,
    })
}

/// Normalizes a path by logically resolving `.` (current directory) and `..` (parent directory)
/// path components without accessing the filesystem.
pub fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::Prefix(..) | Component::RootDir => {
                components.clear();
                components.push(component);
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if let Some(last) = components.last() {
                    match last {
                        Component::Normal(..) => {
                            components.pop();
                        }
                        Component::RootDir => {}
                        _ => {
                            components.push(component);
                        }
                    }
                } else {
                    components.push(component);
                }
            }
            Component::Normal(..) => {
                components.push(component);
            }
        }
    }
    components.into_iter().collect()
}

/// Resolves a merge conflict for a path by writing the merged `content` to the working tree file
/// AND immediately running `git add -- <path>` to stage the resolution.
pub fn resolve_conflict(cwd: &Path, relative_path: &str, content: &str) -> Result<(), GitError> {
    let rel_path = Path::new(relative_path);
    if rel_path.is_absolute() {
        return Err(GitError::CommandFailed {
            exit_code: None,
            stderr: format!("path traversal rejected: path {relative_path:?} is absolute"),
        });
    }

    let canonical_cwd = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let full_path = cwd.join(rel_path);
    let normalized_full_path = normalize_path(&canonical_cwd.join(rel_path));

    if !normalized_full_path.starts_with(&canonical_cwd) {
        return Err(GitError::CommandFailed {
            exit_code: None,
            stderr: format!(
                "path traversal rejected: path {relative_path:?} escapes working directory"
            ),
        });
    }

    // Check parent directory canonical path if it exists on disk
    if let Some(parent) = full_path.parent() {
        if parent.exists() {
            if let Ok(canonical_parent) = parent.canonicalize() {
                if !canonical_parent.starts_with(&canonical_cwd) {
                    return Err(GitError::CommandFailed {
                        exit_code: None,
                        stderr: format!(
                            "path traversal rejected: path {relative_path:?} escapes working directory"
                        ),
                    });
                }
            }
        }
    }

    // Create parent directories if needed
    if let Some(parent) = full_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(GitError::Spawn)?;
        }
    }

    // Write resolved content to disk
    fs::write(&full_path, content).map_err(GitError::Spawn)?;

    // Stage the file with git add
    run_git(cwd, &["add", "--", relative_path])?;

    Ok(())
}

/// Continues an in-progress operation (Merge, Rebase, CherryPick, Revert).
pub fn continue_operation(cwd: &Path, op: OperationKind) -> Result<String, GitError> {
    let args = match op {
        OperationKind::Merge => vec!["merge", "--continue"],
        OperationKind::Rebase => vec!["rebase", "--continue"],
        OperationKind::CherryPick => vec!["cherry-pick", "--continue"],
        OperationKind::Revert => vec!["revert", "--continue"],
    };

    let true_os = std::ffi::OsStr::new("true");
    let out = run_git_raw_with_env(cwd, &args, &[("GIT_EDITOR", true_os)])?;

    if out.success() {
        Ok(out.stdout)
    } else {
        Err(GitError::CommandFailed {
            exit_code: out.exit_code,
            stderr: out.stderr,
        })
    }
}

/// Aborts an in-progress operation.
pub fn abort_operation(cwd: &Path, op: OperationKind) -> Result<String, GitError> {
    let args = match op {
        OperationKind::Merge => vec!["merge", "--abort"],
        OperationKind::Rebase => vec!["rebase", "--abort"],
        OperationKind::CherryPick => vec!["cherry-pick", "--abort"],
        OperationKind::Revert => vec!["revert", "--abort"],
    };

    run_git(cwd, &args)
}

/// Skips current patch in a rebase operation.
pub fn skip_rebase(cwd: &Path) -> Result<String, GitError> {
    run_git(cwd, &["rebase", "--skip"])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::merge_state::detect_operation_state;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn read_write_and_stage_conflict_resolution() {
        let repo = FixtureRepo::new();
        repo.commit("conflict.txt", "base content\n", "initial");
        repo.git(&["branch", "feature"]);

        repo.commit("conflict.txt", "ours content\n", "main update");
        repo.git(&["checkout", "feature"]);
        repo.commit("conflict.txt", "theirs content\n", "feature update");
        repo.git(&["checkout", "main"]);

        // Trigger merge conflict
        let _ = run_git_raw(repo.path(), &["merge", "feature"]);

        // Read 3-way stages
        let stages = read_conflict_stages(repo.path(), "conflict.txt").expect("read 3-way stages");
        assert!(stages.has_base && stages.base.contains("base content"));
        assert!(stages.has_ours && stages.ours.contains("ours content"));
        assert!(stages.has_theirs && stages.theirs.contains("theirs content"));

        // Resolve conflict
        resolve_conflict(repo.path(), "conflict.txt", "resolved content\n")
            .expect("resolve conflict");

        // Verify file on disk
        let disk_content = std::fs::read_to_string(repo.file_path("conflict.txt")).unwrap();
        assert_eq!(disk_content, "resolved content\n");

        // Verify git status shows file is staged (no longer unmerged)
        let status = repo.git(&["status", "--porcelain"]);
        assert!(status.starts_with("M  conflict.txt"));

        // Continue merge
        let op_state = detect_operation_state(repo.path());
        assert_eq!(op_state.kind, Some(OperationKind::Merge));
        assert!(op_state.conflicted_paths.is_empty());

        let res = continue_operation(repo.path(), OperationKind::Merge).expect("continue merge");
        assert!(res.contains("Merge") || res.is_empty());

        // Verify MERGE_HEAD is gone
        let final_state = detect_operation_state(repo.path());
        assert_eq!(final_state.kind, None);
    }

    #[test]
    fn resolve_conflict_rejects_path_traversal() {
        let repo = FixtureRepo::new();
        repo.commit("conflict.txt", "base content\n", "initial");

        // Attempt path traversal with ../
        let res = resolve_conflict(repo.path(), "../../outside.txt", "malicious content");
        assert!(
            res.is_err(),
            "resolve_conflict must reject paths escaping working directory"
        );
        match res.unwrap_err() {
            GitError::CommandFailed { stderr, .. } => {
                assert!(stderr.contains("path traversal rejected"));
            }
            other => panic!("expected CommandFailed, got {other:?}"),
        }

        // Attempt path traversal with absolute path
        let abs_path = if cfg!(windows) {
            "C:\\Windows\\System32\\pwned.txt"
        } else {
            "/tmp/pwned.txt"
        };
        let res_abs = resolve_conflict(repo.path(), abs_path, "malicious content");
        assert!(
            res_abs.is_err(),
            "resolve_conflict must reject absolute paths"
        );
        match res_abs.unwrap_err() {
            GitError::CommandFailed { stderr, .. } => {
                assert!(stderr.contains("path traversal rejected"));
            }
            other => panic!("expected CommandFailed, got {other:?}"),
        }
    }

    #[test]
    fn resolve_conflict_allows_valid_subdirectories() {
        let repo = FixtureRepo::new();
        repo.commit("seed.txt", "init", "initial");

        // Resolving a conflict in a new nested directory inside repo
        resolve_conflict(repo.path(), "nested/dir/conflict.txt", "resolved content\n")
            .expect("resolve_conflict inside working directory should succeed");

        let disk_content =
            std::fs::read_to_string(repo.file_path("nested/dir/conflict.txt")).unwrap();
        assert_eq!(disk_content, "resolved content\n");

        // Resolving a path with normalized .. staying inside repo
        resolve_conflict(repo.path(), "nested/../safe.txt", "safe content\n").expect(
            "resolve_conflict with normalized path staying inside working directory should succeed",
        );

        let disk_content_safe = std::fs::read_to_string(repo.file_path("safe.txt")).unwrap();
        assert_eq!(disk_content_safe, "safe content\n");
    }
}
