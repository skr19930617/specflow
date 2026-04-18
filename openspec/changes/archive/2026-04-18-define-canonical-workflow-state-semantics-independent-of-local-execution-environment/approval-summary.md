# Approval Summary: define-canonical-workflow-state-semantics-independent-of-local-execution-environment

**Generated**: 2026-04-18T03:42:37Z
**Branch**: define-canonical-workflow-state-semantics-independent-of-local-execution-environment
**Status**: ✅ No unresolved high

## What Changed

All files are newly added under the change directory (spec-only change, no prior HEAD entries):

```
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/.openspec.yaml
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/current-phase.md
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/design.md
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/proposal.md
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/review-ledger-design.json
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/specs/canonical-workflow-state/spec.md
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/specs/workflow-run-state/spec.md
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/task-graph.json
 openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/tasks.md
```

No source code (`src/**`), test (`src/tests/**`), or configuration files outside the change directory were modified.

## Files Touched

- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/.openspec.yaml`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/current-phase.md`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/design.md`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/proposal.md`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/review-ledger-design.json`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/specs/canonical-workflow-state/spec.md`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/specs/workflow-run-state/spec.md`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/task-graph.json`
- `openspec/changes/define-canonical-workflow-state-semantics-independent-of-local-execution-environment/tasks.md`

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

⚠️ No impl ledger — apply review produced no reviewable changes (spec-only change).

## Proposal Coverage

Acceptance criteria are taken from `proposal.md` (seeded from issue #164):

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | run-state が「workflow canonical state」と「adapter execution state」に意味論上分けて説明されている | Yes | specs/canonical-workflow-state/spec.md (runtime-agnostic, nine-roles, exclusion-rule requirements) |
| 2 | server/UI が依存してよい state surface が明確 | Yes | specs/canonical-workflow-state/spec.md (external-consumer requirement) |
| 3 | local reference implementation に残してよい state が明確 | Yes | specs/canonical-workflow-state/spec.md (local-reference-implementation requirement); specs/workflow-run-state/spec.md (conformance requirement) |
| 4 | canonical state は runtime-agnostic であることが明文化されている | Yes | specs/canonical-workflow-state/spec.md (runtime-agnostic requirement) |
| 5 | core runtime は canonical state を前提に説明できる | Yes | specs/canonical-workflow-state/spec.md (conformance-authority requirement); specs/workflow-run-state/spec.md (normative reference) |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

**Deterministic risks:** none (design ledger `all_resolved` with 0 findings; no impl ledger produced).

**Untested new files:**

- ℹ️ `specs/canonical-workflow-state/spec.md` and `specs/workflow-run-state/spec.md` are the intended spec outputs of this change; they are not test targets.
- ℹ️ `design.md`, `tasks.md`, `task-graph.json`, `proposal.md`, `current-phase.md`, `review-ledger-design.json`, `.openspec.yaml` are workflow-managed artifacts under the change directory, not reviewable implementation files.

No untracked-new-file risk requires human attention for a spec-only change.

**Uncovered criteria:** none (5/5 covered).

**Structural note (non-blocking):**

- This change is spec-only by design; no `CoreRunState` / `LocalRunState` type edits ship with it. If a future runtime consumer discovers that a canonical role cannot be expressed via the current type partition, the discrepancy path declared in `specs/workflow-run-state/spec.md` (`discrepancy-surfacing` scenario) requires recording and handling it in a separate change.

## Human Checkpoints

- [ ] Confirm the nine canonical roles (run identity, change identity, current phase, lifecycle status, allowed events, actor identity, source metadata, history, previous run linkage) exactly match your mental model of "what a workflow instance is" — adding a tenth role later is additive, but removing one later is a breaking spec change.
- [ ] Confirm the exclusion rule (adapter execution state = everything not in the nine canonical roles) is the right maintenance strategy vs. an explicit registry — this was clarification C3 in the proposal.
- [ ] Confirm the normative reference added to `workflow-run-state` is the desired coupling direction (canonical spec is source of truth; types conform) — once merged, future drift between types and canonical semantics is a spec violation.
- [ ] Confirm that leaving interchange format and stability policy as explicit Non-Goals (C5, C2) is still the intended staging — they are unblocked by this change but not scheduled.
- [ ] Confirm you want issue #164 closed by this PR (the commit message will include `Closes`).
