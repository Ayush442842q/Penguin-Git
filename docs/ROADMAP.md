# PenguinGit Roadmap

PenguinGit is being built into a full local-first, Linux-native clone of GitKraken + GitLens — including the features GitKraken gates behind a Pro subscription — plus a built-in MCP server so AI coding agents can drive the repo directly.

This is a living document. Check the boxes off as phases land; update the status column as work progresses.

**Last updated:** 2026-08-01 · **Current phase:** 0 and 1 complete, 2 next (Conflicts, rebase, undo/redo)

## Guiding principles

1. **Single source of truth for git logic.** All git invocation lives in a plain Rust library layer (`src-tauri/src/core/`), never inside `#[tauri::command]` functions directly. Tauri commands and the MCP server are both thin adapters over this core.
2. **State lives in Rust, not re-derived every poll.** Cached per-repo status/log/branches, invalidated by a filesystem watcher — not a dumb `setInterval` poll.
3. **Structured git output only.** Every parseable git subcommand uses `--pretty=format:...` with NUL-delimited fields or porcelain v2 — never fragile text-scraping of human-oriented output.
4. **One credential vault, all consumers.** OS keychain, reused by AI provider keys, GitHub tokens, and cloud-backend auth. No plaintext, no localStorage, ever.
5. **Multi-repo is foundational, not a feature.** Repo identity is threaded through the design from the start, even before the UI needs more than one open repo.

## Phases

| #   | Phase                                          | Goal                                                                                                                                                                   | Status         |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 0   | Scaffolding & CI                               | Tooling, linting, testing, and CI foundation before any feature code                                                                                                   | ✅ Done        |
| 1   | Core git engine & core UI                      | Status, staging, commit, log/graph, diff, branches, stash — done correctly, with a proper DAG lane-layout algorithm and no fragile text-parsing                        | ✅ Done        |
| 2   | Merge conflicts, interactive rebase, undo/redo | The three hardest, most differentiating git UX flows                                                                                                                   | 🔜 Next        |
| 3   | Multi-repo architecture & submodules           | Tabs, recent-repos, and submodule support (worktree support designed, not yet implemented)                                                                             | 🔜 Not started |
| 4   | GitKraken MCP server                           | Standalone + embeddable MCP server over the shared core library, with live bidirectional events back to the GUI                                                        | 🔜 Not started |
| 5   | AI features (bring-your-own key)               | Compose commits, explain commits/branches, PR descriptions — using your own Anthropic/OpenAI key                                                                       | 🔜 Not started |
| 6   | GitHub integration & Launchpad                 | PAT-based GitHub auth, cross-repo PR/issue inbox, "start work on issue"                                                                                                | 🔜 Not started |
| 7   | Self-hosted backend & cloud features           | Local-only patch export/import and workspace grouping always available; optional self-hosted Rust (Axum + Postgres) backend for shareable cloud patches and workspaces | 🔜 Not started |

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

### Phase 2 — next

Scope: a merge-conflict resolver whose resolutions are actually written to disk and staged (the prototype computed a result and discarded it), a visual interactive rebase built on a sequence-editor shim, and an undo/redo action journal.

See [CHANGELOG.md](CHANGELOG.md) for the detailed record of what shipped.

## Explicitly deferred

The following are intentionally out of scope for the phases above, with the seams left in place to add them cheaply later:

- **GitLab integration** — GitHub ships first; a provider-agnostic client trait means adding GitLab later doesn't require frontend rework.
- **Jira / Trello / Azure Boards integration** — third-layer integrations, lowest priority.
- **Focus View** (Kanban-style board) — builds on Launchpad + workspace scoping once both exist independently.
- **Worktree implementation** — the data model accommodates it from Phase 3 onward, but the feature itself ships later, once there's a real multi-repo UI to attach it to.

## Architecture decisions

- **Stack:** Tauri v2 + Rust + React 19 + Vite + pnpm.
- **Git engine:** shells out to the system `git` CLI (not `libgit2`/`git2`) — this preserves your SSH agent, GPG signing, and credential-helper setup automatically, with zero extra auth code.
- **AI features:** strictly bring-your-own-API-key. PenguinGit never runs or proxies its own AI inference.
- **Self-hosted cloud backend:** custom Rust (Axum + Postgres + `sqlx`), not a third-party BaaS — matches the project's Rust-first identity and keeps the self-host footprint to two containers (the API service + Postgres).

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to pick up a phase and the ground rules for contributing code.
