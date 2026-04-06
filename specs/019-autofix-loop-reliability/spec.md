# Feature Specification: Auto-fix Loop Reliability

**Feature Branch**: `019-autofix-loop-reliability`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: GitHub Issue #43 — auto-fixループが始まらないことがある

## Clarifications

### Session 2026-04-06

- Q: AskUserQuestion のボタンが表示されない/dismiss された場合のフォールバック動作は？ → A: テキストプロンプトを表示し、ユーザーのテキスト入力を待つ
- Q: レビュー結果が「全件解決済み」の場合の遷移先は？ → A: auto-fix 確認をスキップし、approve/reject/手動修正のハンドオフを直接表示
- Q: 各遷移ポイントでのステータスメッセージの詳細度は？ → A: 簡潔な1行ステータス（例: `✅ Review complete — 3 findings`）
- Q: ボタンが表示されないケースの検出方法は？ → A: 二重表示方式 — AskUserQuestion の直前にテキストプロンプトも表示し、ボタンが出なくてもテキストで応答可能にする

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-fix confirmation is always visible after review (Priority: P1)

After a Codex implementation review completes with actionable findings, the user must always see a clear confirmation prompt to start auto-fix or choose manual fix. The flow must never stall waiting for invisible input.

**Why this priority**: This is the core problem — when the confirmation button doesn't appear, the entire workflow halts with no way forward.

**Independent Test**: Run `/specflow.impl_review` on a feature with known review findings. Verify that a confirmation prompt always appears, regardless of UI rendering conditions.

**Acceptance Scenarios**:

1. **Given** an impl review with actionable findings (status="new" or "open"), **When** the review completes, **Then** a text-based prompt listing the options ("Auto-fix 実行" / "手動修正") with their canonical commands is displayed first, immediately followed by an AskUserQuestion button prompt with the same options. The user may respond via either mechanism.
2. **Given** an impl review with actionable findings, **When** the AskUserQuestion button is dismissed, times out, or fails to render, **Then** the text-based prompt already displayed above remains visible and the system waits for the user's text input before proceeding.
3. **Given** an impl review with no actionable findings (all resolved), **When** the review completes, **Then** the flow automatically proceeds to approval options without waiting for user input about auto-fix.

---

### User Story 2 - Loop completion always transitions clearly (Priority: P1)

When the auto-fix loop completes (success, max rounds, or divergence), the user must always see a clear next-action prompt. The flow must never hang waiting for a button that didn't render.

**Why this priority**: Even when auto-fix starts correctly, the flow can stall again at the loop-completion handoff point.

**Independent Test**: Run an auto-fix loop to completion (e.g., max rounds reached). Verify that a next-action prompt always appears.

**Acceptance Scenarios**:

1. **Given** an auto-fix loop that completes (any stop condition), **When** the loop ends, **Then** a text-based prompt listing the state-appropriate options (per FR-006) with their canonical commands is displayed first, immediately followed by an AskUserQuestion button prompt with the same options. The user may respond via either mechanism.
2. **Given** an auto-fix loop that completes, **When** the next-action AskUserQuestion button is dismissed, times out, or fails to render, **Then** the text-based prompt already displayed above remains visible and the system waits for the user's text input before proceeding.

---

### User Story 3 - Auto-proceed when no fixes needed (Priority: P2)

When a review finds no actionable issues, the flow should not stall waiting for user input about auto-fix. Instead, it should automatically transition to the approval phase.

**Why this priority**: Unnecessary pauses for clean reviews slow down the workflow and create false stall points.

**Independent Test**: Run `/specflow.impl_review` on a feature with no review findings. Verify the flow proceeds to approval handoff without asking about auto-fix.

**Acceptance Scenarios**:

1. **Given** a review with zero actionable findings, **When** the review completes, **Then** the system skips the auto-fix confirmation and presents the approval handoff options ("Approve" / "手動修正" / "中止") directly via dual-display.
2. **Given** a review where all findings are already resolved, **When** the review completes, **Then** the system reports "All findings resolved" and presents the same approval handoff options via dual-display.

---

### Edge Cases

- What happens when AskUserQuestion times out or buttons don't render? → The text-based prompt (displayed before the AskUserQuestion call) is already visible. The user responds via text input.
- What happens when the user dismisses the button dialog? → Same as above — the pre-displayed text prompt remains visible and the system waits for text input.
- What happens when the review ledger file is missing or corrupt? → Must report the error and offer to re-run the review.
- What happens during a re-review (not initial review)? → Same button/fallback behavior must apply consistently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: At every handoff point, the system MUST first display a text-based prompt listing all available options with their canonical text commands, then immediately call AskUserQuestion with the same options as buttons. This dual-display ensures the user can always respond regardless of whether buttons render. Text replies are accepted at any time — the text prompt is displayed before AskUserQuestion, so there is no "pending" state that blocks text input.
- **FR-002**: If AskUserQuestion is dismissed, times out, or fails to render, the system MUST rely on the pre-displayed text prompt and wait for the user's text input. The system MUST NOT auto-select an option or proceed without user input. If the user's text input does not match any canonical command, the system MUST re-display the text prompt with the available options and wait again.
- **FR-003**: System MUST automatically skip the auto-fix confirmation when a review has zero actionable findings (all resolved or none found) and proceed directly to the approval handoff (which also uses the dual-display pattern).
- **FR-004**: System MUST display a next-action prompt (dual-display: text + AskUserQuestion) after every auto-fix loop completion, regardless of the stop condition (success, max rounds, divergence).
- **FR-005**: System MUST display a concise 1-line status message at each transition point (e.g., `✅ Review complete — 3 findings`), covering: review complete, auto-fix confirmation, each loop round, loop complete, and next-action handoff.
- **FR-006**: The exact options shown at each handoff state MUST be:
  - **After review with actionable findings**: "Auto-fix 実行" (`/specflow.fix autofix`) / "手動修正" (`/specflow.fix`)
  - **After review with zero actionable findings (or all resolved)**: "Approve" (`/specflow.approve`) / "手動修正" (`/specflow.fix`) / "中止" (`/specflow.reject`)
  - **After auto-fix loop completion with remaining findings**: "Auto-fix 続行" (`/specflow.fix autofix`) / "手動修正" (`/specflow.fix`) / "Approve" (`/specflow.approve`) / "中止" (`/specflow.reject`)
  - **After auto-fix loop completion with no remaining findings**: "Approve" (`/specflow.approve`) / "手動修正" (`/specflow.fix`) / "中止" (`/specflow.reject`)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every impl review completion results in a visible user prompt — no silent stalls occur at the auto-fix confirmation point.
- **SC-002**: Every auto-fix loop completion results in a visible next-action prompt — no silent stalls occur at the loop-completion handoff.
- **SC-003**: Reviews with no actionable findings proceed to approval options without requiring user input about auto-fix.
- **SC-004**: Dismissed or timed-out prompts always produce a fallback message with clear next-step instructions — never a silent hang.
