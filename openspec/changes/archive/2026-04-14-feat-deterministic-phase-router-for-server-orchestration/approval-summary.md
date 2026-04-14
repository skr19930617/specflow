# Approval Summary: feat-deterministic-phase-router-for-server-orchestration

**Generated**: 2026-04-14T09:45:00Z
**Branch**: feat-deterministic-phase-router-for-server-orchestration
**Status**: ✅ No unresolved high

## What Changed

```
 .../.openspec.yaml                                 |   2 +
 .../current-phase.md                               |  15 +
 .../design.md                                      | 308 ++++++++
 .../proposal.md                                    | 153 ++++
 .../review-ledger-design.json                      |  19 +
 .../review-ledger.json                             |  85 ++
 .../specs/phase-router/spec.md                     | 196 +++++
 .../tasks.md                                       |  61 ++
 src/lib/phase-router/derive-action.ts              | 159 ++++
 src/lib/phase-router/errors.ts                     |  50 ++
 src/lib/phase-router/index.ts                      |  24 +
 src/lib/phase-router/router.ts                     | 217 +++++
 src/lib/phase-router/types.ts                      |  74 ++
 src/tests/phase-router.test.ts                     | 871 +++++++++++++++++++++
```

## Files Touched

- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/.openspec.yaml
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/current-phase.md
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/design.md
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/proposal.md
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/review-ledger-design.json
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/review-ledger.json
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/specs/phase-router/spec.md
- openspec/changes/feat-deterministic-phase-router-for-server-orchestration/tasks.md
- src/lib/phase-router/derive-action.ts
- src/lib/phase-router/errors.ts
- src/lib/phase-router/index.ts
- src/lib/phase-router/router.ts
- src/lib/phase-router/types.ts
- src/tests/phase-router.test.ts

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | currentPhase returns the run's phase contract | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 2 | nextAction returns a PhaseAction discriminated union | Yes | src/lib/phase-router/router.ts, src/lib/phase-router/types.ts, src/tests/phase-router.test.ts |
| 3 | Determinism across repeated calls | Yes | src/lib/phase-router/router.ts, src/lib/phase-router/derive-action.ts, src/tests/phase-router.test.ts |
| 4 | Adding a phase requires no router code change | Yes | src/lib/phase-router/derive-action.ts |
| 5 | Terminal phases derive terminal action from contract | Yes | src/lib/phase-router/derive-action.ts, src/tests/phase-router.test.ts |
| 6 | Event emitted synchronously before await_user | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 7 | Caller does not emit the event itself | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 8 | Repeated nextAction in same gated state emits once | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 9 | Re-entering a gated phase emits again | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 10 | advance does not mutate the store | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 11 | advance carries the next event name | Yes | src/lib/phase-router/derive-action.ts, src/tests/phase-router.test.ts |
| 12 | Missing PhaseContract throws | Yes | src/lib/phase-router/router.ts, src/lib/phase-router/errors.ts, src/tests/phase-router.test.ts |
| 13 | Malformed contract throws | Yes | src/lib/phase-router/derive-action.ts, src/tests/phase-router.test.ts |
| 14 | Inconsistent run state throws | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 15 | No locking inside router | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 16 | Router constructed with injected dependencies | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 17 | Router does not import filesystem APIs directly | Yes | src/lib/phase-router/router.ts, src/tests/phase-router.test.ts |
| 18 | No CLI command imports PhaseRouter | Yes | src/tests/phase-router.test.ts |
| 19 | Router is exported and unit-tested | Yes | src/lib/phase-router/index.ts, src/tests/phase-router.test.ts |

**Coverage Rate**: 19/19 (100%)

## Remaining Risks

### Deterministic risks (from review-ledger)

_No open or new medium/high findings._

### Untested new files

_All new .ts files are covered by the test suite in src/tests/phase-router.test.ts. No .sh or .md new files outside openspec/changes/ require review coverage._

### Uncovered criteria

_None. All 19 scenarios are mapped to implementation files._

## Human Checkpoints

- [ ] Confirm that the local `PhaseContract`, `SurfaceEvent`, and `SurfaceEventSink` type definitions in `src/lib/phase-router/types.ts` are acceptable as placeholders until #129 (Phase Contract) and #100 (Surface event contract) land, and that the follow-up CLI rewire change will migrate them.
- [ ] Confirm that the in-memory dedup (per-process) is an acceptable scope for this change, with R2 (restart causes re-emit) accepted as an orchestrator concern until the CLI/server wiring lands.
- [ ] Confirm the registry-driven safety net in `phase-router.test.ts` (asserting one fixture per `PhaseNextAction`) is sufficient until a production `PhaseContractRegistry` exists, at which point #129's follow-up should replace the fixture-based coverage with registry coverage.
- [ ] Confirm the "no-CLI-imports" grep test correctly covers every current CLI surface (`src/bin`, `src/core`, `src/contracts`, `src/generators`) and that any future CLI directory added to the repo is either added to this allowlist or intentionally excluded.
- [ ] Confirm OQ1 (error metadata for orchestrator UI) and OQ2 (advance action payload shape) are acceptable to resolve during the follow-up wiring change rather than in this change.
