# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions track the build phases in [ROADMAP.md](ROADMAP.md) rather than semver, since the project is pre-1.0 and in early development.

## [Unreleased] — Phase 2: Merge conflicts, interactive rebase, undo/redo

Not started. See [ROADMAP.md](ROADMAP.md#phases) for scope.

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
