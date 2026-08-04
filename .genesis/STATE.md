# STATE — what's actually built, checked against the code

`docs/ROADMAP.md` is the intended narrative; this file is the reality check, updated when a
milestone lands. If they disagree, trust this file, then go fix the roadmap.

## Confirmed live in `src-tauri/src/core/` (2026-08-04)

| Module | Roadmap says | Actually |
|---|---|---|
| `undo.rs` (425 lines) | Phase 2, "not started" | Undo/redo for commit (soft reset), checkout, branch delete, and merge (both completed-merge `ORIG_HEAD` reset and mid-merge `merge --abort`) — all tested against real fixture repos |
| `rebase.rs`, `merge_state.rs` | Phase 2, "not started" | Present, with a sequence-editor shim (`src-tauri/src/bin/sequence_editor.rs`) |
| `conflict.rs` | Phase 2, "not started" | Present |
| `submodule.rs` | Phase 3, "not started" | Present, with `.gitmodules` and submodule-status parsing tested |
| `worktree.rs` | "designed, not implemented" per roadmap | File exists — depth not yet audited |
| `ai/` | Phase 5, "not started" | Directory exists — scope not yet audited |
| `cloud/` + `crates/penguingit-server/` | Phase 7, "not started" | A full Axum + Postgres backend exists (auth, patches, workspaces routes), reachable from Settings → Cloud Workspaces. Undocumented until the wiki page written this session. |
| `crates/penguingit-mcp/` | Phase 4, "not started" | Crate exists |

**Before starting any Phase 2+ work: grep the relevant `core::` module first.** The roadmap's
"not started" is not reliable signal on its own.

## Confirmed live in the desktop shell (this session)

- `src-tauri/capabilities/default.json` — grants `core:default`, `opener:default`, `dialog:default`. Without this file, the folder picker silently does nothing.
- `src-tauri/src/core/watcher.rs` — per-directory watching with an exclude list (`node_modules`, `target`, `dist`, ...), narrow `.git` watching, `EventKind::Access` filtered out.
- Resizable sidebar / detail panel / commit-graph split (`src/hooks/useResizable.js`, `src/components/ResizeHandle/`), sizes persisted to `localStorage`.
- `.rpm` bundle carries a real `license` (MIT, from `src-tauri/Cargo.toml`) and a `git` runtime dependency in `bundle.linux.rpm.depends`.

## Not yet audited

`ai/`, `worktree.rs`, and the full scope of `patch.rs` haven't been read end-to-end this session —
listed as "exists" above based on file presence, not a confirmed feature audit. Don't assume more
than that until someone actually reads them.
