//! Thin `#[tauri::command]` adapters over `crate::core`.
//!
//! Every function in here must be a few lines: call into a `core::` function,
//! map the error, return the result. No git-invocation logic, no parsing — that
//! belongs in `core::` so the Phase 4 MCP server can reuse it. See
//! `docs/CONTRIBUTING.md` ground rule 1.
//!
//! Phase 0 ships this module empty on purpose: the split is structural, and it
//! exists from the first commit so there is never a moment where git logic has
//! nowhere to go but into a command body.
