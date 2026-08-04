# PLAN — next slice of work

A milestone belongs here only if it has a single clear outcome and an exact command that proves
it's done. If you can't write the demo command, it's too vague — split it.

**Before slicing new Phase 2 milestones: read `STATE.md`.** `core::undo`, `rebase`, `conflict`,
and `merge_state` already exist — the work here is auditing and finishing them, not building from
zero. Re-slice this section once that audit happens.

## M1 — Audit what Phase 2 already has
- **Outcome:** a written answer, per `core::{undo,rebase,conflict,merge_state}`, to: does this work
  end-to-end, is it wired to the UI, what's the test coverage, what's missing.
- **Demo command:** `cargo test --workspace -- undo rebase conflict merge_state 2>&1 | tail -30`
  plus a manual read of each module against its test file.
- **Success criteria:** `STATE.md`'s "Not yet audited" section is empty, and `docs/ROADMAP.md`
  Phase 2's status line reflects reality instead of "not started."

## M2 — Close whatever M1 finds missing
- **Outcome:** depends on M1's findings — fill in scope, not guessed ahead of the audit.
- **Demo command:** TBD after M1.

---

## Progress (append here on milestone completion — newest last)

- _(none yet — first real milestone starts with M1)_
