# Approval Summary: ensure-askquestion-coverage-for-all-phase-transitions

**Generated**: 2026-04-19T12:46:12Z
**Branch**: ensure-askquestion-coverage-for-all-phase-transitions
**Status**: ⚠️ 1 unresolved high (accepted_risk)

## What Changed

```
 assets/commands/specflow.apply.md.tmpl          | 31 +++++++++-
 assets/commands/specflow.design.md.tmpl         | 27 +++++++-
 assets/commands/specflow.md.tmpl                | 23 ++++++-
 src/tests/__snapshots__/specflow.apply.md.snap  | 31 +++++++++-
 src/tests/__snapshots__/specflow.design.md.snap | 27 +++++++-
 src/tests/__snapshots__/specflow.md.snap        | 23 ++++++-
 src/tests/command-order.test.ts                 | 82 ++++++++++++++++++++++++-
 7 files changed, 237 insertions(+), 7 deletions(-)
```

## Files Touched

- assets/commands/specflow.apply.md.tmpl
- assets/commands/specflow.design.md.tmpl
- assets/commands/specflow.md.tmpl
- src/tests/__snapshots__/specflow.apply.md.snap
- src/tests/__snapshots__/specflow.design.md.snap
- src/tests/__snapshots__/specflow.md.snap
- src/tests/command-order.test.ts

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
| Initial high       | 1     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

(Both findings reclassified to `accepted_risk`: the spec delta and tasks entry exist in `openspec/changes/<id>/` which is untracked at review time, and `openspec archive` will promote them into baseline `openspec/specs/` and `openspec/archive/` at commit time.)

## Proposal Coverage

Spec deltas for this change define three scenarios plus a MODIFIED requirement. Mapping to changed files:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | `specflow.md` spec_ready handoff presents `AskUserQuestion` block referencing `/specflow.design` and `/specflow.reject` | Yes | assets/commands/specflow.md.tmpl, src/tests/__snapshots__/specflow.md.snap, src/tests/command-order.test.ts |
| 2 | `specflow.design.md` design_ready handoff presents `AskUserQuestion` block referencing `/specflow.apply` and `/specflow.reject` | Yes | assets/commands/specflow.design.md.tmpl, src/tests/__snapshots__/specflow.design.md.snap, src/tests/command-order.test.ts |
| 3 | `specflow.apply.md` apply_ready handoff presents `AskUserQuestion` block referencing `/specflow.approve`, `/specflow.fix_apply`, `/specflow.reject` | Yes | assets/commands/specflow.apply.md.tmpl, src/tests/__snapshots__/specflow.apply.md.snap, src/tests/command-order.test.ts |
| 4 | Utility and review-loop guides exempt (no regression) | Yes | (existing snapshots unchanged) |
| 5 | MODIFIED `Mainline workflow guides encode strict phase gates` preserves every baseline scenario verbatim while requiring `AskUserQuestion` for terminal handoffs | Yes | openspec/changes/.../specs/slash-command-guides/spec.md (archive-time) |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

- ⚠️ R1-F01: Normative OpenSpec delta is missing from the reviewed diff (severity: high, status: accepted_risk — resolved at archive time)
- ⚠️ R1-F02: Required manual Claude Code UI verification is not captured (severity: medium, status: accepted_risk — already tracked in task-graph bundle `run-end-to-end-verification` task 3)
- ⚠️ Manual Claude Code UI verification is not runnable from CI: operator must observe buttons at `spec_ready`, `design_ready`, and `apply_ready` in a fresh Claude Code session after the new `dist/` is installed.

## Human Checkpoints

- [ ] Run the install step (`specflow-install` or equivalent) so the updated `dist/package/global/commands/*.md` files reach your global Claude Code command directory, then verify buttons render at `spec_ready`, `design_ready`, and `apply_ready` in a new session.
- [ ] Spot-check that existing review-loop guides (`/specflow.review_design`, `/specflow.review_apply`) still render their `_with_findings` and `_no_findings` options unchanged (no regression).
- [ ] Confirm that `openspec archive` promoted the spec delta into baseline `openspec/specs/slash-command-guides/spec.md` and that the MODIFIED scenarios survived verbatim.
- [ ] Review the commit for any unintended inclusion of untracked files (the approval flow stages everything with `git add -A`).
