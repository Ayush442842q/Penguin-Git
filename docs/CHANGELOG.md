# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions track the build phases in [ROADMAP.md](ROADMAP.md) rather than semver, since the project is pre-1.0 and in early development.

## [Unreleased] — Phase 1: Core git engine & core UI

Not started. See [ROADMAP.md](ROADMAP.md#phases) for scope.

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
