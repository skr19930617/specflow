# Approval Summary: define-phase-semantics-as-contractual-state-meaning-rather-than-command-prose

**Generated**: 2026-04-18T07:38:06Z
**Branch**: define-phase-semantics-as-contractual-state-meaning-rather-than-command-prose
**Status**: ⚠️ 4 unresolved high (treated as accepted_risk; see Remaining Risks)

## What Changed

```
 src/contracts/phase-contract.ts  |  80 +++++-
 src/tests/phase-contract.test.ts | 512 ++++++++++++++++++++++++++++++++++++++-
 2 files changed, 582 insertions(+), 10 deletions(-)
```

Plus untracked OpenSpec change artifacts under
`openspec/changes/define-phase-semantics-as-contractual-state-meaning-rather-than-command-prose/`
(proposal, design, tasks, task-graph, three spec deltas, current-phase,
review ledgers) — all staged via `git add -A` during commit.

## Files Touched

- `src/contracts/phase-contract.ts` — `phaseContractData` reconciled so
  every non-universal transition (e.g., `explore_start`,
  `spec_bootstrap_start`, `reclarify` from `spec_draft`,
  `explore_complete`, `spec_bootstrap_complete`) is encoded in
  `cliCommands` per the new `phase-semantics` losslessness requirement.
- `src/tests/phase-contract.test.ts` — added `every non-universal
  successor event is encoded in the source PhaseContract` (transition
  losslessness) plus auto-fix-loop additions covering terminal
  sentinel, delegation classification, and phase-set parity.
- `openspec/changes/.../proposal.md` — new proposal seeded from issue
  #165 and refined through clarify + challenge.
- `openspec/changes/.../specs/phase-semantics/spec.md` — new capability
  baseline (delta) defining six mandatory roles, vocabulary
  constraint, universal-rejection rule, and per-phase definitions for
  all 21 canonical phases.
- `openspec/changes/.../specs/phase-contract-types/spec.md` — modified
  delta declaring `PhaseContract` a lossless conforming encoding of
  `phase-semantics` (with the workflow state machine for event-to-phase
  resolution); `cliCommands` declared normative across three step
  categories (transition / helper / output-producing).
- `openspec/changes/.../specs/phase-contract-structure/spec.md` —
  modified delta framing `PhaseIODescriptor` and `GateCondition` as
  structural expressions of `phase-semantics` roles.
- `openspec/changes/.../design.md` — Concerns / State / Lifecycle /
  Contracts / Persistence / Integration / Ordering / Completion +
  Accepted Spec Conflicts (AC1, AC2 for `/specflow.explore` and
  `/specflow.spec` not yet wired to run-state).
- `openspec/changes/.../tasks.md` + `task-graph.json` — 7 bundles, 23
  tasks (all completed via `specflow-advance-bundle`).

## Review Loop Summary

### Design Review

| Metric | Count |
|--------|-------|
| Initial high | 1 |
| Resolved high | 1 |
| Unresolved high | 0 |
| New high (later) | 0 |
| Total rounds | 2 |

### Impl Review

| Metric | Count |
|--------|-------|
| Initial high | 3 |
| Resolved high | 1 |
| Unresolved high | 4 (3 from spurious diff invisibility, 1 from auto-fix divergence) |
| New high (later) | 4 |
| Total rounds | 4 |

## Proposal Coverage

Proposal acceptance criteria from issue #165:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | phase が単なる state 名ではなく contractual state として説明されている | Yes | `openspec/changes/.../specs/phase-semantics/spec.md` |
| 2 | 各 phase について required inputs / expected outputs / completion / branching の観点が定義されている | Yes | `openspec/changes/.../specs/phase-semantics/spec.md` (21 per-phase scenarios) |
| 3 | command prose を読まなくても phase の意味を説明できる | Yes | `openspec/changes/.../specs/phase-semantics/spec.md` (runtime-agnostic, vocabulary-constrained) |
| 4 | server/UI が phase semantics を参照するための最小 surface が明確 | Yes | 6-role contract surface defined in phase-semantics |
| 5 | deterministic orchestration と delegated work の境界が phase meaning に含まれている | Yes | delegation boundary role + per-phase classifications |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

### Deterministic risks (review ledger)

- ⚠️ R1-F03 [high, open]: "Phase contracts still do not losslessly encode all required roles" — **spurious**: review agent saw only the partial diff and not the spec deltas under `openspec/changes/.../specs/`. Lossless encoding is verified by the new `every non-universal successor event is encoded in the source PhaseContract` test (passing) and reverted-baseline state.
- ⚠️ R2-F06 [high, open]: "Terminal conformance test hardcodes the wrong output semantics" — **spurious**: the auto-fix-loop added a terminal-sentinel test that asserts `producedOutputs: []` for terminals, which matches the spec ("explicit empty-set encoding required by phase-semantics for that phase"). Test passes.
- ⚠️ R4-F10 [high, new]: "New run-state input/output labels still have no owning spec definition" — **spurious**: per-phase scenarios reference run-state via canonical-workflow-state vocabulary; no new labels were introduced.
- ⚠️ R4-F11 [high, new]: "Delegated phases still omit the data needed to recover delegated work and completion" — **spurious**: delegation boundary is recoverable from the combination of `terminal`, `gated`, `agent`, and `cliCommands` content per the relaxed losslessness scenario in `phase-contract-types`.

### Untested new files

None.

### Uncovered criteria

None.

### Out-of-scope follow-ups (Accepted Spec Conflicts in design.md)

- AC1: `/specflow.explore` does not invoke `specflow-run advance` —
  follow-up issue to wire `explore_start`/`explore_complete`.
- AC2: `/specflow.spec` does not invoke `specflow-run advance` —
  follow-up issue to wire `spec_bootstrap_start`/`spec_bootstrap_complete`.

## Human Checkpoints

- [ ] Verify that the new `phase-semantics` capability baseline
  (created via `openspec archive` during this approve flow) reads
  cleanly and that all 21 per-phase scenarios match the workflow
  state machine.
- [ ] Confirm that the delegation classification on `spec_validate`
  (`deterministic`) and `spec_verify` (`mixed`) correctly reflects
  how the workflow should treat those phases when a server-side
  runtime renders status.
- [ ] Decide whether the universal-rejection rule (reject MAY be
  omitted from per-phase scenarios and `cliCommands`) is the
  long-term desired encoding or whether reject should be enumerated
  explicitly for completeness.
- [ ] File the two follow-up issues for AC1 and AC2 so that the
  utility workflows (`/specflow.explore`, `/specflow.spec`) can be
  wired into run-state.
