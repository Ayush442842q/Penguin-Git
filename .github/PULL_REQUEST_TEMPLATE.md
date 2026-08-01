## What does this PR do?

<!-- Concise description of the change and why it's needed. -->

## Roadmap phase / issue

<!-- Which ROADMAP.md phase does this belong to, or which issue does it close? -->

Closes #

## Checklist

- [ ] Git-wrapping logic lives in `src-tauri/src/core/`, not directly inside a `#[tauri::command]` function (see [CONTRIBUTING.md](../docs/CONTRIBUTING.md))
- [ ] Any parsed git output uses structured formats (`--pretty=format`, `-z`, porcelain v2) — no text-scraping of human-oriented output
- [ ] No secrets/tokens/keys committed or logged in plaintext
- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` passes
- [ ] `pnpm lint && pnpm run format:check && pnpm test` passes
- [ ] Manually verified against a real repo (describe how below)

## How was this tested?

<!-- What did you actually run/click to confirm this works? -->

## Screenshots (if UI change)
