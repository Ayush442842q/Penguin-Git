<p align="center">
  <img src="public/logo.png" width="140" height="140" alt="PenguinGit Logo" />
</p>

<h1 align="center">PenguinGit</h1>

<p align="center"><strong>A premium, open-source Git GUI built exclusively for Linux.</strong></p>

<p align="center">
  <a href="https://github.com/Ayush442842q/Penguin-Git/actions/workflows/ci.yml"><img src="https://github.com/Ayush442842q/Penguin-Git/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/OS-Linux-E95420?style=flat-square&logo=linux&logoColor=white" alt="Linux" />
  <img src="https://img.shields.io/badge/Rust-Core-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" /></a>
</p>

---

PenguinGit brings GitKraken's visual power to the Linux desktop — including the features GitKraken gates behind Pro — with no login wall and no repository data leaving your machine. A Rust backend shells out to your own `git`, so your SSH agent, GPG signing, and credential helpers keep working automatically.

It's also **agent-native**: a built-in MCP server exposes the same git operations the GUI uses, so AI coding assistants can drive your repository with every change reflected live in the UI.

> **Early development.** Phases 0 and 1 are done — core git engine, commit graph, diff viewer, staging, branches, and stash. There's no usable release yet. See the [roadmap](docs/ROADMAP.md).

## Highlights

- **Interactive commit graph** — lane-based DAG rendering, virtualized, with a WIP row for uncommitted changes and a right-click action menu
- **Unified diff viewer** — plus file history and line-level blame
- **Live updates** — driven by a filesystem watcher, not a polling loop
- **Coming**: visual merge conflict resolution, interactive rebase, undo/redo, multi-repo, MCP server, bring-your-own-key AI, GitHub Launchpad, self-hosted cloud patches

## Quick start

Install the Tauri build dependencies for your distro — Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel libappindicator-gtk3-devel librsvg2-devel
```

Debian / Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

Then run it:

```bash
pnpm install && pnpm tauri dev
```

`pnpm tauri build` produces `.deb`, `.rpm`, and `.AppImage` bundles under `src-tauri/target/release/bundle`.

## Documentation

| Doc                                  | What's in it                                    |
| ------------------------------------ | ----------------------------------------------- |
| [ROADMAP](docs/ROADMAP.md)           | The 8-phase build plan and what's deferred      |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | The core/adapter split and git-invocation rules |
| [CONTRIBUTING](docs/CONTRIBUTING.md) | Ground rules, dev setup, testing conventions    |
| [CHANGELOG](docs/CHANGELOG.md)       | What's actually shipped, phase by phase         |

## Contributing

Read [CONTRIBUTING.md](docs/CONTRIBUTING.md) first — it covers the rule that matters most: every git operation lives in `src-tauri/src/core/`, never inside a `#[tauri::command]`. Check the [roadmap](docs/ROADMAP.md) and open PRs before starting, to avoid duplicating an in-progress phase.

## License

MIT — see [LICENSE](LICENSE).
