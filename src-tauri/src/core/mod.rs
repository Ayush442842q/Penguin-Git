//! The git logic layer.
//!
//! Everything in here is plain Rust — no `#[tauri::command]` attributes, no
//! knowledge of Tauri's IPC layer — so it can be unit-tested in isolation and
//! reused verbatim by the Phase 4 MCP server. See `docs/ARCHITECTURE.md`.

pub mod branch;
pub mod commit;
pub mod diff;
pub mod exec;
pub mod log;
pub mod remote;
pub mod repo;
pub mod stage;
pub mod stash;
pub mod status;
pub mod watcher;

#[cfg(test)]
pub mod round_trip_tests;
#[cfg(test)]
pub mod test_support;

pub use exec::{run_git, GitError};
