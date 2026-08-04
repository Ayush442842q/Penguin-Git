# PenguinGit Roadmap

PenguinGit is being built into a full local-first, Linux-native clone of GitKraken + GitLens — including the features GitKraken gates behind a Pro subscription — plus a built-in MCP server so AI coding agents can drive the repo directly.

This is a living document. Check the boxes off as phases land; update the status column as work progresses.

**Last updated:** 2026-08-05 · **Current phase:** 0 through 7 all have real, tested, UI-wired implementations. The one confirmed gap is worktree support (part of Phase 3) — see its row below.

## Guiding principles

1. **Single source of truth for git logic.** All git invocation lives in a plain Rust library layer (`src-tauri/src/core/`), never inside `#[tauri::command]` functions directly. Tauri commands and the MCP server are both thin adapters over this core.
2. **State lives in Rust, not re-derived every poll.** Cached per-repo status/log/branches, invalidated by a filesystem watcher — not a dumb `setInterval` poll.
3. **Structured git output only.** Every parseable git subcommand uses `--pretty=format:...` with NUL-delimited fields or porcelain v2 — never fragile text-scraping of human-oriented output.
4. **One credential vault, all consumers.** OS keychain, reused by AI provider keys, GitHub tokens, and cloud-backend auth. No plaintext, no localStorage, ever.
5. **Multi-repo is foundational, not a feature.** Repo identity is threaded through the design from the start, even before the UI needs more than one open repo.

## Phases

| #   | Phase                                          | Goal                                                                                                                                                                   | Status                          |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0   | Scaffolding & CI                               | Tooling, linting, testing, and CI foundation before any feature code                                                                                                   | ✅ Done                         |
| 1   | Core git engine & core UI                      | Status, staging, commit, log/graph, diff, branches, stash — done correctly, with a proper DAG lane-layout algorithm and no fragile text-parsing                        | ✅ Done                         |
| 2   | Merge conflicts, interactive rebase, undo/redo | The three hardest, most differentiating git UX flows                                                                                                                   | ✅ Done                         |
| 3   | Multi-repo architecture & submodules           | Tabs, recent-repos, and submodule support                                                                                                                              | ✅ Done (worktrees not started) |
| 4   | GitKraken MCP server                           | Standalone + embeddable MCP server over the shared core library, with live bidirectional events back to the GUI                                                        | ✅ Done                         |
| 5   | AI features (bring-your-own key)               | Compose commits, explain commits/branches, PR descriptions — using your own Anthropic/OpenAI key                                                                       | ✅ Done                         |
| 6   | GitHub integration & Launchpad                 | PAT-based GitHub auth, cross-repo PR/issue inbox, "start work on issue"                                                                                                | ✅ Done                         |
| 7   | Self-hosted backend & cloud features           | Local-only patch export/import and workspace grouping always available; optional self-hosted Rust (Axum + Postgres) backend for shareable cloud patches and workspaces | ✅ Done                         |

### Phase 0 — done ✅

- [x] Version consistency across `package.json` / `Cargo.toml` / `tauri.conf.json` (all `0.1.0`)
- [x] Real Content-Security-Policy in `tauri.conf.json`
- [x] Fonts bundled via `@fontsource` — no runtime CDN fetch, app renders with networking disabled
- [x] ESLint + Prettier (JS), rustfmt + clippy (Rust)
- [x] Vitest + React Testing Library smoke test
- [x] `src-tauri/src/core/exec.rs` — the shared `run_git()` helper + fixture-repo test harness (`core::test_support::FixtureRepo`)
- [x] Empty `src-tauri/src/commands/` adapter layer, so the core/adapter split is structural from the first commit
- [x] GitHub Actions CI (lint/format/test, both frontend and backend)

### Phase 1 — done ✅

- [x] `core::{repo,status,log,diff,stage,commit,branch,remote,stash,watcher}` over the shared `run_git()` helper
- [x] A pure DAG lane-layout algorithm, unit-tested against synthetic graphs (linear, single merge, octopus merge, diverged-then-remerged, orphan branch, interleaved long-running branches) and a real multi-merge repository
- [x] `notify` filesystem watcher emitting `repo-changed`, debounced — no polling anywhere in the app
- [x] zustand store + typed `invoke()` wrappers; native folder picker and recent-repositories list
- [x] Commit graph with virtualized rows, WIP pseudo-commit, context menu, and search/filter
- [x] Diff viewer with unified diff, file history, and blame annotations; staging, branch, and stash panels
- [x] 73 Rust tests and 6 frontend tests

### Phase 2 — done ✅ (PR [#7](https://github.com/Ayush442842q/Penguin-Git/pull/7), 2026-08-02)

- [x] `core::conflict` — 3-way conflict resolution that's actually written to disk and staged (the pre-rewrite prototype computed a result and discarded it), path-traversal-guarded
- [x] `core::rebase` — plain and interactive rebase (reorder/squash) built on a sequence-editor shim (`src-tauri/src/bin/sequence_editor.rs`)
- [x] `core::merge_state` — detects in-progress merge/rebase, serializes operation state to the UI
- [x] `core::undo` — undo/redo action journal covering commit (soft reset), checkout, branch delete, and merge (completed-merge `ORIG_HEAD` reset and mid-merge `merge --abort`)
- [x] UI: `ConflictEditor`, `RebaseDialog`, global `Ctrl+Z`/`Cmd+Z` shortcut and toast (`UndoToast`)
- [x] 15 Rust tests across the four modules

### Phase 3 — done ✅ (PR [#8](https://github.com/Ayush442842q/Penguin-Git/pull/8), 2026-08-02) — worktrees not started

- [x] `core::repo_registry` — SQLite-backed registry of open/recent repos, tab switcher (`RepoTabs`)
- [x] `core::workspace` — grouping repos into named workspaces (`Workspaces` UI, a tab in the launcher)
- [x] `core::submodule` — `.gitmodules` and submodule-status parsing (`SubmodulePanel`)
- [ ] `core::worktree` — still exactly what it was: a design-only doc comment (`src-tauri/src/core/worktree.rs`) specifying a future API shape. No commands, no UI. This is the one real gap left in the whole roadmap.

### Phase 4 — done ✅ (PR [#9](https://github.com/Ayush442842q/Penguin-Git/pull/9), 2026-08-02)

- [x] `core::mcp_server` — 18 `#[tool]`-annotated methods covering the full git workflow (log, status, diff, stage/unstage, commit, checkout, fetch/pull/push, branches, stashes, discard)
- [x] `core::mcp_ipc` + `core::mcp_event` — Unix-socket IPC and an in-process event bus, so MCP-driven mutations reflect live in the GUI
- [x] `crates/penguingit-mcp` — the standalone binary, `stdio()` transport, wrapping the exact same server the embedded/GUI path uses
- [x] `McpPanel` UI to enable/disable the embedded server

### Phase 5 — done ✅ (PR [#10](https://github.com/Ayush442842q/Penguin-Git/pull/10), 2026-08-02)

- [x] `core::ai` — a provider abstraction (`AiProvider::complete`) over your own Anthropic/OpenAI key, stored in the OS keychain
- [x] Compose commit message, explain commit, explain branch, generate PR description
- [x] UI: compose button in `StagingPanel`, `ExplainCommitModal`, `ExplainBranchModal`, `PrDescriptionModal`

### Phase 6 — done ✅ (PR [#11](https://github.com/Ayush442842q/Penguin-Git/pull/11), 2026-08-03)

- [x] `github/client.rs` — PAT-based GitHub auth, PAT stored in the OS keychain
- [x] `Launchpad` — cross-repo PR/issue inbox, categorized into Needs Review / Your PRs / Ready to Merge / Issues
- [x] "Start work on issue" — creates a branch and checks it out from a Launchpad issue

### Phase 7 — done ✅ (PR [#12](https://github.com/Ayush442842q/Penguin-Git/pull/12), 2026-08-03)

- [x] `crates/penguingit-server` — Axum + Postgres (`sqlx`) backend: auth (Argon2 + opaque tokens), patches, workspaces, migrations run automatically on startup
- [x] `core::cloud::client` — the desktop-side HTTP client, token stored in the OS keychain
- [x] UI: Settings → Cloud Workspaces (`CloudPanel`), `CloudPatches` panel
- [x] Self-hosting documented on the [wiki](https://github.com/Ayush442842q/Penguin-Git/wiki/Cloud-Server-Setup) — this backend is optional and not bundled with the desktop app

See [CHANGELOG.md](CHANGELOG.md) for the detailed record of what shipped, phase by phase.

## Explicitly deferred

The following are intentionally out of scope, with the seams left in place to add them cheaply later:

- **GitLab integration** — GitHub ships first; a provider-agnostic client trait means adding GitLab later doesn't require frontend rework.
- **Jira / Trello / Azure Boards integration** — third-layer integrations, lowest priority.
- **Focus View** (Kanban-style board) — builds on Launchpad + workspace scoping, both of which now exist independently.
- **Worktree implementation** — the one confirmed gap; the data model accommodates it, `core/worktree.rs` documents the intended API, but no commands or UI exist yet.

## Architecture decisions

- **Stack:** Tauri v2 + Rust + React 19 + Vite + pnpm.
- **Git engine:** shells out to the system `git` CLI (not `libgit2`/`git2`) — this preserves your SSH agent, GPG signing, and credential-helper setup automatically, with zero extra auth code.
- **AI features:** strictly bring-your-own-API-key. PenguinGit never runs or proxies its own AI inference.
- **Self-hosted cloud backend:** custom Rust (Axum + Postgres + `sqlx`), not a third-party BaaS — matches the project's Rust-first identity and keeps the self-host footprint to two containers (the API service + Postgres).

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to pick up a phase and the ground rules for contributing code.
