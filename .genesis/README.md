# .genesis — how decisions get made and remembered

This directory is PenguinGit's decision spine: a place for the *why* behind the code that
`git log` and `docs/CHANGELOG.md` don't capture. It's adapted from the [genesis-kit](https://github.com/ayush488-glitch/genesis-kit)
methodology — the parts of it that hold up without extra tooling — for this project specifically.

## Why this exists

`docs/ROADMAP.md` currently says Phase 2 (merge conflicts, interactive rebase, undo/redo) is
"not started." It isn't true — `src-tauri/src/core/undo.rs`, `rebase.rs`, `conflict.rs`, and
`merge_state.rs` already exist, tested, non-trivial. Docs drift from code; nobody notices until
someone (human or agent) re-builds something that's already there. That's the actual problem this
directory solves: a place that's checked *before* work starts, not just written up after.

## What's in here

| File | Answers |
|---|---|
| [`STATE.md`](STATE.md) | What's actually built right now, regardless of what the roadmap says. Check this before starting anything. |
| [`decisions/`](decisions/) | One file per decision that would otherwise get re-litigated or silently reversed. Copy `0000-template.md`. |
| [`context-graph.json`](context-graph.json) | The invariants — rules that make code wrong even if it compiles and passes tests. |
| [`PLAN.md`](PLAN.md) | The next slice of work, broken into milestones with an exact command that proves each one is done. |
| [`checkpoints/CURRENT.md`](checkpoints/CURRENT.md) | Where an in-progress session left off, for resuming cold. |

## How to use it (for me, or for an agent)

**Starting a session on this repo:**
1. Read `checkpoints/CURRENT.md` — is something mid-flight?
2. Read `STATE.md` — before proposing to build X, check whether X already exists.
3. Read `context-graph.json`'s invariants — know what would make a "working" change wrong anyway.
4. Pick up work from `PLAN.md`, or start a new milestone there.

**Making a decision that would be expensive to reverse** (a new dependency, a schema change, an
architectural rule, choosing between two real designs): write it to `decisions/NNNN-slug.md` before
writing the code, not after. Future sessions read the decision instead of re-deriving it or
guessing from the diff.

**Finishing a milestone:** update `STATE.md` with what's now actually live, and clear or update
`checkpoints/CURRENT.md`.

## What this deliberately leaves out

genesis-kit's full methodology assumes a multi-agent loop harness — a cheap "driver" model doing
the work, a separate flagship model verifying it, cognitive skills (`detective`, `verify`, `scout`)
installed globally, an orchestrator skill routing every task. None of that is installed here, and
this directory doesn't pretend it is. What's kept is the part that's useful with zero extra
tooling: a written decision log, a plan sliced into provable milestones, and a habit of checking
what's already built before building it again.
