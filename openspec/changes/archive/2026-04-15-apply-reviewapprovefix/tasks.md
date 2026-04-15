## 1. Severity-aware ledger helper ✓

> Introduce unresolvedCriticalHighCount helper replacing unresolvedHighCount with full unit coverage.

- [x] 1.1 Add unresolvedCriticalHighCount(ledger) counting severity ∈ {critical, high} with status ∈ {new, open} in src/lib/review-ledger.ts
- [x] 1.2 Delete unresolvedHighCount helper and sweep all imports via TypeScript rename
- [x] 1.3 Add unit tests with severity matrix fixture (HIGH-only, CRITICAL-only, mixed, LOW/MEDIUM only, empty)
- [x] 1.4 Run tsc --noEmit to confirm no dangling references

## 2. Surface-event schema_version bump ✓

> Add schema_version:2 to review-outcome payload contracts with legacy reader support.

- [x] 2.1 Add schema_version:number field to apply_review_approved / design_review_approved / request_changes / block payload types
- [x] 2.2 Add reader helper flagging legacy_actionable_count_basis:true when schema_version missing or <2
- [x] 2.3 Extend surface-event-schema-drift.test.ts: new events carry schema_version:2; legacy fixtures flagged correctly

## 3. Orchestrator severity gate + schema emission ✓

> Rewire apply/design review orchestrators to gate handoff state on unresolvedCriticalHighCount and emit schema_version:2.

> Depends on: severity-helper, surface-event-schema

- [x] 3.1 Update resultFromLedger in specflow-review-apply.ts to derive state from unresolvedCriticalHighCount>0
- [x] 3.2 Update autofix-loop tail in specflow-review-apply.ts to compute loop_no_findings/loop_with_findings from the new helper
- [x] 3.3 Mirror both changes in specflow-review-design.ts
- [x] 3.4 Populate schema_version:2 on all emitted review-outcome surface events
- [x] 3.5 Confirm decision string is surfaced in UI but not consulted by handoff computation

## 4. Current-phase renderer + ledger status alignment ✓

> Update renderCurrentPhase/renderCurrentPhaseToStore and ledger status derivation to use the severity-aware helper.

> Depends on: severity-helper

- [x] 4.1 Add criticalHigh=unresolvedCriticalHighCount(ledger) in renderCurrentPhase and drive nextAction off criticalHigh>0
- [x] 4.2 Apply same change to renderCurrentPhaseToStore for both apply and design kinds
- [x] 4.3 Rename Open High Findings line to Open High/Critical Findings with breakdown; retain Actionable Findings line
- [x] 4.4 Update ledgerStatus derivation so has_open_high covers critical+high via the new helper (value string unchanged)

## 5. Slash-command guide bodies ✓

> Regenerate review_apply/review_design/approve guides to surface approve-last with severity summary and accepted-risk warning.

> Depends on: orchestrator-gate, renderer-and-ledger-status

- [x] 5.1 Update State-to-Option Mapping in review_apply body: fix, reject, then Approve (last) with severity-summary suffix
- [x] 5.2 Mirror mapping in review_design body: fix, reject, then Apply (last) with severity-summary suffix
- [x] 5.3 Add inline accepted-risk warning shown when approve/apply selected in _with_findings states
- [x] 5.4 Update _no_findings header message to clarify all HIGH+ resolved (LOW/MEDIUM may remain)
- [x] 5.5 Update specflow.approve.md Quality Gate copy to describe critical+high threshold
- [x] 5.6 Regenerate global/commands/*.md via the specflow-generate-commands pipeline

## 6. Tests and severity-matrix fixtures ✓

> Add fixtures and tests covering severity-aware gating across orchestrators, renderer, and generated guides.

> Depends on: orchestrator-gate, renderer-and-ledger-status, slash-command-guides

- [x] 6.1 Add fixtures: HIGH=0/LOW=N, HIGH=0/MEDIUM=M, HIGH=0/CRITICAL=K, HIGH≥1/LOW=N
- [x] 6.2 Refocus existing actionable_count→state tests onto actionableCount as a pure function
- [x] 6.3 Extend specflow-run.test.ts orchestrator cases to confirm critical blocks and HIGH blocks but LOW/MEDIUM do not
- [x] 6.4 Extend generation.test.ts to assert approve/apply is last option with severity summary + accepted-risk warning
- [x] 6.5 Remove any remaining references to unresolvedHighCount or actionable>0 handoff gating
- [x] 6.6 Run bun test and openspec validate apply-reviewapprovefix --type change --json
