use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::core::exec::run_git;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OperationKind {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoOperationState {
    pub kind: Option<OperationKind>,
    pub head_name: Option<String>,
    pub onto: Option<String>,
    pub conflicted_paths: Vec<String>,
}

impl RepoOperationState {
    pub fn none() -> Self {
        Self {
            kind: None,
            head_name: None,
            onto: None,
            conflicted_paths: Vec::new(),
        }
    }

    pub fn is_in_progress(&self) -> bool {
        self.kind.is_some()
    }
}

/// Resolves the absolute path to the `.git` directory for `cwd`.
pub fn resolve_git_dir(cwd: &Path) -> Option<PathBuf> {
    let output = run_git(cwd, &["rev-parse", "--git-dir"]).ok()?;
    let path_str = output.trim();
    if path_str.is_empty() {
        return None;
    }
    let p = Path::new(path_str);
    if p.is_absolute() {
        Some(p.to_path_buf())
    } else {
        Some(cwd.join(p))
    }
}

/// Lists paths currently in conflict (`diff-filter=U`).
pub fn get_conflicted_paths(cwd: &Path) -> Vec<String> {
    match run_git(cwd, &["diff", "--name-only", "--diff-filter=U"]) {
        Ok(out) => out
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        Err(_) => Vec::new(),
    }
}

/// Inspects repository state to detect in-progress git operations (Merge, Rebase, CherryPick, Revert).
pub fn detect_operation_state(cwd: &Path) -> RepoOperationState {
    let git_dir = match resolve_git_dir(cwd) {
        Some(d) => d,
        None => return RepoOperationState::none(),
    };

    let conflicted_paths = get_conflicted_paths(cwd);

    if git_dir.join("MERGE_HEAD").exists() {
        let head_name = run_git(cwd, &["fmt-merge-msg"])
            .ok()
            .and_then(|msg| msg.lines().next().map(|s| s.trim().to_string()));

        return RepoOperationState {
            kind: Some(OperationKind::Merge),
            head_name,
            onto: None,
            conflicted_paths,
        };
    }

    let rebase_merge = git_dir.join("rebase-merge");
    let rebase_apply = git_dir.join("rebase-apply");

    if rebase_merge.exists() || rebase_apply.exists() {
        let onto = if rebase_merge.exists() {
            std::fs::read_to_string(rebase_merge.join("onto"))
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            std::fs::read_to_string(rebase_apply.join("onto"))
                .ok()
                .map(|s| s.trim().to_string())
        };

        let head_name = if rebase_merge.exists() {
            std::fs::read_to_string(rebase_merge.join("head-name"))
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            std::fs::read_to_string(rebase_apply.join("head-name"))
                .ok()
                .map(|s| s.trim().to_string())
        };

        return RepoOperationState {
            kind: Some(OperationKind::Rebase),
            head_name,
            onto,
            conflicted_paths,
        };
    }

    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return RepoOperationState {
            kind: Some(OperationKind::CherryPick),
            head_name: None,
            onto: None,
            conflicted_paths,
        };
    }

    if git_dir.join("REVERT_HEAD").exists() {
        return RepoOperationState {
            kind: Some(OperationKind::Revert),
            head_name: None,
            onto: None,
            conflicted_paths,
        };
    }

    RepoOperationState::none()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn clean_repo_has_no_operation_in_progress() {
        let repo = FixtureRepo::new();
        repo.commit("file.txt", "hello", "initial");
        let state = detect_operation_state(repo.path());
        assert_eq!(state.kind, None);
        assert!(!state.is_in_progress());
        assert!(state.conflicted_paths.is_empty());
    }

    #[test]
    fn detects_merge_in_progress() {
        let repo = FixtureRepo::new();
        repo.commit("file.txt", "line 1\n", "initial");
        repo.git(&["branch", "feature"]);
        repo.commit("file.txt", "line 1 - main\n", "main change");
        repo.git(&["checkout", "feature"]);
        repo.commit("file.txt", "line 1 - feature\n", "feature change");
        repo.git(&["checkout", "main"]);

        // Execute merge that causes conflict
        let _ = crate::core::exec::run_git_raw(repo.path(), &["merge", "feature"]);

        let state = detect_operation_state(repo.path());
        assert_eq!(state.kind, Some(OperationKind::Merge));
        assert!(state.is_in_progress());
        assert_eq!(state.conflicted_paths, vec!["file.txt"]);
    }
}
