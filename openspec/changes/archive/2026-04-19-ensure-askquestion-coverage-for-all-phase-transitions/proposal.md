## Why

Several mainline specflow slash-command guides end their terminal phase in prose ("recommended handoff: design に進む / 中止") instead of presenting the next-step options through an `AskUserQuestion` block. Because no structured question is emitted, the Claude Code UI does not render clickable buttons for the handoff choice, so users must type the slash command manually. The reported failure mode is at `spec_ready` — after `/specflow` finishes, no button to run `/specflow.design` appears (GitHub issue #171). The same gap exists at the end of `/specflow.design` (`design_ready` → `/specflow.apply`) and `/specflow.apply` (`apply_ready` → `/specflow.approve`).

Source: https://github.com/skr19930617/specflow/issues/171

## Definitions

**Mainline terminal-handoff phase**: A terminal gate phase in the mainline workflow's run-state machine (defined by the `canonical-workflow-state` spec) where the run halts and the operator must choose the next slash-command to run. The authoritative set for this change is:

- `spec_ready` — handed off by `/specflow`
- `design_ready` — handed off by `/specflow.design`
- `apply_ready` — handed off by `/specflow.apply`

Review-loop intermediate states (`review_with_findings`, `loop_with_findings`, etc.) are outside this definition because they are already handled by `/specflow.review_*` guides with explicit `AskUserQuestion` blocks.

## What Changes

- Require each mainline command guide that leaves the run in a terminal-handoff phase (as defined above) to present its next-step options via an `AskUserQuestion` block, not prose-only text.
- Apply this rule to the three broken guides and their templates:
  - `/specflow` at `spec_ready` → options include `/specflow.design` (proceed) and `/specflow.reject` (abort)
  - `/specflow.design` at `design_ready` → options include `/specflow.apply` (proceed) and `/specflow.reject` (abort)
  - `/specflow.apply` at `apply_ready` → options include `/specflow.approve` (proceed), `/specflow.fix_apply` (fix loop), and `/specflow.reject` (abort)
- Extend the `slash-command-guides` spec with a requirement covering mainline terminal-handoff phases. The spec SHALL assert the **presence of an `AskUserQuestion` block** and the **set of slash-command targets** referenced by its options. Exact wording and option order are left to the templates (not normative in the spec) so they can evolve without spec churn.
- Allow explanatory prose to coexist with the `AskUserQuestion` block (useful for the "読み物として読まれた場合" fallback and for template maintainers) — the spec only forbids prose-only handoffs.
- Update TypeScript-side template-merge / renderer logic in `src/` if and only if experimentation during design shows that current rendering drops or rewrites `AskUserQuestion` blocks. Confirmed in scope for this proposal.
- Accept Claude Code UI as the only validated consumer of the generated guides. No cross-tool compatibility constraints are added.
- Validation for this change: (a) automated structural tests assert the `AskUserQuestion` block and target slash-commands in the three generated files; (b) a manual UI-verification checklist item is added to `tasks.md` — run each transition in a Claude Code session and visually confirm that buttons appear.

Out of scope: review-loop guides (`/specflow.review_design`, `/specflow.review_apply`, `/specflow.fix_design`, `/specflow.fix_apply`) already present `AskUserQuestion` blocks and remain unchanged. Utility/cleanup guides (`/specflow.reject`, `/specflow.dashboard`, `/specflow.setup`, `/specflow.explore`, `/specflow.spec`, `/specflow.license`, `/specflow.readme`) do not reach a mainline terminal-handoff phase and remain exempt.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `slash-command-guides`: Add the contract that each mainline terminal-handoff phase (`spec_ready`, `design_ready`, `apply_ready`) is presented via an `AskUserQuestion` block in its generated guide, with scenarios asserting that the required set of slash-command targets appears in the options. Update the per-command handoff scenarios for `specflow`, `specflow.design`, and `specflow.apply` to replace the prose-only handoff text with the structured block.

## Impact

- Source templates updated: `assets/commands/specflow.md.tmpl`, `assets/commands/specflow.design.md.tmpl`, `assets/commands/specflow.apply.md.tmpl`.
- Generated outputs regenerated: `dist/package/global/commands/specflow.md`, `specflow.design.md`, `specflow.apply.md`.
- TypeScript-side rendering code in `src/` (template merge, `renderPhaseMarkdown`, or equivalents) may be adjusted to preserve `AskUserQuestion` blocks verbatim; confirmed in scope and finalized in `design.md`.
- Structural tests under the `slash-command-guides` suite extended to assert the `AskUserQuestion` block and target slash-commands in the three generated files.
- `tasks.md` includes a manual UI-verification task for the three transitions in Claude Code.
- No changes to workflow state machine semantics, run-state CLI contracts, or phase-contract registries.
