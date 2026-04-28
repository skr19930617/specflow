# Approval Summary: clarify-config-ownership-boundaries-and-enable-subagent-dispatch-by-default

**Generated**: 2026-04-27T07:09:55Z
**Branch**: clarify-config-ownership-boundaries-and-enable-subagent-dispatch-by-default
**Status**: ⚠️ 1 unresolved high (cached ledger state — fixes implemented in code; second review pass skipped per operator decision; awaiting human verification)

## What Changed

```
 README.md                                          |   9 +-
 assets/commands/specflow.apply.md.tmpl             |   8 +-
 assets/commands/specflow.fix_design.md.tmpl        |   2 +-
 assets/commands/specflow.md.tmpl                   |   2 +-
 assets/commands/specflow.review_apply.md.tmpl      |   2 +-
 assets/commands/specflow.review_design.md.tmpl     |   2 +-
 src/bin/specflow-init.ts                           |  17 ++
 src/contracts/templates.ts                         |   6 +
 src/lib/apply-dispatcher/config.ts                 | 178 ++++++-------------
 src/lib/apply-dispatcher/index.ts                  |   7 +-
 src/lib/apply-dispatcher/orchestrate.ts            |  21 +++
 src/lib/review-runtime.ts                          |   6 +-
 src/lib/template-files.ts                          |   4 +
 src/tests/__snapshots__/specflow.apply.md.snap     |   8 +-
 .../__snapshots__/specflow.fix_design.md.snap      |   2 +-
 src/tests/__snapshots__/specflow.md.snap           |   2 +-
 .../__snapshots__/specflow.review_apply.md.snap    |   2 +-
 .../__snapshots__/specflow.review_design.md.snap   |   2 +-
 src/tests/apply-dispatcher-classify.test.ts        |   3 +-
 src/tests/apply-dispatcher-config.test.ts          | 194 ++++++++++++++++++---
 src/tests/apply-dispatcher-orchestrate.test.ts     |  92 ++++++++++
 src/tests/generation.test.ts                       |  11 +-
 src/tests/review-cli.test.ts                       |   6 +-
 23 files changed, 409 insertions(+), 177 deletions(-)
```

Plus untracked new files:

- `assets/template/.specflow/config.yaml` (starter shared workflow policy)
- `src/lib/apply-dispatcher/runtime-check.ts` (new `verifyLocalSubagentRuntime` helper)
- `src/lib/specflow-config.ts` (canonical/legacy config loader + warning dedupe)
- `src/tests/dispatch-runtime-check.test.ts`
- `src/tests/specflow-config.test.ts`
- `openspec/changes/clarify-config-ownership-boundaries-and-enable-subagent-dispatch-by-default/` (proposal, design, tasks, spec deltas, ledgers)

## Files Touched

```
README.md
assets/commands/specflow.apply.md.tmpl
assets/commands/specflow.fix_design.md.tmpl
assets/commands/specflow.md.tmpl
assets/commands/specflow.review_apply.md.tmpl
assets/commands/specflow.review_design.md.tmpl
src/bin/specflow-init.ts
src/contracts/templates.ts
src/lib/apply-dispatcher/config.ts
src/lib/apply-dispatcher/index.ts
src/lib/apply-dispatcher/orchestrate.ts
src/lib/review-runtime.ts
src/lib/template-files.ts
src/tests/__snapshots__/specflow.apply.md.snap
src/tests/__snapshots__/specflow.fix_design.md.snap
src/tests/__snapshots__/specflow.md.snap
src/tests/__snapshots__/specflow.review_apply.md.snap
src/tests/__snapshots__/specflow.review_design.md.snap
src/tests/apply-dispatcher-classify.test.ts
src/tests/apply-dispatcher-config.test.ts
src/tests/apply-dispatcher-orchestrate.test.ts
src/tests/generation.test.ts
src/tests/review-cli.test.ts
```

(Plus the untracked files listed above.)

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
| Unresolved high    | 1     |
| New high (later)   | 0     |
| Total rounds       | 1     |

> **Note:** The single high finding (R1-F01: stale generation test) was addressed in code during the same round. Per operator decision, a second review pass was skipped because the diff exceeded the `diff_warn_threshold`. The full test suite (1015 tests) passes after the fixes.

## Proposal Coverage

Acceptance Criteria taken from the issue body (the proposal Capabilities section refers to these):

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | docs/specs に shared workflow policy と local runtime setting の区分が明記されている | Yes | `openspec/changes/<id>/specs/config-ownership-boundaries/spec.md`, `README.md`, `openspec/changes/<id>/proposal.md` |
| 2 | `openspec/config.yaml` と `.specflow/config.env` の責務が説明されている | Yes | `openspec/changes/<id>/specs/config-ownership-boundaries/spec.md`, `README.md` |
| 3 | `apply.subagent_dispatch.*` が shared workflow policy であることが明記されている | Yes | `openspec/changes/<id>/specs/bundle-subagent-execution/spec.md`, `assets/template/.specflow/config.yaml` |
| 4 | `DEFAULT_DISPATCH_CONFIG.enabled` が `true` になっている | Yes | `src/lib/apply-dispatcher/config.ts` |
| 5 | 明示設定がない場合でも、task graph と classification 条件を満たせば dispatcher が有効になる | Yes | `src/lib/apply-dispatcher/config.ts` (default), `src/lib/apply-dispatcher/classify.ts` (eligibility unchanged) |
| 6 | 既存 docs / comments / examples が新しい default に整合している | Yes | `README.md`, all `assets/commands/*.tmpl`, file-level comments in `apply-dispatcher/config.ts` and `review-runtime.ts` |

**Coverage Rate**: 6/6 (100%)

Beyond the original issue criteria, this change also implemented the **redirected design** that emerged during clarify/reclarify:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 7 | `.specflow/config.yaml` is the canonical home for specflow shared workflow policy | Yes | `src/lib/specflow-config.ts`, `assets/template/.specflow/config.yaml`, `src/lib/template-files.ts`, `src/contracts/templates.ts` |
| 8 | Specflow settings in `openspec/config.yaml` are ignored with a deprecation warning | Yes | `src/lib/specflow-config.ts:readSpecflowSharedConfig`, `src/tests/specflow-config.test.ts` |
| 9 | `specflow-init` (both fresh and `--update`) seeds `.specflow/config.yaml` | Yes | `src/bin/specflow-init.ts` |
| 10 | Default-engaged dispatch fails fast on missing local subagent runtime | Yes | `src/lib/apply-dispatcher/runtime-check.ts`, `src/lib/apply-dispatcher/orchestrate.ts:LocalSubagentRuntimeError`, `src/tests/dispatch-runtime-check.test.ts`, orchestration test in `src/tests/apply-dispatcher-orchestrate.test.ts` |
| 11 | Borderline override path (shared yaml → local env) is concrete with `max_concurrency` as the first instance | Yes | `src/lib/specflow-config.ts:applyBorderlineOverride`, `src/lib/apply-dispatcher/config.ts`, `src/tests/apply-dispatcher-config.test.ts` |

## Remaining Risks

1. **Deterministic risks (from impl ledger)** — fixes have been implemented but no second review pass was run, so the ledger still shows `status: new` for all five findings:

   - R1-F01: Guide-generation test still asserts the old default-off dispatcher behavior (severity: high) — *fixed in `src/tests/generation.test.ts`*
   - R1-F02: Update mode does not install the new canonical shared-policy file (severity: medium) — *fixed in `src/bin/specflow-init.ts`*
   - R1-F03: Malformed local override discards the shared `max_concurrency` value (severity: medium) — *fixed in `src/lib/apply-dispatcher/config.ts`*
   - R1-F04: Runtime preflight checks existence instead of actual executability (severity: medium) — *fixed in `src/lib/apply-dispatcher/runtime-check.ts`*
   - R1-F05: No orchestration-level test covers fail-fast before any mutation on invalid runtime (severity: medium) — *fixed in `src/tests/apply-dispatcher-orchestrate.test.ts`*

2. **Untested new files (newly added, not in any finding)**: None — every new code file has a corresponding test.

3. **Uncovered criteria**: None — coverage is 100%.

## Human Checkpoints

- [ ] Verify the five fixes from the impl review are actually in the diff (HIGH F1 + MEDIUM F2-F5) by spot-checking each named file.
- [ ] Confirm that on a fresh clone without `.specflow/config.yaml`, dispatch engages by default when a `task-graph.json` exists with at least one bundle whose `size_score > threshold` — and that the runtime-prereq fail-fast surfaces the expected error message when the agent CLI is missing on PATH.
- [ ] Confirm that an existing repo with `apply.subagent_dispatch.*` still in `openspec/config.yaml` sees the deprecation warning on the next apply run, AND that the legacy value is ignored (defaults take effect).
- [ ] Review the borderline-setting override mechanism for `max_concurrency` — decide whether `SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY` is the right env-var name and whether other settings should also be borderline-classified in a follow-up.
- [ ] Decide whether the cached impl-review `has_open_high` status should block this approval (currently shown as WARNING; the underlying findings are addressed in code but not re-verified by codex).
