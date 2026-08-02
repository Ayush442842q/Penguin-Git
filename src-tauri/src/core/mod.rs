//! The git logic layer.
//!
//! Everything in here is plain Rust — no `#[tauri::command]` attributes, no
//! knowledge of Tauri's IPC layer — so it can be unit-tested in isolation and
//! reused verbatim by the Phase 4 MCP server. See `docs/ARCHITECTURE.md`.

pub mod ai;
pub mod branch;
pub mod commit;
pub mod conflict;
pub mod diff;
pub mod exec;
pub mod log;
pub mod mcp_event;
pub mod mcp_ipc;
pub mod merge_state;
pub mod patch;

pub mod rebase;
pub mod remote;
pub mod repo;
pub mod repo_registry;
pub mod stage;
pub mod stage_hunk;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod undo;
pub mod watcher;
pub mod workspace;
pub mod worktree;

#[cfg(test)]
pub mod round_trip_tests;
#[cfg(test)]
pub mod test_support;

pub use exec::{run_git, GitError};
