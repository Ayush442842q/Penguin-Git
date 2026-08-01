<p align="center">
  <img src="public/logo.png" width="160" height="160" alt="PenguinGit Logo" />
</p>

<h1 align="center">PenguinGit</h1>

<p align="center">
  <strong>A premium, high-performance, open-source Git GUI client built exclusively for Linux.</strong>
</p>

<p align="center">
  <a href="https://github.com/Ayush442842q/Penguin-Git/actions/workflows/ci.yml"><img src="https://github.com/Ayush442842q/Penguin-Git/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/OS-Linux-E95420?style=flat-square&logo=linux&logoColor=white" alt="Linux OS" />
  <img src="https://img.shields.io/badge/Rust-Core-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust Backend" />
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri wrapper" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React Frontend" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
  <a href="docs/ROADMAP.md"><img src="https://img.shields.io/badge/status-early--development-orange?style=flat-square" alt="Project status" /></a>
</p>

<p align="center">
  <a href="#-project-status">Status</a> ·
  <a href="#key-features">Features</a> ·
  <a href="#high-performance-architecture">Architecture</a> ·
  <a href="#installation--setup">Install</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

PenguinGit delivers the visual power and fluidity of GitKraken to the Linux desktop — including the features GitKraken gates behind a Pro subscription — without the bloat, without a login wall, and without your repository data ever leaving your machine unless you choose to self-host sharing features yourself. Combining a blazing-fast **Rust** backend with a hardware-accelerated **Tauri** UI, PenguinGit keeps all repository logic 100% local, lightweight, and respectful of your system SSH keys and GPG configs.

PenguinGit is also being built **agent-native from day one**: a built-in MCP (Model Context Protocol) server exposes the same git operations the GUI uses as structured tools, so AI coding assistants (Claude Code, Cursor, and others) can drive your repository directly — with every change reflected live in the GUI, not hidden behind a raw shell.

## 🚧 Project status

PenguinGit is in **early development**, built across 8 planned phases — from a correct core git engine, through merge conflicts/interactive rebase/undo-redo, multi-repo support, the MCP server, bring-your-own-key AI features, GitHub integration, and finally a self-hosted backend for cloud patches/workspaces.

| Phase                                    | Status         |
| ---------------------------------------- | -------------- |
| 0 — Scaffolding & CI                     | ✅ Done        |
| 1 — Core git engine & core UI            | ✅ Done        |
| 2 — Conflicts, rebase, undo/redo         | 🔜 Next        |
| 3 — Multi-repo & submodules              | 🔜 Not started |
| 4 — GitKraken MCP server                 | 🔜 Not started |
| 5 — AI features (bring-your-own key)     | 🔜 Not started |
| 6 — GitHub integration & Launchpad       | 🔜 Not started |
| 7 — Self-hosted backend & cloud features | 🔜 Not started |

See **[ROADMAP.md](docs/ROADMAP.md)** for the full phase-by-phase plan and **[CHANGELOG.md](docs/CHANGELOG.md)** for what's actually shipped.

There is no usable release yet — Phase 0 delivers the project skeleton and quality gates, not features. Contributions, issues, and feedback are very welcome.

## Key Features

Target feature set (see [ROADMAP.md](docs/ROADMAP.md) for what's done vs. planned):

| Feature                                    | What it does                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive Commit Graph**               | A beautifully animated SVG graph mapping branches, merges, and head refs with organic Bezier curves. Drag-and-drop or right-click to execute operations directly on the tree. |
| **WIP Staging Workspace**                  | A dedicated "Work in Progress" view showing staged and unstaged changes. Easily stage, unstage, discard, and commit files with a GitKraken-like experience.                   |
| **Visual Merge Conflict Resolver**         | A robust 3-panel editor showing your local changes, incoming changes, and the resolved merge output side-by-side — with resolutions that are actually written and staged.     |
| **Unified Diff Viewer**                    | A syntax-highlighted, colored file comparison tool with line-by-line additions and deletions, file history, and blame.                                                        |
| **Visual Interactive Rebase**              | Drag-and-drop rebase timeline to reorder, squash, edit, or drop commits.                                                                                                      |
| **Multi-Repo & Submodules**                | Tabbed multi-repo workflow with submodule support.                                                                                                                            |
| **GitKraken MCP Server**                   | A built-in MCP server so AI agents can drive your repo directly, with changes reflected live in the GUI.                                                                      |
| **Bring-Your-Own-Key AI**                  | AI-composed commit messages, commit/branch explanations, and PR descriptions — using your own Anthropic/OpenAI API key. PenguinGit never runs its own AI backend.             |
| **GitHub Integration & Launchpad**         | A cross-repo inbox of PRs and issues needing your attention, with one-click "start work on issue."                                                                            |
| **Self-Hosted Cloud Patches & Workspaces** | Optional, self-hosted (Axum + Postgres) sharing of patches and multi-repo workspaces — you control the server, or use the always-available local-only export/import fallback. |
| **Spotlight Command Palette** (`Ctrl+P`)   | A fast keyboard-driven action bar to checkout branches, stash files, switch repository profiles, and navigate commands instantly.                                             |

## High-Performance Architecture

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

- **Local-First Executions:** Avoids heavy native bindings (`nodegit`, `libgit2`). Instead, the Rust core directly calls your system's `git` installation, respecting all SSH agents, credential helpers, and global configs automatically.
- **Agent-Native:** The same Rust core that powers the GUI also powers an MCP server, so there's a single source of truth for git logic whether a human or an AI agent is driving.
- **Offline by Default:** Fonts are bundled at build time and the app ships a strict Content-Security-Policy — PenguinGit makes no network requests of its own.

Full technical breakdown — the core/adapter split, directory layout, git-invocation rules — lives in **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Installation & Setup

To run PenguinGit locally or compile it from source, follow these steps:

### 1. Install Build Dependencies

Since PenguinGit uses Tauri, you need the GTK and WebKit development headers for your Linux distribution.

#### Fedora Linux:

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel libappindicator-gtk3-devel librsvg2-devel
```

#### Debian / Ubuntu:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Arch Linux:

```bash
sudo pacman -S webkit2gtk gtk3 libappindicator-gtk3 librsvg
```

### 2. Development Setup

Clone the repository and run:

```bash
# Install dependencies
pnpm install

# Start the dev server and native GTK app window
pnpm tauri dev
```

### 3. Build Production Installer (.AppImage / .deb / .rpm)

To create a portable release executable:

```bash
pnpm tauri build
```

Packaged installers will be compiled into the `src-tauri/target/release/bundle` directory.

### 4. Run the quality gates locally

```bash
pnpm lint && pnpm run format:check && pnpm test
```

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

These are exactly what CI runs on every push and PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Documentation

Longer-form docs live in **[`docs/`](docs/)**; the issue and PR templates live in **[`.github/`](.github/)**, so the repo root stays just the README and license.

| Doc                                                    | What's in it                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **[docs/ROADMAP.md](docs/ROADMAP.md)**                 | The 8-phase build plan, guiding architectural principles, and what's explicitly deferred    |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**       | How the app is put together: the core/adapter split, git-invocation rules, directory layout |
| **[docs/CHANGELOG.md](docs/CHANGELOG.md)**             | What's actually shipped, phase by phase                                                     |
| **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**       | Ground rules for contributing, local dev setup, testing conventions                         |
| **[docs/SECURITY.md](docs/SECURITY.md)**               | How to report a vulnerability                                                               |
| **[docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)** | Community expectations                                                                      |

## Contributing

Contributions are welcome. Please read **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** before opening a PR — it covers the project's core architectural rules (in particular, the core-library/adapter split every git operation must follow, detailed further in [ARCHITECTURE.md](docs/ARCHITECTURE.md)) and how to run tests locally. Check **[ROADMAP.md](docs/ROADMAP.md)** and open issues/PRs first to avoid duplicating an in-progress phase.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
