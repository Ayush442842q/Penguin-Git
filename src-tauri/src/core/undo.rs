use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::exec::{run_git, GitError};
use crate::core::merge_state::{detect_operation_state, OperationKind};

static NEXT_ACTION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
pub enum ActionType {
    Commit {
        previous_head: String,
    },
    BranchDelete {
        branch_name: String,
        target_hash: String,
    },
    Merge {
        previous_head: String,
        target_ref: String,
    },
    StashPop {
        stash_name: String,
    },
    Checkout {
        previous_ref: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSnapshot {
    pub id: u64,
    pub timestamp: u64,
    pub description: String,
    pub action_type: ActionType,
}

#[derive(Debug, Default)]
pub struct ActionJournal {
    history: Mutex<Vec<ActionSnapshot>>,
}

impl ActionJournal {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(Vec::new()),
        }
    }

    /// Captures and registers a pre-image snapshot BEFORE a mutating command executes.
    pub fn record(&self, action_type: ActionType, description: impl Into<String>) -> u64 {
        let id = NEXT_ACTION_ID.fetch_add(1, Ordering::SeqCst);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let snapshot = ActionSnapshot {
            id,
            timestamp,
            description: description.into(),
            action_type,
        };

        let mut lock = self.history.lock().unwrap();
        lock.push(snapshot);
        id
    }

    /// Reverts the latest recorded action following the exact mapping table.
    pub fn undo_latest(&self, cwd: &Path) -> Result<ActionSnapshot, GitError> {
        let snapshot = {
            let mut lock = self.history.lock().unwrap();
            lock.pop().ok_or_else(|| GitError::CommandFailed {
                exit_code: None,
                stderr: "No action available to undo in action journal".into(),
            })?
        };

        match &snapshot.action_type {
            ActionType::Commit { .. } => {
                // commit -> git reset --soft HEAD~1
                run_git(cwd, &["reset", "--soft", "HEAD~1"])?;
            }
            ActionType::BranchDelete {
                branch_name,
                target_hash,
            } => {
                // branch delete -> recreate branch at journaled pre-delete commit hash
                run_git(cwd, &["branch", branch_name, target_hash])?;
            }
            ActionType::Merge { .. } => {
                // Check if currently mid-merge vs completed merge
                let state = detect_operation_state(cwd);
                if state.kind == Some(OperationKind::Merge) {
                    // Mid-merge -> git merge --abort
                    run_git(cwd, &["merge", "--abort"])?;
                } else {
                    // Completed merge -> git reset --hard ORIG_HEAD
                    run_git(cwd, &["reset", "--hard", "ORIG_HEAD"])?;
                }
            }
            ActionType::StashPop { .. } => {
                // stash pop -> re-stash working tree changes (best effort)
                let _ = run_git(
                    cwd,
                    &[
                        "stash",
                        "push",
                        "-m",
                        &format!("Undo stash pop ({})", snapshot.id),
                    ],
                );
            }
            ActionType::Checkout { previous_ref } => {
                // checkout/branch-switch -> checkout back to previous branch/commit
                run_git(cwd, &["checkout", previous_ref])?;
            }
        }

        Ok(snapshot)
    }

    pub fn get_history(&self) -> Vec<ActionSnapshot> {
        let lock = self.history.lock().unwrap();
        lock.clone()
    }

    pub fn clear(&self) {
        let mut lock = self.history.lock().unwrap();
        lock.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::test_support::FixtureRepo;

    #[test]
    fn undo_commit_soft_resets_head() {
        let repo = FixtureRepo::new();
        let head1 = repo.commit("a.txt", "1\n", "initial");
        let journal = ActionJournal::new();

        journal.record(
            ActionType::Commit {
                previous_head: head1.clone(),
            },
            "Commit new feature",
        );
        repo.commit("b.txt", "2\n", "second commit");

        assert_ne!(repo.git(&["rev-parse", "HEAD"]).trim(), head1);

        let undone = journal.undo_latest(repo.path()).expect("undo commit");
        assert!(undone.id > 0);
        assert_eq!(repo.git(&["rev-parse", "HEAD"]).trim(), head1);
    }

    #[test]
    fn undo_branch_delete_recreates_branch_at_commit() {
        let repo = FixtureRepo::new();
        let head = repo.commit("a.txt", "1\n", "initial");
        repo.git(&["branch", "feature"]);

        let journal = ActionJournal::new();
        journal.record(
            ActionType::BranchDelete {
                branch_name: "feature".into(),
                target_hash: head.clone(),
            },
            "Delete branch feature",
        );

        repo.git(&["branch", "-D", "feature"]);
        assert!(!repo.git(&["branch", "--list"]).contains("feature"));

        journal
            .undo_latest(repo.path())
            .expect("undo branch delete");
        assert!(repo.git(&["branch", "--list"]).contains("feature"));
    }

    #[test]
    fn undo_completed_merge_resets_hard_orig_head() {
        let repo = FixtureRepo::new();
        let head1 = repo.commit("a.txt", "1\n", "initial");
        repo.git(&["branch", "feature"]);
        repo.commit("b.txt", "2\n", "main commit");
        repo.git(&["checkout", "feature"]);
        repo.commit("c.txt", "3\n", "feature commit");
        repo.git(&["checkout", "main"]);

        let journal = ActionJournal::new();
        journal.record(
            ActionType::Merge {
                previous_head: repo.git(&["rev-parse", "HEAD"]).trim().into(),
                target_ref: "feature".into(),
            },
            "Merge feature into main",
        );

        repo.git(&["merge", "feature", "--no-ff", "-m", "Merge commit"]);
        let merge_head = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
        assert_ne!(merge_head, head1);

        journal
            .undo_latest(repo.path())
            .expect("undo completed merge");
        let post_undo_head = repo.git(&["rev-parse", "HEAD"]).trim().to_string();
        assert_ne!(post_undo_head, merge_head);
    }

    #[test]
    fn undo_mid_merge_executes_merge_abort() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "base\n", "initial");
        repo.git(&["branch", "feature"]);
        repo.commit("a.txt", "main content\n", "main commit");
        repo.git(&["checkout", "feature"]);
        repo.commit("a.txt", "feature content\n", "feature commit");
        repo.git(&["checkout", "main"]);

        let journal = ActionJournal::new();
        journal.record(
            ActionType::Merge {
                previous_head: repo.git(&["rev-parse", "HEAD"]).trim().into(),
                target_ref: "feature".into(),
            },
            "Merge feature into main",
        );

        let _ = crate::core::exec::run_git_raw(repo.path(), &["merge", "feature"]);
        assert!(repo.file_path(".git/MERGE_HEAD").exists());

        journal.undo_latest(repo.path()).expect("undo mid-merge");
        assert!(!repo.file_path(".git/MERGE_HEAD").exists());
    }

    #[test]
    fn undo_checkout_switches_back_to_previous_ref() {
        let repo = FixtureRepo::new();
        repo.commit("a.txt", "1\n", "initial");
        repo.git(&["branch", "feature"]);

        let journal = ActionJournal::new();
        journal.record(
            ActionType::Checkout {
                previous_ref: "main".into(),
            },
            "Checkout branch feature",
        );

        repo.git(&["checkout", "feature"]);
        assert_eq!(
            repo.git(&["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
            "feature"
        );

        journal.undo_latest(repo.path()).expect("undo checkout");
        assert_eq!(
            repo.git(&["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
            "main"
        );
    }
}
