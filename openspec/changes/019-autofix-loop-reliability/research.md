# Research: Auto-fix Loop Reliability

## R1: Dual-Display Pattern Feasibility

**Decision**: Display text prompt before AskUserQuestion at every handoff point.

**Rationale**: Claude Code's `AskUserQuestion` tool renders button UI, but text output before the call is always visible regardless of button rendering. By outputting a text-based option list (with canonical commands) immediately before calling `AskUserQuestion`, the user always has a way to respond even if buttons fail to render.

**Alternatives considered**:
- Watchdog timeout to detect non-rendering → rejected: no reliable detection mechanism in Claude Code
- Default auto-selection on dismiss → rejected: user explicitly chose "wait for input" pattern
- Retry AskUserQuestion → rejected: adds delay without guaranteeing success

## R2: Input Race Condition Handling

**Decision**: First-wins rule — the first valid input received (via either button click or text) is accepted; subsequent inputs are ignored.

**Rationale**: In Claude Code, AskUserQuestion blocks the conversation until the user responds. If the user types text before interacting with buttons, the text is processed as the user's response. There is no true parallel input channel — AskUserQuestion and text input are serialized by the conversation model. The "race condition" is theoretical; in practice, the user's first action (text or button) resolves the prompt.

**Alternatives considered**:
- Explicit channel locking → rejected: unnecessary given Claude Code's serialized input model
- Confirmation step after input → rejected: adds friction without benefit

## R3: Actionable Findings Definition

**Decision**: "Actionable" findings are those with `status ∈ {"new", "open"}`. This is already used in `specflow.impl_review.md` (lines 255-261) but not formally defined in the spec.

**Rationale**: The existing review ledger schema uses these statuses: `new`, `open`, `resolved`, `accepted_risk`, `ignored`. Only `new` and `open` represent findings that need action. `resolved` is done, `accepted_risk`/`ignored` are deliberate overrides.

**Alternatives considered**: None — this is the existing convention, just needs to be made explicit.

## R4: Ledger Error Recovery

**Decision**: Mark ledger error recovery as out-of-scope for this feature. The existing `specflow.impl_review.md` already has ledger recovery logic (backup/restore, corrupt file handling). This feature focuses only on ensuring handoff prompts are always visible.

**Rationale**: The Codex review finding (R3-F03) flagged this, but the existing recovery logic is adequate. Adding dual-display to the error recovery path is low-value since ledger corruption is rare.

## R5: Files to Modify

| File | Changes | Lines Affected |
|------|---------|---------------|
| `global/specflow.impl_review.md` | Add dual-display at 5 handoff points, add status messages, define actionable findings explicitly, add first-wins rule documentation | ~L75, L255-261, L276-283, L293-300, L431-441, L448-457 |
| `global/specflow.fix.md` | Add dual-display at 2 handoff points, add status messages | ~L108, L367-376 |
