//! Thin `#[tauri::command]` adapters over `crate::core`.
//!
//! Every function in here must be a few lines: call into a `core::` function,
//! map the error, return the result. No git-invocation logic, no parsing — that
//! belongs in `core::` so the Phase 4 MCP server can reuse it. See
//! `docs/CONTRIBUTING.md` ground rule 1.

pub mod ai;
pub mod branch;
pub mod commit;
pub mod conflict;
pub mod diff;
pub mod log;
pub mod mcp;
pub mod rebase;

pub mod registry;
pub mod remote;
pub mod repo;
pub mod stage;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod undo;

use crate::core::GitError;

/// Commands return `Result<T, String>` because Tauri's IPC layer serializes the
/// error to the frontend. Converting here — rather than in each command — keeps
/// the adapters to the few lines the split rule calls for.
pub(crate) fn to_ipc_error(err: GitError) -> String {
    err.to_string()
}
