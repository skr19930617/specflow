## Context

specflow slash-commands are Markdown guides that Claude Code reads at runtime. When a guide wants Claude Code to present the operator with a clickable choice, it must embed a pseudo-block of the form `AskUserQuestion:` + YAML-like options. At runtime the agent interprets that block and calls the real `AskUserQuestion` tool, which renders buttons in the Claude Code UI.

The three mainline workflow commands currently end their terminal phase with prose-only handoff text:

- `assets/commands/specflow.md.tmpl` Step 9 "Design Handoff" (`spec_ready` → `/specflow.design`) — lines 285–293.
- `assets/commands/specflow.design.md.tmpl` Step 4 (`design_ready` → `/specflow.apply`) — line 121.
- `assets/commands/specflow.apply.md.tmpl` Step 2 (`apply_ready` → `/specflow.approve`) — line 104.

Because no `AskUserQuestion:` block is emitted, the UI shows no button and the operator must type the next slash command by hand. GitHub issue #171 reports this at `spec_ready`. The same gap exists at `design_ready` and `apply_ready`.

Review-loop and utility commands already use `AskUserQuestion:` blocks correctly (`specflow.review_design.md.tmpl`, `specflow.review_apply.md.tmpl`, `specflow.decompose.md.tmpl`, `specflow.spec.md.tmpl`, etc.) and are out of scope.

## Goals / Non-Goals

**Goals:**

- Claude Code renders clickable buttons at the three mainline terminal-handoff transitions without requiring the operator to type slash commands by hand.
- The `slash-command-guides` spec encodes the presence of the `AskUserQuestion` block and the required set of slash-command targets at those transitions, so future regressions are caught by existing structural tests.
- Manual UI verification is documented in `tasks.md` so the fix is observed, not just asserted structurally.
- Changes preserve every existing scenario in the `slash-command-guides` spec (only additions and one tightening).

**Non-Goals:**

- Do NOT change the workflow state machine (`canonical-workflow-state`), phase-contract registries, or run-state CLI semantics.
- Do NOT modify review-loop command guides that already emit `AskUserQuestion:` blocks.
- Do NOT prescribe exact button labels or option ordering in the spec; those are intentionally left to templates so copy can evolve without spec churn.
- Do NOT add cross-tool compatibility constraints (Cursor, Codex CLI, etc.); Claude Code UI is the only validated consumer.
- Do NOT introduce a new `terminalHandoff` metadata field on `commandContracts` — the runtime is template-driven and the renderer passes `AskUserQuestion:` blocks through verbatim, so TS-side changes are not required (see Decisions).

## Decisions

### Decision 1: Fix is a pure template change; no renderer changes required

**Decision:** Add `AskUserQuestion:` blocks directly inside the existing terminal-step sections of the three `.md.tmpl` files. Do not modify TypeScript renderer / template-resolver code.

**Rationale:** `src/contracts/template-resolver.ts` replaces only `{{insert|contract|render:}}` tags and splits on `## headings`; all other prose (including `AskUserQuestion:` pseudo-blocks) is copied through verbatim into `dist/package/global/commands/*.md`. The review-loop templates already rely on this behavior, so the mechanism is proven.

**Alternatives considered:**

- *Add a `terminalHandoff` field to `commandContracts` and have the renderer inject the block automatically.* Rejected: (a) increases blast radius across `src/contracts/`, `src/build.ts`, and test snapshots; (b) option wording is currently Japanese, which templates capture more naturally than contracts; (c) the existing review-loop commands prove the template-level approach works.
- *Delete the prose and put the block in a new `Skill`-invoked flow.* Rejected: Step 9 in `/specflow` intentionally closes the command there and hands off; injecting an extra skill would change control flow for no UI benefit.

### Decision 2: `AskUserQuestion:` block format matches the review-loop convention

**Decision:** Use the existing block syntax already used in `specflow.review_design.md.tmpl` and `specflow.review_apply.md.tmpl`:

```
AskUserQuestion:
  question: "<prompt>"
  options:
    - label: "<label>"
      description: "<short description>"
```

Blocks SHALL continue to be written in Japanese, matching existing templates, until/unless a broader i18n pass is proposed separately.

**Rationale:** Keeps a single idiom across all specflow guides and avoids one-off stylistic variation.

### Decision 3: Include and exclude sets for the new requirement

**Decision:** The new `slash-command-guides` requirement applies only to mainline terminal-handoff phases (`spec_ready`, `design_ready`, `apply_ready`). Utility commands (`specflow.reject`, `specflow.dashboard`, `specflow.setup`, `specflow.explore`, `specflow.spec`, `specflow.license`, `specflow.readme`) and review-loop commands (`specflow.review_*`, `specflow.fix_*`) are explicitly exempt in the spec text.

**Rationale:** The reported defect is about transitions where the operator must pick the next mainline slash command. Review-loop commands already satisfy the behavior via their own per-state handoff blocks. Utility commands don't participate in the mainline flow.

**Alternatives considered:**

- *Require `AskUserQuestion` at every transition, including internal ones.* Rejected: would turn internal phase advances (e.g., `proposal_clarify → proposal_challenge`) into interactive gates and break auto-driven flows.

### Decision 4: Spec asserts block presence + slash-command targets; not wording

**Decision:** The new scenario set in `slash-command-guides` asserts (a) that an `AskUserQuestion:` block exists in the relevant generated file near the terminal phase, and (b) that the `options` array contains slash-command references to the expected targets (e.g., `/specflow.design`, `/specflow.reject`). It does NOT fix exact labels, ordering, or descriptions.

**Rationale:** Labels may evolve (translation, copy polish, adding severity suffixes). Locking wording in the spec would cause spec churn. The set-of-targets contract is the behavior-relevant invariant; labels are UX polish.

**Alternatives considered:**

- *Full-text scenarios with exact strings.* Rejected: too brittle for a copy-heavy Markdown file.
- *Presence-only scenarios.* Rejected: would allow a regression that swaps `/specflow.design` for some unrelated target without detection.

### Decision 5: Structural tests live in existing `command-order.test.ts`

**Decision:** Extend `src/tests/command-order.test.ts` to add fragments like `AskUserQuestion:`, `/specflow.design`, `/specflow.reject` into the ordered-fragment lists for the three generated files. No new test file is required.

**Rationale:** The existing test harness already reads each generated `.md` and asserts ordered fragments; adding a few more strings is the smallest-diff path. The `command-order.test.ts` file is where analogous contracts (archive order, approve-gate fragments) are already enforced.

### Decision 6: Manual UI verification recorded in tasks.md

**Decision:** `tasks.md` includes a terminal manual-verification task with three checks — open a Claude Code session, drive each of the three transitions, and visually confirm buttons render. This task is marked explicitly non-automated.

**Rationale:** Structural tests cannot detect UI rendering regressions in Claude Code itself (e.g., a Claude Code change that ignored our block syntax). A one-time manual check gives confidence that the user-visible behavior is correct before closing the change.

## Risks / Trade-offs

- **Risk:** A future refactor renames the `AskUserQuestion:` pseudo-block syntax or the agent stops recognizing it. → **Mitigation:** The review-loop templates use the same syntax and have visible UI integration; a syntax-level break would surface immediately there. Adding the three new call sites doesn't increase this risk beyond the existing baseline.

- **Risk:** Labels drift from the contract captured in the spec (e.g., someone renames `/specflow.design` or `/specflow.reject`). → **Mitigation:** The new scenarios assert slash-command targets explicitly, and the regeneration + ordered-fragments test will fail.

- **Risk:** Some operators rely on the current prose-only list as a reference (they read the guide as documentation). → **Mitigation:** Decision 1 keeps prose alongside the block; the spec only forbids prose-only handoffs, not prose as a supplement.

- **Risk:** Snapshot tests (`src/tests/__snapshots__/specflow.md.snap`, etc.) will need regeneration after the template change. → **Mitigation:** Run `npm test -- -u` or the project's snapshot-update command as part of the apply phase; include a task for it.

- **Trade-off:** The spec intentionally does not pin exact wording or option order, so the UX can evolve without spec churn but the spec gives weaker protection against label regressions. Accepted — label regressions are detectable by structural tests anyway.

## Migration Plan

1. Update the three `.md.tmpl` files under `assets/commands/` to add `AskUserQuestion:` blocks at the terminal-handoff steps.
2. Run the build pipeline so `dist/package/global/commands/specflow.md`, `specflow.design.md`, and `specflow.apply.md` are regenerated.
3. Update `src/tests/command-order.test.ts` with the new required fragments.
4. Update any affected snapshot files under `src/tests/__snapshots__/` (re-record if needed).
5. Run the full test suite and verify green.
6. Manually verify in a Claude Code session: drive one end-to-end run (or three mini-runs) and confirm buttons appear at `spec_ready`, `design_ready`, `apply_ready`.
7. Archive the change via `/specflow.approve`.

Rollback: revert the template edits. The change is additive, so reverting does not leave artifacts in an inconsistent state.

## Open Questions

- None. The reclarify phase resolved the scope, contract, renderer-in-scope, validation-depth, and consumer-compatibility questions.

## Concerns

Each concern below is a user-facing slice that maps to a handoff transition affected by issue #171:

1. **spec_ready handoff button** — after `/specflow` completes the spec phase, the operator sees no button to proceed to design.
2. **design_ready handoff button** — after `/specflow.design` completes design + review, the operator sees no button to proceed to apply.
3. **apply_ready handoff button** — after `/specflow.apply` completes implementation + review, the operator sees no button to proceed to approve / fix / reject.
4. **spec-level regression protection** — without a spec requirement, future template edits could silently drop the blocks again.
5. **manual UI observation** — the automated tests assert structure, not UI rendering; an operator must actually see the buttons at least once.

## State / Lifecycle

**Canonical state:** The run-state `current_phase` (persisted by `specflow-run`) is the authoritative signal for when a handoff is reachable. No new run-state transitions or phases are introduced.

**Derived state:** The Claude Code UI "has a button available" state is derived solely from the agent calling `AskUserQuestion` — which is triggered by the agent reading the `AskUserQuestion:` pseudo-block in the guide. There is no other derived state.

**Lifecycle boundaries:** Each handoff block lives inside the terminal step of its command guide and is reached exactly once per command invocation. On operator selection, control passes to the next command (`/specflow.design`, `/specflow.apply`, `/specflow.approve`, `/specflow.fix_apply`, or `/specflow.reject`), which starts its own lifecycle.

**Persistence-sensitive state:** None. The handoff is a UI choice; operator selection causes a new slash-command invocation which then advances `current_phase` via its own `specflow-run advance` calls.

## Contracts / Interfaces

**ui (Claude Code):** The generated `.md` files are the interface. Claude Code reads a guide, encounters `AskUserQuestion:`, and calls the `AskUserQuestion` tool. The contract is the pseudo-block syntax already used by review-loop commands.

**api / persistence:** None newly defined. `specflow-run` CLI and `canonical-workflow-state` spec are unchanged.

**renderer:** `src/contracts/template-resolver.ts` passes all non-tagged content through verbatim, including `AskUserQuestion:` blocks. This contract is already in effect; no renderer-side interface change.

**external services:** None.

Inputs that other bundles depend on:

- The `.md.tmpl` templates are inputs to the build pipeline (`src/build.ts`).
- The generated `.md` files are inputs to the `command-order.test.ts` and snapshot tests.

## Persistence / Ownership

- `assets/commands/*.md.tmpl` — owned by the templates bundle; edited directly in this change.
- `dist/package/global/commands/*.md` — owned by the build pipeline; regenerated from templates.
- `openspec/specs/slash-command-guides/spec.md` — owned by the spec bundle; modified via delta in `openspec/changes/ensure-askquestion-coverage-for-all-phase-transitions/specs/slash-command-guides/spec.md`.
- `src/tests/command-order.test.ts` — owned by the tests bundle; extended with new fragment assertions.
- `src/tests/__snapshots__/specflow.md.snap`, `specflow.design.md.snap`, `specflow.apply.md.snap` — regenerated from templates.

No data ownership boundaries are crossed or redefined.

## Integration Points

- **Build pipeline (`src/build.ts`):** Regenerates `dist/package/global/commands/*.md` from the edited templates. Triggered by the standard build command.
- **Test suite (`src/tests/command-order.test.ts`, snapshot tests):** Asserts generated-file structure after build.
- **Claude Code UI:** Interprets `AskUserQuestion:` blocks at runtime; integration verified manually.

No retry, save/restore, or regeneration boundaries are affected.

## Ordering / Dependency Notes

1. Template edits (`specflow.md.tmpl`, `specflow.design.md.tmpl`, `specflow.apply.md.tmpl`) — independent of each other; can be done in parallel.
2. Spec delta update — already completed in the spec phase; this change only extends the delta when the design moves into implementation.
3. Regenerate `dist/` — depends on templates being edited.
4. Test updates (`command-order.test.ts`) — depends on knowing final block structure; safe to write alongside template edits.
5. Snapshot regeneration — depends on `dist/` and tests being ready.
6. Manual UI verification — depends on all of the above being merged / available locally.

Foundational: template edits. Parallelizable: the three template edits. Sequential: regenerate → tests → snapshots → UI check.

## Completion Conditions

The change is complete when **all** of the following hold:

- The three `.md.tmpl` templates contain `AskUserQuestion:` blocks at the terminal-handoff steps with option sets referencing the required slash-command targets.
- `dist/package/global/commands/specflow.md`, `specflow.design.md`, `specflow.apply.md` contain the corresponding blocks after a clean build.
- `src/tests/command-order.test.ts` passes with the new fragments and asserts presence of `AskUserQuestion:` + each required slash-command target in each file.
- All snapshot tests pass.
- `openspec validate ensure-askquestion-coverage-for-all-phase-transitions --type change` returns valid.
- A manual Claude Code run observes buttons at `spec_ready`, `design_ready`, and `apply_ready`.
- `tasks.md` marks each task as `done` (or `skipped` with justification for the N/A tasks, if any).
