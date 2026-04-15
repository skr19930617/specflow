## Context

Issue [skr19930617/specflow#145](https://github.com/skr19930617/specflow/issues/145) reports a usability and contract-mismatch bug: even when the apply-review result is conceptually "approve", the handoff forces the user into `/specflow.fix_apply` if any LOW-severity finding remains open in the ledger. The current source of truth is the general-purpose helper `actionableCount(ledger)` (all severities, `status ∈ {new, open}`), used in three places:

- `src/bin/specflow-review-apply.ts` (`resultFromLedger` → `state: actionable > 0 ? "review_with_findings" : "review_no_findings"`, autofix loop tail → `state: actionable === 0 ? "loop_no_findings" : "loop_with_findings"`)
- `src/lib/review-runtime.ts` (`renderCurrentPhase` / `renderCurrentPhaseToStore` → `nextAction: actionable > 0 ? "/specflow.fix_apply" : "/specflow.approve"`)
- `global/commands/specflow.review_apply.md` (State-to-Option Mapping section derived from the above)

This contradicts [openspec/specs/review-orchestration/spec.md:131](openspec/specs/review-orchestration/spec.md#L131), which already states "if no unresolved `high` findings remain it SHALL return `handoff.state = "review_approved"`". The code has drifted from the spec, and the user experience forces a fix loop for low-severity cosmetic findings. The design review path has the same drift (`src/bin/specflow-review-design.ts`).

The approved proposal scopes the fix to align code + spec + guides + contracts around a single severity-aware helper `unresolvedCriticalHighCount(ledger)` covering both `critical` and `high`, preserves the external state-name surface (`review_no_findings` / `review_with_findings` / `loop_no_findings` / `loop_with_findings`), bumps the surface-event payload `schema_version` to `2` so legacy consumers can distinguish the old actionable-count semantics, and adds approve (or apply, for the design phase) as a last-position non-primary option in every `_with_findings` state.

## Goals / Non-Goals

**Goals:**
- Make approve reachable directly from `apply_review` whenever `unresolvedCriticalHighCount == 0`, regardless of LOW/MEDIUM findings.
- Apply the same rule to `design_review` for symmetry and to match the generic wording in `review-orchestration/spec.md`.
- Replace every inline HIGH-only or all-severity gate check with a single shared helper `unresolvedCriticalHighCount` so the gate cannot drift again.
- Preserve the external surface-event / run-state / ledger state names so existing automation, dashboards, and persisted runs keep working.
- Introduce a minimal, explicit migration signal (`schema_version: 2`) so downstream consumers can distinguish pre-change and post-change outcome events.
- Update slash-command guides so `_with_findings` states still let users consciously pick approve (with severity summary + accepted-risk warning), matching the user's intent to "fix the true transition on the state machine".

**Non-Goals:**
- Renaming any state, event, or handoff identifier (`review_no_findings`, `apply_review_approved`, etc.) — out of scope to preserve backward compatibility.
- Changing the state machine transitions themselves (`src/lib/workflow-machine.ts` already allows `apply_review_approved` from `apply_review`; the bug is in the handoff layer, not the machine).
- Reinterpreting historical ledgers or persisted events. Old events stay as-is; `schema_version < 2` consumers carry `legacy_actionable_count_basis: true`.
- Changing the `actionableCount` helper or the approval-summary Remaining Risks aggregation — those remain severity-agnostic by design.
- Introducing new config knobs (e.g., `approve_block_severity`) — clarification chose the fixed HIGH+ threshold.
- Adding a MEDIUM-specific warning step — clarification kept `severity_summary` display as sufficient.

## Decisions

### D1 — Single shared helper `unresolvedCriticalHighCount`

Introduce `unresolvedCriticalHighCount(ledger: ReviewLedger): number` in [src/lib/review-ledger.ts](src/lib/review-ledger.ts) alongside `actionableCount` and `severitySummary`. Signature mirrors `unresolvedHighCount` (the function it replaces) but counts `severity ∈ {critical, high}` with `status ∈ {new, open}`. Delete `unresolvedHighCount` and migrate every caller (apply + design review orchestrators, review-runtime renderers, tests, fixtures) to the new helper.

- *Why:* The bug shape (inline severity predicates scattered across four files) proves that ad-hoc gating drifts. A single helper with a single test suite enforces one meaning.
- *Alternative rejected:* Keep `unresolvedHighCount` and add a sibling `unresolvedCriticalHighCount`, letting callers pick — rejected (clarification C2) because mixed usage is exactly how the current bug was introduced.
- *Alternative rejected:* Mutate `unresolvedHighCount` to include critical without renaming — rejected because the function name would lie.

### D2 — Gate is pure severity arithmetic, not reviewer `decision`

The handoff decision uses only `unresolvedCriticalHighCount(ledger) > 0`. The free-form `decision` string from the review agent (e.g., `"approve"`, `"request_changes"`) is surfaced in the UI but not consulted by the orchestrator or renderer.

- *Why:* The ledger is the system of record; the `decision` field is advisory LLM output that can contradict the ledger (e.g., an agent that says "approve" but still files HIGH findings). `review-orchestration/spec.md` already frames approval as a function of unresolved HIGH findings, so keying off the ledger keeps the contract consistent.
- *Alternative rejected:* `decision == "approve" && HIGH+ == 0` — rejected (clarification round 1) as double-gating introduces ambiguity when the two disagree.

### D3 — Preserve state names, bump payload `schema_version`

Keep the four handoff state names (`review_no_findings`, `review_with_findings`, `loop_no_findings`, `loop_with_findings`). Redefine their semantics in spec so `_no_findings` ≡ `unresolvedCriticalHighCount == 0` and `_with_findings` ≡ `unresolvedCriticalHighCount > 0`. Bump the surface-event review-outcome payload schema: add `schema_version: number` (required on new events, value `2`). On read, payloads missing `schema_version` or with `schema_version < 2` are treated as legacy (`legacy_actionable_count_basis: true`).

- *Why:* External consumers (dashboards, stored events, any future enterprise-agent-ops integrations) cannot tell "old `_no_findings`" (all severities zero) from "new `_no_findings`" (HIGH+ zero) without a version discriminator. Renaming would force a breaking change on every consumer; bumping a schema field is cheap and additive.
- *Alternative rejected:* Rename to `review_approved` / `review_blocking_findings` — rejected (clarification C4 → "名称は維持、意味のみ更新") to preserve backward compat on persisted events, ledger files, and surface adapters.
- *Alternative rejected:* Ship a `specflow-events backfill` tool — rejected as scope creep and potentially destructive on audit trails.

### D4 — Approve always available in `_with_findings`, positioned last, with warning

In all `_with_findings` handoffs (both apply and design), the slash-command guides list fix and reject first, then approve (for apply) or apply (for design) as the last option. The approve/apply label carries a severity-summary suffix (e.g., `Approve (HIGH 2, MEDIUM 1 を accepted risk として残す)`). Selection triggers an inline "HIGH+ findings が残存しています。accepted_risk 運用を確認してください" warning, followed by the existing slash-command flow.

- *Why:* Clarification C3 fixed "表示順と警告文言を spec で固定 (Recommended)". Users who knowingly want to accept risk can proceed; accidental approve is guarded by position + warning. This also mirrors the current `loop_with_findings` UX (already exposing approve), generalized to all with-findings states.
- *Alternative rejected:* Hide approve in `_with_findings` (strict mode) — rejected because it blocks the user's explicit "state machine の真の遷移として固定" goal.
- *Alternative rejected:* Make approve primary — rejected because HIGH+ findings still warrant a primary fix path.

### D5 — Apply and design review move together

Every change applied to apply-review (`src/bin/specflow-review-apply.ts`, `global/commands/specflow.review_apply.md`, current-phase `kind="apply"` branch) is mirrored for design-review (`src/bin/specflow-review-design.ts`, `global/commands/specflow.review_design.md`, current-phase `kind="design"` branch). The handoff fix-target changes: design's `_with_findings` lists `/specflow.apply` as the last option (binding-approval equivalent for design is "move forward to apply"), while apply's `_with_findings` lists `/specflow.approve`.

- *Why:* `review-orchestration/spec.md` already speaks generically about "review approval"; apply-only fix would leave design visibly drifted and spec partially satisfied.
- *Alternative rejected:* Apply-only, defer design to a follow-up issue — rejected (clarification C6) because the same spec clause governs both and splitting would reopen the drift.

### D6 — `has_open_high` ledger status value

The existing ledger-level status value `has_open_high` already implies "contains unresolved findings worth gating approve". Two options:

- **D6a (chosen):** Expand the semantics of `has_open_high` to cover both `critical` and `high` (i.e., the helper used to compute the ledger status becomes `unresolvedCriticalHighCount > 0`). Leave the string value unchanged. `specflow.approve.md` Quality Gate text updates to clarify the threshold covers critical+high.
- D6b (rejected): Add a new status value `has_open_high_or_critical`, deprecate `has_open_high`. Would force all ledger serializers and consumers to learn a new enum value immediately — violates the "preserve state names" principle of D3.

Choosing D6a keeps the persisted enum stable and only requires a documentation update in the approve guide plus a code update in the ledger status computation (one helper call swap).

### D7 — `schema_version` value and scope

- Numeric `schema_version` rather than a semver string — simplicity; matches the rest of the spec.
- Scope limited to review-outcome payloads (`design_review_approved`, `apply_review_approved`, `request_changes`, `block`). Other payload families (approval, reject, clarify, resume) are unaffected and SHALL NOT carry `schema_version`.
- Consumers reading mixed event streams compare per event-type; unknown payload fields already fall under the existing "forward compatibility" scenario.

### D8 — Current-phase rendering

`renderCurrentPhase` / `renderCurrentPhaseToStore` in [src/lib/review-runtime.ts](src/lib/review-runtime.ts) each have `const actionable = actionableCount(ledger);` and use `actionable` for the `nextAction` decision. Add `const criticalHigh = unresolvedCriticalHighCount(ledger);`, use `criticalHigh > 0` for `nextAction`, keep `actionable` only for the `Actionable Findings:` line (so the Remaining Risks total stays visible). The `Open High Findings:` line updates to "Open High/Critical Findings" with the critical+high breakdown; if no finding carries critical severity anywhere in fixtures/history, the visual change is purely additive.

### D9 — Test strategy

- Existing unit tests that assert `actionable_count` drives `state` become focused tests for `actionableCount` as a pure function (severity-agnostic).
- New unit tests for `unresolvedCriticalHighCount` with a severity matrix fixture.
- Orchestrator tests (`src/tests/specflow-run.test.ts`, `src/bin` tests) gain new fixtures: HIGH=0/LOW=N, HIGH=0/MEDIUM=M, HIGH=0/CRITICAL=K (to confirm critical blocks), HIGH≥1/LOW=N (to confirm HIGH blocks).
- Generation test (`src/tests/generation.test.ts`) asserts `specflow.review_apply.md` and `specflow.review_design.md` contain approve/apply as last option in with-findings states, include a severity-summary suffix, and include the accepted-risk warning.
- `src/tests/surface-event-schema-drift.test.ts` (extend or add alongside) verifies new outcome events include `schema_version: 2` and legacy events are flagged `legacy_actionable_count_basis: true` on read.

## Risks / Trade-offs

- **Risk:** Consumers treating `_no_findings` as "zero actionable findings of any severity" may now see approve offered with LOW/MEDIUM remaining.
  → **Mitigation:** `schema_version: 2` lets consumers branch on semantics. Approval Summary still lists Remaining Risks. `severity_summary` in handoff payload gives a per-state breakdown for any dashboard needing the old number.

- **Risk:** Users who relied on "fix_apply only" UX for polishing LOW findings may accidentally approve.
  → **Mitigation:** `_no_findings` header message updated to "all HIGH+ findings resolved (LOW/MEDIUM may remain)" with the severity_summary attached. `_with_findings` accepted-risk warning is always inline when approve is picked.

- **Risk:** Helper rename `unresolvedHighCount` → `unresolvedCriticalHighCount` is a source-level breaking change for any third-party TypeScript consumer of `src/lib/review-ledger.ts`.
  → **Mitigation:** The module is internal to the `specflow` runtime; no public package export references it. Search confirms all callers are in this repo. Removal is a single-line sweep.

- **Risk:** Symmetric design-review change expands blast radius beyond the issue's literal wording.
  → **Mitigation:** Clarification C6 confirmed. `review-orchestration/spec.md` already speaks generically about review approval, so the design branch was already drifted and getting it together avoids revisiting the same area in a follow-up.

- **Trade-off:** `schema_version` could have been per-event (e.g., separate version per event type) instead of payload-scoped. Chose single value because all review-outcome payloads change together in this release; a finer-grained version would add schema complexity without current benefit.

## Migration Plan

1. **Contract:** Add `schema_version: number` to review-outcome payload TypeScript types in [src/contracts/surface-events.ts](src/contracts/surface-events.ts). Update runtime emitters to populate `2`. Add reader-side helper to flag legacy events.
2. **Helper:** Add `unresolvedCriticalHighCount` to [src/lib/review-ledger.ts](src/lib/review-ledger.ts). Delete `unresolvedHighCount`. Sweep all imports. (A single TypeScript rename covers most call-sites; verify with `tsc --noEmit`.)
3. **Orchestrators:** Update [src/bin/specflow-review-apply.ts](src/bin/specflow-review-apply.ts) and [src/bin/specflow-review-design.ts](src/bin/specflow-review-design.ts) so `resultFromLedger` and autofix-loop tails compute `state` from `unresolvedCriticalHighCount`.
4. **Renderer:** Update [src/lib/review-runtime.ts](src/lib/review-runtime.ts) `renderCurrentPhase` / `renderCurrentPhaseToStore` for both apply and design kinds.
5. **Ledger status:** Update `ledgerStatus` (or equivalent) so `has_open_high` now covers critical+high.
6. **Guides:** Rewrite State-to-Option Mapping + Actionable Findings section + header messages in `global/commands/specflow.review_apply.md` and `global/commands/specflow.review_design.md`. Update `global/commands/specflow.approve.md` Quality Gate copy to describe the critical+high threshold.
7. **Tests:** Add new ledger fixtures (HIGH=0/LOW=N etc.), expand existing orchestrator and generation tests, extend surface-event schema-drift tests for `schema_version` handling.
8. **CI:** No CI config change required (existing bun/typecheck/test pipeline covers the above).

Rollback strategy: a single revert of the merged PR restores the previous behavior. Legacy events remain valid; new events with `schema_version: 2` become unrecognized by readers that revert — but they would still be decoded as "legacy", and no new event type is introduced, so rollback is safe.

## Open Questions

None. All proposal-challenge clarifications resolved in the approved proposal (round 2). Implementation order (helper → orchestrators → renderer → guides → tests) is established in the tasks artifact generated next.

## Concerns

- **C1 — Approve reachability when HIGH+ unresolved = 0 (primary user-facing concern):** Primary UX bug from the issue. Resolved by D1+D2+D8 (severity-aware helper drives both handoff state and current-phase next-action).
- **C2 — Approve reachability when HIGH+ unresolved ≥ 1 (explicit accepted-risk path):** Users must be able to consciously approve with HIGH+ findings (e.g., after manually marking them `accepted_risk`). Resolved by D4 (approve is last option + warning) in slash-command guides.
- **C3 — Backward compatibility for persisted events and ledgers:** Downstream consumers must not misinterpret post-change events against pre-change semantics. Resolved by D3 + D7 (`schema_version` + `legacy_actionable_count_basis` flag).
- **C4 — Approve Quality Gate consistency:** `specflow.approve.md` Quality Gate must use the same threshold as the upstream handoff, or the two paths can disagree. Resolved by D6 (`has_open_high` semantics expanded to critical+high).
- **C5 — Design-review parity:** Apply-only fix would leave `specflow-review-design` drifted against the same generic `review-orchestration` clause. Resolved by D5 (symmetric changes).

## State / Lifecycle

- **Canonical state (unchanged):** run-state machine in [src/lib/workflow-machine.ts](src/lib/workflow-machine.ts). Transitions `apply_review → apply_ready` via `apply_review_approved` and `design_review → design_ready` via `design_review_approved` are untouched.
- **Handoff state (meaning changes, names unchanged):** `review_no_findings`, `review_with_findings`, `loop_no_findings`, `loop_with_findings` in handoff payloads produced by `specflow-review-apply` and `specflow-review-design`. Semantics now keyed off HIGH+ unresolved count rather than actionable count.
- **Derived state:** `nextAction` line in `current-phase.md`, `Open High Findings` line in `current-phase.md`, `specflow.approve.md` Quality Gate WARNING block — all re-derive from the new helper per read.
- **Persistence-sensitive state:**
  - `review-ledger.json` / `review-ledger-design.json`: `findings[].severity` and `findings[].status` remain the authoritative inputs. No schema change.
  - Surface-event payloads: `schema_version: 2` is the *only* additive persisted field. Readers must tolerate its absence on legacy events (D7).
  - Run-state JSON under `.specflow/runs/<RUN_ID>/`: untouched.
- **Lifecycle boundary for this change:** Orchestrator-level. The implementation does not touch run-state advance events; it only changes what the `handoff.state` field reads as.

## Contracts / Interfaces

- **ui ↔ orchestrator:** Slash-command guides in `global/commands/*.md` consume `handoff.state`, `handoff.actionable_count`, and `handoff.severity_summary`. No new fields; state-name semantics re-documented.
- **orchestrator ↔ ledger:** `ReviewLedger` schema in [src/contracts/](src/contracts/) unchanged. New consumer-side invariant: every call site that previously used `unresolvedHighCount` now uses `unresolvedCriticalHighCount`.
- **orchestrator ↔ surface-events:** New payload field `schema_version: number` on `apply_review_approved` / `design_review_approved` / `request_changes` / `block`. Reader helpers added for `legacy_actionable_count_basis`.
- **renderer ↔ storage (`current-phase.md`):** Output format adds critical to the existing "Open High Findings" line (renamed internally to "Open High/Critical Findings" label; actual rendering fallback is additive).
- **slash-command ↔ approve guide (`specflow.approve.md`):** Quality Gate reads `ledger.status`; interpretation of `has_open_high` is expanded but the enum value is unchanged.
- **test fixtures ↔ ledger helpers:** New fixtures under `src/tests/fixtures/` for HIGH=0/LOW=N, HIGH=0/MEDIUM=M, HIGH=0/CRITICAL=K, HIGH≥1/LOW=N matrices. Existing fixtures keep current semantics for legacy-path testing.

## Persistence / Ownership

- **Owned by `src/lib/review-ledger.ts` (this change):** `unresolvedCriticalHighCount` helper and its unit tests. `actionableCount` remains co-owned but untouched.
- **Owned by `src/bin/specflow-review-apply.ts` + `src/bin/specflow-review-design.ts` (this change):** Handoff-state construction (`resultFromLedger`, autofix-loop tail).
- **Owned by `src/lib/review-runtime.ts` (this change):** `renderCurrentPhase` / `renderCurrentPhaseToStore`.
- **Owned by `global/commands/` (this change):** Generated slash-command guide markdown (via `specflow-generate-commands` pipeline). The generator is in [src/contracts/command-bodies.ts](src/contracts/command-bodies.ts); guide bodies there are the ultimate source of truth.
- **Shared/read-only:** `openspec/changes/<change>/review-ledger*.json` — reading only, not mutating.
- **Data ownership boundary (unchanged):** Review ledger is owned by the orchestrators; run state by the state machine; spec deltas by the OpenSpec CLI. This change touches orchestrator-layer outputs only.

## Integration Points

- **Downstream: surface-event consumers (dashboard adapters, enterprise-agent-ops harness, any future Linear/Slack surfaces).** `schema_version` gate is the integration point. Consumers must treat `schema_version < 2` or missing as legacy.
- **Downstream: current-phase.md readers (the `/specflow.approve` Quality Gate flow, and any future dashboard that parses the file).** Additive text — no parse-time breakage expected because the file uses labelled lines (`- Phase:`, `- Round:`, etc.) not ordinal positions.
- **Upstream: review agent.** Unchanged — the review agent still returns findings with per-item severity. The handoff computation merely changes how those findings are aggregated.
- **Cross-file: `global/commands/*.md` generation pipeline.** Command body generation uses the contracts in [src/contracts/command-bodies.ts](src/contracts/command-bodies.ts). Tests assert the rendered markdown; generator must be updated in lockstep.
- **Regeneration / retry boundary:** `specflow-review-apply review`, `autofix-loop`, `fix-review` entry points continue to be the re-entrant boundary. Idempotent from the ledger's point of view (the helper is a pure function of the ledger snapshot).

## Ordering / Dependency Notes

Implementation order, strict:

1. **Helper + unit tests** (`unresolvedCriticalHighCount` in [src/lib/review-ledger.ts](src/lib/review-ledger.ts)). Foundational. Allows TDD for the rest.
2. **Orchestrator source update** ([src/bin/specflow-review-apply.ts](src/bin/specflow-review-apply.ts) + [src/bin/specflow-review-design.ts](src/bin/specflow-review-design.ts)). Swap severity check, add `schema_version` emission.
3. **Contract update** ([src/contracts/surface-events.ts](src/contracts/surface-events.ts) + any reader helpers). `schema_version` field added to review-outcome payload types.
4. **Renderer update** ([src/lib/review-runtime.ts](src/lib/review-runtime.ts)). Both `renderCurrentPhase` and `renderCurrentPhaseToStore`, both apply and design kinds.
5. **Ledger status computation** (if `ledgerStatus` / `has_open_high` derivation lives separately). Ensure it uses the new helper.
6. **Slash-command guide bodies** ([src/contracts/command-bodies.ts](src/contracts/command-bodies.ts) — body of `specflow.review_apply`, `specflow.review_design`, `specflow.approve`). Update State-to-Option mapping, Actionable Findings definition, `_no_findings` and `_with_findings` header messages, approve-option wording + warning.
7. **Tests**: `src/tests/generation.test.ts`, `src/tests/specflow-run.test.ts`, `src/tests/surface-event-schema-drift.test.ts`, orchestrator/runtime tests, plus any existing tests that referenced `unresolvedHighCount` or the old `actionable > 0` semantics.
8. **Fixtures**: Add new severity-matrix fixtures; update legacy fixtures only if their assertions collide with the new semantics.

Steps 2–6 can overlap once step 1 is green, but PR should land them together.

Parallelizable: nothing strictly — this is a narrow, vertical coordination change. Tests (step 7) and guide updates (step 6) can be drafted in parallel with orchestrator/renderer (steps 2/4), but review readability benefits from a single PR.

## Completion Conditions

This change is complete when all of the following hold:

1. `unresolvedCriticalHighCount` exists in [src/lib/review-ledger.ts](src/lib/review-ledger.ts) with unit tests; `unresolvedHighCount` is gone; `tsc --noEmit` is green.
2. `specflow-review-apply review <CHANGE_ID>` on a ledger with HIGH=0, LOW≥1 returns `handoff.state == "review_no_findings"`; same for `autofix-loop` returning `loop_no_findings`.
3. `specflow-review-design review <CHANGE_ID>` on a ledger with HIGH=0, LOW≥1 returns `handoff.state == "review_no_findings"`; same for its autofix-loop.
4. `current-phase.md` for both apply and design kinds shows `Next Recommended Action: /specflow.approve` (apply) / `/specflow.apply` (design) when HIGH+ unresolved == 0, even if LOW/MEDIUM remain.
5. Generated `specflow.review_apply.md` and `specflow.review_design.md` list approve / apply as the last option in every `_with_findings` state, with a severity-summary suffix and accepted-risk warning.
6. Generated `specflow.approve.md` Quality Gate copy mentions critical+high as the threshold; `ledger.status == has_open_high` is produced when either critical or high unresolved findings exist.
7. Surface-event payloads for `apply_review_approved` / `design_review_approved` / `request_changes` / `block` include `schema_version: 2` on new emissions; reader helpers flag legacy payloads.
8. `bun test` (the full suite) passes. No test still references `unresolvedHighCount` or `actionable > 0` gating for handoff state.
9. `openspec validate apply-reviewapprovefix --type change --json` remains valid (already true from `spec_ready`).
10. `/specflow.review_design` on this change (the actual handoff loop invoked later by `/specflow.design`) passes without HIGH-severity findings.
