# Architecture

This document explains how PenguinGit is put together and, more importantly, the rules that keep it that way as the build in [ROADMAP.md](ROADMAP.md) progresses. Read this before touching `src-tauri/`.

## The shape of the app

```
                 ┌──────────────────────────────────────┐
                 │       Frontend: React + CSS          │
                 │   (SVG commit graph, diff panels)    │
                 └──────────────────┬───────────────────┘
                                    │
                              Tauri IPC Bridge
                                    │
                 ┌──────────────────▼───────────────────┐
                 │        Backend: Rust Core            │
                 │   (Fast parsing, process runner)     │
                 └──────────┬───────────────┬────────────┘
                            │               │
                  Command Line Interface   MCP Server (stdio / socket)
                            │               │
                 ┌──────────▼───────────┐   └─► AI coding agents
                 │   System Git CLI    │        (Claude Code, etc.)
                 └──────────────────────┘
```

- **Frontend** (`src/`) — React 19 + Vite. Talks to the backend exclusively through Tauri's `invoke()` bridge. Never shells out to anything itself.
- **Backend** (`src-tauri/`) — Rust. Two layers, described below.
- **System git** — every git operation is a subprocess call to the user's own `git` installation. PenguinGit never links `libgit2`/`git2` or reimplements git plumbing, so it automatically respects the user's SSH agent, GPG signing, credential helpers, and global config.
- **MCP server** (Phase 4, not yet built) — a sibling consumer of the same Rust core, exposing git operations as MCP tools so AI agents can drive a repository directly, with changes reflected live in the GUI.

## The core/adapter split (the one rule that matters most)

This is the single most important structural rule in the codebase, and the reason Phase 4 (the MCP server) will be able to reuse all of Phase 1's git logic with zero duplication:

- **`src-tauri/src/core/`** — plain Rust functions that do the actual work: spawning `git`, parsing its output, returning typed results. No `#[tauri::command]` attributes, no knowledge of Tauri's IPC layer. Fully unit-testable in isolation using the fixture-repo harness (`core::test_support::FixtureRepo`).
- **`src-tauri/src/commands/`** — thin `#[tauri::command]` adapters. Each one is a few lines: call into `core::`, serialize the result, return it. No git-invocation logic lives here. Phase 0 ships this module deliberately empty; Phase 1 fills it in.

```rust
// core/status.rs — the actual logic, testable without Tauri
pub fn get_status(repo_path: &Path) -> Result<RepoStatus, GitError> {
    let output = run_git(repo_path, &["status", "--porcelain=v2", "-z"])?;
    // ... parse into RepoStatus
}

// commands/status.rs — thin adapter, nothing else
#[tauri::command]
pub fn get_git_status(repo_path: String) -> Result<RepoStatus, String> {
    core::status::get_status(Path::new(&repo_path)).map_err(|e| e.to_string())
}
```

If you're adding a new git operation and find yourself writing `Command::new("git")` anywhere outside `core/exec.rs`, stop — that logic belongs in a `core::` module, called from both the Tauri command and (eventually) the MCP tool that wraps the same operation.

## Git invocation rules

Every git subcommand PenguinGit parses output from must use a structured, machine-readable format:

- `--pretty=format:...` with NUL-delimited fields (`%x00`) for `git log` — not pipe-delimited, since commit messages can contain `|`.
- `--porcelain=v2 -z` for `git status` — not v1, which is ambiguous about renames.
- `git rev-list --left-right --count` for ahead/behind counts — not text-parsing `git branch -vv`.

Never text-scrape human-oriented git output (`git branch -vv`, `git stash list`'s default format, etc.). It's fragile, locale-dependent, and was a real source of bugs in the pre-rewrite prototype.

## State and live updates

Backend state (per-repo status, log, branches) is cached in Rust behind `tauri::State`, keyed by repo ID even while the UI only supports one open repo — deliberate groundwork for Phase 3's multi-repo support, since retrofitting repo identity later is expensive and threading it through now is nearly free. A `notify`-based filesystem watcher on `.git/` and the worktree invalidates the cache and emits a `repo-changed` Tauri event, which the frontend subscribes to. There is no polling.

## Offline and content security

The app makes no network requests of its own. Fonts (Inter, JetBrains Mono) are bundled at build time via `@fontsource` and imported in `src/main.jsx`, so nothing is fetched from a CDN at runtime, and `tauri.conf.json` sets a real Content-Security-Policy (`default-src 'self'`, no remote script/style origins). `pnpm tauri dev` with networking disabled is a supported, tested configuration — if a change breaks it, the change is wrong.

## Credentials

One credential vault: the OS keychain via the `keyring` crate. AI provider API keys (Phase 5), GitHub tokens (Phase 6), and self-hosted backend auth tokens (Phase 7) all go through it. Never plaintext, never `localStorage`.

## Directory layout

```
src/                        React frontend
  components/                UI components (built out phase by phase)
  services/                  typed wrappers around Tauri's invoke() (Phase 1+)
  store/                     frontend state (Phase 1+: zustand)
  styles/index.css           design-system tokens + reset
  test/                      Vitest setup

src-tauri/
  src/
    core/                    git logic — the layer described above
      exec.rs                 the one run_git() helper
      test_support.rs         FixtureRepo test harness
    commands/                thin #[tauri::command] adapters
    lib.rs                   Tauri app bootstrap, command registration
  icons/                     app icons for the bundle

.github/workflows/ci.yml     lint/format/test on every push and PR
docs/ROADMAP.md              the 8-phase build plan
docs/CHANGELOG.md            what's actually shipped, phase by phase
```

## Why these decisions were made

- **Shell out to system git, not libgit2** — respects the user's existing SSH/GPG/credential-helper setup for free; the README markets this explicitly as a feature, not a limitation.
- **Tauri + Rust + React, not Electron** — small binaries, native OS webview, no bundled Chromium.
- **No AI backend of our own** — bring-your-own-API-key only; PenguinGit is a client, not a service.
- **Self-hosted Rust (Axum + Postgres) for cloud features, not a third-party BaaS** — keeps the whole stack in one language and the self-host footprint to two containers; see [ROADMAP.md](ROADMAP.md#architecture-decisions) for the full tradeoffs.

If you're planning a change that cuts across multiple phases or touches this document's assumptions, open an issue first — see [CONTRIBUTING.md](CONTRIBUTING.md).
