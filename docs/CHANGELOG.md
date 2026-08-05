# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). As of v1.0.0 this project follows [semver](https://semver.org/); versions before v1.0.0 tracked the build phases in [ROADMAP.md](ROADMAP.md) instead, since the API and UX were still settling.

## [Unreleased]

Nothing currently in flight. The only confirmed gap versus the full Phase 0–7 scope is worktree support (part of Phase 3) — see [ROADMAP.md](ROADMAP.md#phases).


## v1.1.0 — Collapsible panels, commit details, and launchpad fixes (2026-08-05)

### Added

- A GitKraken/GitLens-style commit detail panel displaying the full commit message body, author avatar, relative timestamp, branch/tag refs, and a per-file +/- stat list above the diff (PR #94)
- Ability to scope the diff viewer to a single file by clicking it in the commit detail panel file list (PR #94)
- Local author avatars generated from initials on a colored circle, maintaining the app's zero-network-request design (PR #94)
- Collapsible panels for the sidebar, commit graph, and detail panel, toggleable via header icons or handle chevrons, with panel dimensions and collapsed states persisted in `localStorage` separately from drag sizes (PR #93)

### Fixed

- Vite dev-server watcher now ignores the cargo workspace `target/` directory, preventing `ENOSPC` inotify limits exhaustion during concurrent cargo builds (PR #92)
- Re-check GitHub token status when the Settings modal is closed, clearing the "GitHub Personal Access Token is required" warning banner immediately without requiring a manual refresh


## v1.0.0 — First stable release (2026-08-05)

**Correction (2026-08-05):** this entry originally said "The Phase 0 + Phase 1 feature set from
v0.1.0, hardened" and listed the undo/redo journal as newly added. Both were wrong — v0.1.0
already had Phases 0 through 7 (see the correction on that entry below), including undo/redo,
merge conflict resolution, and interactive rebase. `git diff v0.1.0 v1.0.0 -- src-tauri/src/core/undo.rs`
is empty; the only undo/redo change in this release is scoping the journal per repository. This
is a hardening pass over the existing Phase 0–7 feature set, not a Phase 0+1 release: workspace
role enforcement, local patch import/export, and a round of security and dependency fixes.

### Added

- Undo/redo journal scoped per repository (previously a single global journal shared across every open repo)
- Local patch import/export via custom Rust file read/write commands (`read_patch_file` / `write_patch_file`), replacing the previous browser-only file APIs
- Workspace owner/member role enforcement on the self-hosted backend's workspace routes
- `repoId`-based `repo-changed` event payloads (previously path-based), and camelCase serde renaming across server models for frontend consistency
- Tauri app capabilities configuration (`src-tauri/capabilities/default.json`)

### Fixed

- Minimum password length (8 characters) enforced on registration
- `react-router` upgraded to resolve a CSRF vulnerability (GHSA-qwww-vcr4-c8h2)
- Unused `mysql` driver and a vulnerable `rsa` transitive dependency removed
- Filesystem-watcher CPU storm and a keyring-blocking deadlock risk
- Hunk staging now works on untracked and renamed files via dynamic diff-header parsing
- SQLx errors are logged server-side with a generic message returned to clients, instead of leaking raw database errors
- AI provider responses now checked for HTTP status before deserializing, and error bodies are read into typed structs instead of ad hoc JSON parsing
- Embedded MCP server handoff no longer loses data on the read/write boundary
- Two CodeQL "hard-coded cryptographic value" false positives (test fixtures, not real credentials) resolved by generating random test values instead of literals
- `cargo run` / `tauri dev` ambiguity after adding the `penguingit-sequence-editor` binary — `default-run` now pins the main binary

### Changed

- Rust toolchain bumped 1.88 → 1.94 (required by the `sqlx` 0.9 upgrade)
- Major dependency upgrades: `axum` 0.7 → 0.8, `sqlx` 0.8 → 0.9, `rand` 0.8 → 0.10, `tower-http` 0.6 → 0.7, `keyring` 3.6 → 4.1, plus routine GitHub Actions and frontend dependency bumps
- Branch protection: the repo owner's own PRs auto-merge once CI is green; PRs from anyone else still require review

## v0.1.0 — First release (2026-08-03)

**Correction (2026-08-05):** this entry originally said "the Phase 0 + Phase 1 feature set." That
was wrong the day it was written — `git show v0.1.0:src-tauri/src/core/undo.rs` (and
`mcp_server.rs`, `cloud/client.rs`, `github/client.rs`, ...) confirms Phases 2 through 7 were
already in the tagged commit. The release notes just never caught up to what had actually shipped.
See the Phase 2–7 entries below, all dated before or on this tag, for what v0.1.0 actually
contained.

### Added

- `.rpm`, `.deb`, and `.AppImage` bundles via `tauri build`, published as the [v0.1.0 GitHub release](https://github.com/Ayush442842q/Penguin-Git/releases/tag/v0.1.0)
- `license = "MIT"` in `src-tauri/Cargo.toml` so bundle metadata carries a real license instead of an empty field
- `git` declared as an RPM runtime dependency (`bundle.linux.rpm.depends`), matching the existing `.deb` dependency
- README install instructions for the packaged `.rpm` / `.deb`

## Phase 7 — Self-hosted backend & cloud features (2026-08-03)

### Added

- `crates/penguingit-server` — Axum + Postgres (`sqlx`) backend: auth (Argon2 password hashing, opaque bearer tokens), patches, workspaces. Migrations run automatically on startup
- `core::cloud::client` — the desktop-side HTTP client; server URL and token stored in the OS keychain via `keyring`
- Settings → Cloud Workspaces (`CloudPanel`) and the `CloudPatches` panel
- Self-hosting documented on the [wiki](https://github.com/Ayush442842q/Penguin-Git/wiki/Cloud-Server-Setup): role/database setup, `pg_hba.conf` password-auth fix, running the server, registering an account. This backend is optional and not bundled with the desktop `.rpm`/`.deb`

## Phase 6 — GitHub integration & Launchpad (2026-08-03)

### Added

- `github::client` — PAT-based GitHub auth, token stored in the OS keychain
- `Launchpad` — a cross-repo PR/issue inbox categorized into Needs Review, Your PRs, Ready to Merge, and Issues
- "Start work on issue" — creates a branch and checks it out directly from a Launchpad issue

## Phase 5 — AI features, bring-your-own-key (2026-08-02)

### Added

- `core::ai` — a provider abstraction (`AiProvider::complete`) over your own Anthropic/OpenAI API key, stored in the OS keychain. PenguinGit never runs or proxies its own AI inference
- Compose commit message, explain commit, explain branch, generate PR description
- UI: compose button in `StagingPanel`; `ExplainCommitModal`, `ExplainBranchModal`, `PrDescriptionModal`

## Phase 4 — GitKraken MCP server (2026-08-02)

### Added

- `core::mcp_server` — 18 `#[tool]`-annotated methods covering the full git workflow: log, status, diff, commit-diff, stage/unstage, commit, checkout, fetch, pull, push, list/create/delete branch, list/save/pop stash, discard changes
- `core::mcp_ipc` + `core::mcp_event` — Unix-socket IPC and an in-process broadcast event bus, so tool-driven mutations reflect live in the GUI without polling
- `crates/penguingit-mcp` — a standalone binary (`stdio()` transport) wrapping the exact same server the embedded/GUI path uses
- `McpPanel` — Settings UI to enable/disable the embedded server

## Phase 3 — Multi-repo architecture & submodules (2026-08-02)

### Added

- `core::repo_registry` — SQLite-backed registry of open and recently-opened repos, driving the `RepoTabs` tab switcher
- `core::workspace` — grouping repos into named workspaces (`Workspaces` UI, a tab in the launcher alongside Recent)
- `core::submodule` — `.gitmodules` and submodule-status parsing, `SubmodulePanel`

### Known gap

- `core::worktree` is design-only — a doc comment specifying the intended API (`list_worktrees`, `add_worktree`, `remove_worktree`), zero implementation, no commands, no UI. Deliberately deferred; see `docs/ROADMAP.md`

## Phase 2 — Merge conflicts, interactive rebase, undo/redo (2026-08-02)

### Added

- `core::conflict` — 3-way conflict resolution whose resolutions are actually written to disk and staged (the pre-rewrite prototype computed a result and discarded it), path-traversal-guarded
- `core::rebase` — plain and interactive rebase (reorder/squash), built on a sequence-editor shim binary (`src-tauri/src/bin/sequence_editor.rs`)
- `core::merge_state` — detects an in-progress merge or rebase and serializes the operation state to the UI
- `core::undo` — an undo/redo action journal covering commit (soft reset), checkout, branch delete, and merge (both completed-merge `ORIG_HEAD` reset and mid-merge `merge --abort`)
- UI: `ConflictEditor`, `RebaseDialog`, a global `Ctrl+Z`/`Cmd+Z` shortcut and toast (`UndoToast`)
- 15 Rust tests across the four modules, against real fixture repositories

## Phase 1 — Core git engine & core UI (2026-08-01)

The single-repo feature set — status, staging, commit, log/graph, diff, branches, remotes, stash — built on the core/adapter split.

### Added

- `src-tauri/src/core/` — the git logic layer: `repo`, `status`, `log`, `diff`, `stage`, `commit`, `branch`, `remote`, `stash`, `watcher`. All plain Rust over `run_git()`, covered by 73 tests against real fixture repositories
- A DAG lane-layout algorithm (`core::log::compute_lanes`) as a pure function, unit-tested against synthetic graphs: linear history, a single merge, a four-parent octopus merge, diverged-then-remerged branches, an orphan branch, and long-running interleaved branches — plus a real multi-merge repository
- `src-tauri/src/commands/` — thin `#[tauri::command]` adapters over each core module, 43 commands registered
- A `notify`-based filesystem watcher emitting `repo-changed`, debounced so one `git commit` produces one UI refresh. **There is no polling anywhere in the app**
- `src/store/repoStore.js` (zustand) subscribed to `repo-changed`, and `src/services/tauriBridge.js` with named wrappers for every command
- Native folder picker via `tauri-plugin-dialog`, plus a recent-repositories list
- `CommitGraph` — virtualized rows (`@tanstack/react-virtual`), lane rendering from the Rust layout, a synthesized WIP row for uncommitted changes, a context menu (cherry-pick, revert, reset soft/mixed/hard, tag, branch-from-commit), and a search/filter bar
- `DiffViewer` with unified diff, file history (`--follow`), and line-level blame annotations
- `StagingPanel`, `BranchPanel`, `StashPanel`

### Fixed

Bugs carried over from the pre-rewrite prototype, fixed by construction:

- Commit parsing used a pipe-delimited format string that silently corrupted any commit whose subject contained `|`; records are now NUL-delimited with an explicit record separator
- Branch ahead/behind was text-scraped from `git branch -vv`; it now comes from `git rev-list --left-right --count`, and a test asserts it agrees with `git status -sb`
- `git status` used the ambiguous porcelain v1 format; now v2 with `-z`, which handles renames and paths containing spaces correctly
- Stash apply and pop were conflated; they are separate operations, with a test asserting apply keeps the entry and pop consumes it
- The repository path was a raw text input; it is now a native folder picker

## Phase 0 — Scaffolding & CI (2026-08-01)

The project skeleton and every quality gate, wired up before any feature code exists.

### Added

- Tauri v2 + React 19 + Vite + pnpm scaffold, with the version string `0.1.0` held consistent across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
- A real Content-Security-Policy in `tauri.conf.json` (`default-src 'self'`, no remote script/style origins)
- Inter + JetBrains Mono bundled at build time via `@fontsource` and imported in `src/main.jsx` — the app renders correctly with networking disabled, with no CDN fetch at runtime
- `src-tauri/src/core/exec.rs` — the single `run_git()` helper, with a typed `GitError` (`thiserror`) capturing exit code and stderr. It is the only place in the codebase allowed to spawn a `git` subprocess
- `src-tauri/src/core/test_support.rs` — the reusable `FixtureRepo` harness (`tempfile` tempdir + `git init` + per-repo committer identity + scripted commits) that every later phase's git-wrapping tests build on
- `src-tauri/src/commands/` — the thin `#[tauri::command]` adapter layer, deliberately empty in this phase so the core/adapter split is structural from the first commit
- ESLint (flat config) + Prettier for JS/JSX; `rustfmt.toml` + clippy for Rust
- Vitest + React Testing Library with a smoke test rendering the app
- GitHub Actions CI (`.github/workflows/ci.yml`) running lint/format/test for the frontend and `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo check --all-targets` for the backend, on every push and PR. Full `tauri build` bundling is reserved for release tags
- `README.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`, `docs/SECURITY.md`, `LICENSE`, and GitHub issue/PR templates
