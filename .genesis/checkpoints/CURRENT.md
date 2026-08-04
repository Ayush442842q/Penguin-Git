# CURRENT — where things stand

**As of:** 2026-08-04

## What just happened
- v0.1.0 tagged and released (`.rpm` / `.deb`), then hardened after real-install testing found
  four bugs (see `decisions/0001` and `0002`, plus the startup panic and missing
  `capabilities/default.json` fixes — not yet written up as ADRs, worth doing).
- Fix branch `0.1.1` / PR #72 open against `main`, CI re-running after a formatting fix.
- Self-hosted Cloud Server (`crates/penguingit-server/`) set up locally end to end; wiki page
  written (`docs`: none in-repo yet — lives on the GitHub wiki, not `docs/`).
- This `.genesis/` directory created.

## Next
- Confirm PR #72's CI is green, then it's ready for review/merge (not self-merged).
- Task still open: verify the resizable sidebar/detail-panel/commit-graph dividers behave
  correctly on a clean install.
- Start `PLAN.md` M1 — audit Phase 2's actual state against `STATE.md`.
