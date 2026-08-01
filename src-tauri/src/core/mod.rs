//! The git logic layer.
//!
//! Everything in here is plain Rust — no `#[tauri::command]` attributes, no
//! knowledge of Tauri's IPC layer — so it can be unit-tested in isolation and
//! reused verbatim by the Phase 4 MCP server. See `docs/ARCHITECTURE.md`.

pub mod exec;

#[cfg(test)]
pub mod test_support;

pub use exec::{run_git, GitError};
