# ADR 0002 — Blocking OS calls run through spawn_blocking, never inline in a sync command

- **Date:** 2026-08-04
- **Status:** accepted

## Context
Two separate bugs traced back to the same root cause: a blocking OS call made directly from a
plain synchronous `#[tauri::command]` (or from Tauri's `.setup()` hook) instead of being routed
through Tauri's managed async runtime.

1. `core::mcp_ipc::start_mcp_event_listeners` called `tokio::spawn` from inside `.setup()`, before
   Tauri's own Tokio runtime context existed on that thread — the app panicked on every launch
   with "there is no reactor running."
2. `commands::github::{save,get,delete,test}_github_token` called the `keyring` crate's blocking
   Secret Service D-Bus calls directly. This is a latent deadlock risk on Linux: GTK's main loop
   and D-Bus calls can contend for the same thread depending on dispatch details.

## Decision
- Anything spawning a background task uses `tauri::async_runtime::spawn`, not `tokio::spawn`
  directly, when it might run before or outside Tauri's own runtime context (setup hooks in
  particular).
- Anything that makes a blocking OS call (OS keychain, and by extension anything similar added
  later — e.g. a future credential-helper shell-out) runs through
  `tauri::async_runtime::spawn_blocking`, never inline in a sync command.

## Consequences
- Positive: removes an entire class of "the whole app appears frozen" bugs tied to Linux desktop
  integration specifics that don't show up in `cargo test` or CI.
- Negative / cost: every command that might touch the keychain (or similar) is now `async fn`,
  slightly more boilerplate per command.
- **Invariant added to context-graph.json:** `blocking-io-off-the-command-thread`

## Alternatives rejected
- **Leave `get_github_token` sync since it just returns a bool** — the blocking D-Bus call is
  still inside it; the return type doesn't change the deadlock risk. Fixed uniformly instead of
  case-by-case.
