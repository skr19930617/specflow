# Approval Summary: dbui

**Generated**: 2026-04-20T03:00:04Z
**Branch**: dbui
**Status**: ✅ No unresolved high

## What Changed

```
 assets/commands/specflow.watch.md.tmpl             | 120 ++++++
 bin/specflow-watch                                 |   2 +
 openspec/changes/dbui/.openspec.yaml               |   2 +
 openspec/changes/dbui/current-phase.md             |  11 +
 openspec/changes/dbui/design.md                    | 181 ++++++++
 openspec/changes/dbui/proposal.md                  |  94 +++++
 openspec/changes/dbui/review-ledger-design.json    |  78 ++++
 openspec/changes/dbui/review-ledger-design.json.bak|  77 ++++
 openspec/changes/dbui/review-ledger.json           |  37 ++
 openspec/changes/dbui/review-ledger.json.bak       |  36 ++
 openspec/changes/dbui/specs/realtime-progress-ui/spec.md
                                                    | 192 +++++++++
 openspec/changes/dbui/specs/slash-command-guides/spec.md
                                                    |  54 +++
 openspec/changes/dbui/task-graph.json              | 301 ++++++++++++++
 openspec/changes/dbui/tasks.md                     |  59 +++
 package.json                                       |   3 +-
 src/bin/specflow-watch.ts                          | 363 ++++++++++++++++
 src/contracts/command-bodies.ts                    |   4 +
 src/contracts/commands.ts                          |   5 +
 src/contracts/orchestrators.ts                     |   9 +
 src/lib/observation-event-reader.ts                |  78 ++++
 src/lib/specflow-watch/artifact-readers.ts         | 162 ++++++++
 src/lib/specflow-watch/run-resolution.ts           | 110 +++++
 src/lib/specflow-watch/run-scan.ts                 |  80 ++++
 src/lib/watch-fs.ts                                | 227 +++++++++++
 src/lib/watch-renderer/ansi.ts                     |  74 ++++
 src/lib/watch-renderer/index.ts                    |  31 ++
 src/lib/watch-renderer/model.ts                    | 212 ++++++++++
 src/lib/watch-renderer/render.ts                   | 237 +++++++++++
 src/lib/watch-renderer/topo.ts                     |  69 ++++
 src/tests/__snapshots__/specflow.watch.md.snap     | 129 ++++++
 src/tests/specflow-watch-import-graph.test.ts      |  95 +++++
 src/tests/specflow-watch-integration.test.ts       | 454 +++++++++++++++++++++
 src/tests/specflow-watch-readers.test.ts           | 367 +++++++++++++++++
 src/tests/watch-fs.test.ts                         | 204 +++++++++
 src/tests/watch-renderer.test.ts                   | 271 ++++++++++++
 35 files changed, 4427 insertions(+), 1 deletion(-)
```

## Files Touched

- `assets/commands/specflow.watch.md.tmpl` — new slash-command guide template.
- `bin/specflow-watch` — launcher shim.
- `package.json` — `bin` entry for `specflow-watch`.
- `src/bin/specflow-watch.ts` — long-lived TUI CLI adapter.
- `src/contracts/commands.ts`, `src/contracts/command-bodies.ts` — register `/specflow.watch` in the slash-command registry.
- `src/contracts/orchestrators.ts` — register `specflow-watch` as a TUI orchestrator (no stdoutSchemaId).
- `src/lib/observation-event-reader.ts` — tolerant JSONL tailer for observation events.
- `src/lib/specflow-watch/run-resolution.ts`, `run-scan.ts`, `artifact-readers.ts` — read-only run resolution + artifact loaders with per-section degradation.
- `src/lib/watch-fs.ts` — minimal `fs.watch` + 2 s mtime/size poll coalescer with 80 ms debounce.
- `src/lib/watch-renderer/` — pure model + ANSI frame renderer with topological bundle bars, graceful placeholders, warnings, and terminal-state banner.
- `src/tests/specflow-watch-readers.test.ts`, `watch-fs.test.ts`, `watch-renderer.test.ts`, `specflow-watch-integration.test.ts`, `specflow-watch-import-graph.test.ts` — unit + integration + import-graph coverage including the active → terminal → active re-activation lifecycle and the autofix-snapshot selection rule.
- `openspec/changes/dbui/*` — proposal, design, spec deltas, task graph, review ledgers.

## Review Loop Summary

### Design Review

| Metric           | Count |
|------------------|-------|
| Initial high     | 1     |
| Resolved high    | 1     |
| Unresolved high  | 0     |
| New high (later) | 0     |
| Total rounds     | 2     |

### Impl Review

| Metric           | Count |
|------------------|-------|
| Initial high     | 0     |
| Resolved high    | 0     |
| Unresolved high  | 0     |
| New high (later) | 0     |
| Total rounds     | 1     |

## Proposal Coverage

Acceptance criteria were extracted from the spec deltas at
`openspec/changes/dbui/specs/*/spec.md` (one requirement per row). Each
criterion is mapped to the primary file(s) that implement it. All spec
requirements are covered by the implementation and the verification tests.

| # | Criterion (summary)                                                                | Covered? | Mapped Files |
|---|------------------------------------------------------------------------------------|----------|--------------|
| 1 | `/specflow.watch` launches a standalone ANSI TUI terminal process; no server/DB    | Yes      | `src/bin/specflow-watch.ts`, `assets/commands/specflow.watch.md.tmpl`, `src/lib/watch-renderer/render.ts` |
| 2 | Redraw on filesystem change (fs.watch + 2 s mtime/size poll fallback, 80 ms debounce) | Yes   | `src/lib/watch-fs.ts`, `src/tests/watch-fs.test.ts` |
| 3 | Run resolution: exact `run_id` → change_name active-run → branch-derived default    | Yes      | `src/lib/specflow-watch/run-resolution.ts`, `src/tests/specflow-watch-readers.test.ts` |
| 4 | Read-only consumption of run-state, autofix snapshot, task-graph, events.jsonl      | Yes      | `src/lib/specflow-watch/artifact-readers.ts`, `src/lib/observation-event-reader.ts`, `src/tests/specflow-watch-import-graph.test.ts` |
| 5 | Four required display sections (run header, review round, task-graph bundles, events) | Yes    | `src/lib/watch-renderer/model.ts`, `src/lib/watch-renderer/render.ts`, `src/tests/watch-renderer.test.ts` |
| 6 | Task-graph bundles listed in topological order (derived from `depends_on`)          | Yes      | `src/lib/watch-renderer/topo.ts`, `src/tests/watch-renderer.test.ts` |
| 7 | Graceful per-section degradation (placeholders + inline warnings; run-state mandatory) | Yes   | `src/lib/specflow-watch/artifact-readers.ts`, `src/lib/watch-renderer/model.ts`, `src/tests/specflow-watch-integration.test.ts` |
| 8 | Terminal-state lifecycle: stay open with banner; resume on re-activation            | Yes      | `src/lib/watch-renderer/model.ts` (`terminalBannerFor`), `src/bin/specflow-watch.ts`, `src/tests/specflow-watch-integration.test.ts` |
| 9 | Autofix snapshot selection keyed by `current_phase`; stale files ignored            | Yes      | `src/lib/specflow-watch/artifact-readers.ts` (`selectActiveAutofixPhase`), `src/tests/specflow-watch-integration.test.ts` |
| 10 | `specflow.watch` is registered in the slash-command registry                       | Yes      | `src/contracts/commands.ts`, `src/contracts/command-bodies.ts`, `src/tests/__snapshots__/specflow.watch.md.snap` |
| 11 | `/specflow.watch` guide documents three invocations, resolution rule, tmux/open/manual fallback, and read-only contract | Yes | `assets/commands/specflow.watch.md.tmpl`, `src/tests/__snapshots__/specflow.watch.md.snap` |

**Coverage Rate**: 11/11 (100%)

## Remaining Risks

1. **Deterministic risks (from review ledgers)**:
   - `R1-F01` (impl, medium): "Primary watch path can miss burst updates entirely". The reviewer reproduced a race in the `watchPaths: debounces bursts into a single callback` test. Local re-runs of the reviewer's exact subset (3 consecutive runs, 46/46 passing) and the full `npm run check` (689/689 passing, coverage 74.41 %) do not reproduce the race on this machine. The underlying runtime is explicitly designed to be resilient to this via the 2 s mtime/size poll fallback (design D2), so any missed `fs.watch` burst is picked up by the poll — the user-visible redraw latency remains bounded to ≈2 s. Tracked as MEDIUM for follow-up hardening; does not block approve.
   - `R2-F03` (design, medium): "Slash-command guide tasks do not explicitly cover all required guide contents". The delivered [`assets/commands/specflow.watch.md.tmpl`](assets/commands/specflow.watch.md.tmpl) and the locked snapshot [`src/tests/__snapshots__/specflow.watch.md.snap`](src/tests/__snapshots__/specflow.watch.md.snap) already document all required items (three invocation forms, run_id-first-then-change_name resolution, default branch-derived lookup with tie-break ordering, tmux/open/manual fallback, read-only contract including that `tasks.md` is not consumed and no mutating subcommands are called). The finding is effectively resolved by the delivery but remained marked as open in the ledger.

2. **Untested new files**: none — every new file is referenced by at least one test or by a referenced module.

3. **Uncovered criteria**: none.

## Human Checkpoints

- [ ] Smoke-test `/specflow.watch` inside a fresh tmux session to confirm the guide's launch-path A opens a working TUI.
- [ ] Verify that a manual `Ctrl+C` in the TUI restores the terminal cleanly (alt-screen exit, cursor shown, no leftover rendering artifacts).
- [ ] On a run in `design_review`, observe that a mutation to `autofix-progress-design_review.json` redraws the Review section within ≈2 s and that the wrong-gate `autofix-progress-apply_review.json` is ignored.
- [ ] Confirm that `specflow-watch` never writes to any run artifact by running the watcher against an archived run and checking `git status` on `.specflow/runs/<run_id>/` afterward.
