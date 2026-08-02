//! DESIGN ONLY: Worktree architecture & future integration specification.
//!
//! Do not implement worktree commands or UI in Phase 3.
//! This module documents the design contract to ensure that `RepoRegistry` database schemas
//! and `AppState` handle management remain forward-compatible without requiring breaking changes.
//!
//! ## Overview
//! A Git worktree (`git worktree`) allows checking out multiple branches of the same repository
//! into separate directory trees. In PenguinGit:
//!
//! 1. **Registry & Identity**:
//!    - Each worktree is represented as a distinct `RegisteredRepo` record in `RepoRegistry`.
//!    - `kind` field: `"worktree"` (or `"plain"` for primary checkout).
//!    - `primary_repo_id` field: Stores the `RepoId` of the primary repository working tree.
//!    - `id` field: The canonical filesystem path to the worktree root directory.
//!
//! 2. **Parsing Porcelain Output**:
//!    `git worktree list --porcelain` produces machine-readable records:
//!    ```text
//!    worktree /path/to/main-repo
//!    HEAD 1a2b3c4d5e6f...
//!    branch refs/heads/main
//!
//!    worktree /path/to/worktree-feature
//!    HEAD 7a8b9c0d1e2f...
//!    branch refs/heads/feature/login
//!    ```
//!
//! 3. **Planned Core API Interface (`core/worktree.rs`)**:
//!    - `pub fn list_worktrees(repo_path: &Path) -> Result<Vec<WorktreeInfo>, GitError>`
//!    - `pub fn add_worktree(primary_path: &Path, worktree_path: &Path, branch: &str) -> Result<WorktreeInfo, GitError>`
//!    - `pub fn remove_worktree(primary_path: &Path, worktree_path: &Path, force: bool) -> Result<(), GitError>`
//!
//! 4. **UI Integration**:
//!    - Opening a worktree registers it in `RepoRegistry` with `primary_repo_id = Some(primary_id)`.
//!    - The tab bar or sidebar shows worktrees linked under their parent repository tree.
