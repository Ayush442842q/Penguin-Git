# Contributing to PenguinGit

Thanks for your interest in PenguinGit. The project is in early development (see [ROADMAP.md](ROADMAP.md)) — please check the roadmap and open issues/PRs before starting work, to avoid duplicating an in-progress phase.

## Ground rules

1. **Core-library / adapter split (hard rule).** Every git operation must live in a plain Rust function under `src-tauri/src/core/`, never directly inside a `#[tauri::command]` function. Tauri commands (`src-tauri/src/commands/`) must be thin adapters — a few lines that call into `core::` and serialize the result. This is what lets the MCP server (Phase 4) reuse the exact same logic with zero duplication. PRs that add git-shelling logic inside a `#[tauri::command]` body will be asked to move it.
2. **One `run_git()`.** `src-tauri/src/core/exec.rs` is the only place in the codebase allowed to spawn a `git` subprocess. If you need a new git operation, add a `core::` function that calls `run_git()` — do not reach for `std::process::Command` yourself. (`core/test_support.rs` has its own private spawner for test _setup_ only.)
3. **Structured git output only.** Use `--pretty=format:...` with NUL-delimited fields, `-z`, or porcelain v2 for any git subcommand whose output you parse. Do not text-scrape human-oriented output (e.g. `git branch -vv`, `git stash list`) — it's fragile and locale-dependent, and it's one of the bugs this rebuild exists to fix.
4. **No plaintext credentials, ever.** Any API key, token, or secret goes through the OS keychain (the `keyring` crate), never `localStorage`, never a plaintext config file.
5. **No runtime network fetches for assets.** Fonts and other assets are bundled at build time. The app must render correctly with networking disabled — the Content-Security-Policy in `tauri.conf.json` enforces this, so don't loosen it to make an asset load.
6. **One PR per phase/feature.** Keep PRs scoped to a single roadmap phase or a clearly-described bug fix. Cross-cutting refactors should be called out explicitly in the PR description.

## Development setup

See the [Installation & Setup](../README.md#installation--setup) section of the README for build dependencies and dev commands (`pnpm install`, `pnpm tauri dev`, `pnpm tauri build`).

## Testing

- **Rust:** every git-wrapping function should have a test using the shared fixture-repo harness rather than a hand-rolled `git init` in the test module:

  ```rust
  use crate::core::test_support::FixtureRepo;

  #[test]
  fn my_git_operation_works() {
      let repo = FixtureRepo::new();               // tempdir + `git init` + committer identity
      let sha = repo.commit("a.txt", "hi", "Add a"); // write + stage + commit, returns the hash
      // ... exercise your core:: function against repo.path()
  }
  ```

  `FixtureRepo` (in `src-tauri/src/core/test_support.rs`) configures `user.name`/`user.email` on the repo itself, so tests don't depend on the host's global git config and pass identically in CI. Extend this helper when you need new setup (branches, merges, conflicts) instead of duplicating setup code across test modules. Run with `cargo test`.

- **Frontend:** component/unit tests use Vitest + React Testing Library. Run with `pnpm test`.

- **Linting:** `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` for Rust; `pnpm lint` and `pnpm run format:check` for JS/JSX. CI runs all of these on every PR — please run them locally first.

## Commit messages

Write commit messages that explain _why_, not just _what_ — the diff already shows what changed. Reference the roadmap phase if applicable (e.g. `Phase 1: fix ahead/behind count parsing`).

## Reporting bugs / requesting features

Use the issue templates under [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE). For security issues, see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.
