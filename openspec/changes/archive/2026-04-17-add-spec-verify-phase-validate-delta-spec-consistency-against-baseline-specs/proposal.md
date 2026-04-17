## Why

The current specflow workflow stops at `spec_validate`, which only performs
structural checks via `openspec validate --type change` (file format, required
sections). There is no systematic step that compares the semantic content of
delta specs against the baseline specs already in `openspec/specs/`.

Concrete failure modes that slip through today:

- A delta declares "sessions expire after 30 days" while
  `openspec/specs/workflow-run-state/spec.md` mandates "SHALL expire within 24
  hours".
- A delta says "processed synchronously" while an existing spec declares a
  SHALL for asynchronous processing.
- A delta `REMOVED` clause is still depended on by another baseline spec, and
  nothing surfaces the ripple.

Such conflicts may be caught incidentally during proposal challenge or design
review, but there is no dedicated gate — detection depends entirely on agent
discretion, and regressions have occurred. OpenSpec upstream's `/opsx:verify`
targets "implementation vs change artifacts" and does not cover this gap.

This change introduces a dedicated `spec_verify` phase that reads only the
baseline specs referenced by `Modified Capabilities` and blocks transition to
`spec_ready` until any conflict is explicitly resolved or accepted.

Source: https://github.com/skr19930617/specflow/issues/158 (#158 — Add
spec_verify phase).

## What Changes

- **Add a `spec_verify` state** to the workflow machine (version bumped) between
  `spec_validate` and `spec_ready`.
- **Add events** `spec_verified` (verify passed → `spec_ready`) and
  `revise_spec` (conflict found → back to `spec_draft`).
- **Add a consistency verification capability** implemented as a **hybrid
  CLI + agent flow**: a new CLI deterministically enumerates baseline spec
  files for each `Modified Capabilities` entry and emits machine-readable
  context (delta clauses, baseline clauses, Scenario bullets), which the
  `/specflow` agent then judges for semantic conflicts. Conflict detection
  covers both normative clauses (SHALL / MUST / etc.) and Scenario
  behaviour (WHEN/THEN) — not just free prose.
- **Extend the `/specflow` command body** with a verify step that drives the
  phase: on pass it advances with `spec_verified`; on conflict it surfaces
  the findings and asks the user which direction to fix (delta, baseline,
  both, or accept-as-is). Any fix choice advances with `revise_spec`;
  `accept-as-is` advances with `spec_verified` after recording the accepted
  conflicts in a dedicated `## Accepted Spec Conflicts` section of
  `design.md` (creating the file if it doesn't yet exist).
- **Always enter `spec_verify`**, even when `Modified Capabilities` is empty.
  In that case the phase reports "no baseline capabilities to verify" and
  immediately advances with `spec_verified`, keeping the gate presence
  uniform across all changes.

## Verification Rules

These rules bound how the hybrid CLI + agent verification behaves, so that
both phases of the flow (deterministic extraction and LLM judgement) share
a single, auditable contract.

### Conflict Boundary

- Only **genuine incompatibilities** count as conflicts. A change that
  strengthens or refines a baseline requirement in a way still consistent
  with it (e.g. baseline says "SHALL respond within 24 hours", delta says
  "SHALL respond within 30 minutes") is NOT a conflict and SHALL pass
  verification without user prompting.
- Conflicts are evaluated at the **SHALL / MUST clause level** and at the
  **Scenario behaviour level** (WHEN / THEN bullets). Free prose inside
  `Purpose` or introductory sections is out of scope.

### REMOVED-clause ripple

- When a delta `REMOVED` clause is detected, the CLI helper SHALL
  deterministically grep **all** baseline specs (not only the
  `Modified Capabilities` set) for references to the removed requirement
  title, and hand the matches to the agent as ripple candidates.
- Full spec contents are NOT injected into the agent context; only the
  matched file paths, line numbers, and surrounding ±3 lines are passed.
- The agent judges whether each candidate reference is actually broken by
  the removal.

### Missing / unparseable baseline

- If a capability listed under `Modified Capabilities` has no baseline
  spec file (path does not resolve under `openspec/specs/<name>/spec.md`),
  the CLI SHALL emit a structured `missing_baseline` error, the phase
  SHALL block, and `/specflow` SHALL advance with `revise_spec` to send
  the user back to `spec_draft` to fix `Modified Capabilities`.
- If a baseline spec file exists but cannot be parsed into requirements +
  scenarios, the CLI SHALL emit a structured `unparseable_baseline` error
  with the reason, the phase SHALL block, and `/specflow` SHALL advance
  with `revise_spec` so the broken baseline can be repaired before verify
  proceeds.

### Authority and reproducibility

- Agent judgement is **advisory**. Every detected conflict SHALL be
  presented to the user via `AskUserQuestion`, and the user's choice
  (fix delta / fix baseline / fix both / accept-as-is) is the
  authoritative outcome.
- `accept-as-is` SHALL write an `## Accepted Spec Conflicts` section to
  `openspec/changes/<CHANGE_ID>/design.md`, creating the file if it does
  not yet exist. The section SHALL use a markdown table with the schema:

  ```
  | id | capability | delta_clause | baseline_clause | rationale | accepted_at |
  ```

  where `id` is a stable identifier per accepted conflict (e.g.
  `AC1`, `AC2`), `accepted_at` is an ISO-8601 UTC timestamp, and
  `rationale` is a free-text user-provided reason.

### Revise path

- On `revise_spec`, the workflow returns to `spec_draft` and SHALL
  always re-run `spec_validate` and then `spec_verify` on the next
  forward pass. There is no fast-path that skips `spec_validate` when
  only delta content changed — the gate is uniform.
- **Preserve `spec_validate`** unchanged: the structural `openspec validate`
  gate continues to run before `spec_verify`, so the two checks compose.
- **Update the Mermaid workflow diagram** and any architecture docs that
  enumerate the phase graph.

Non-breaking for existing change directories that have already passed
`spec_validate`: replaying the workflow will flow through the new `spec_verify`
phase but the rule is additive (a pass is the no-conflict case).

## Capabilities

### New Capabilities

- `spec-consistency-verification`: Hybrid CLI + agent capability that, for a
  given change id, (1) deterministically resolves impacted baseline specs
  from the delta's `Modified Capabilities` via a new
  `specflow-spec-verify` helper, (2) emits machine-readable context pairing
  each delta clause / Scenario with the baseline it touches, (3) lets the
  `/specflow` agent judge semantic conflicts at the SHALL + Scenario level,
  and (4) records accept-as-is decisions in `design.md` under a dedicated
  section.

### Modified Capabilities

- `workflow-run-state`: Adds the `spec_verify` state, the `spec_verified` and
  `revise_spec` events, the `spec_validated → spec_verify` transition, the
  `spec_verified → spec_ready` transition, and the `revise_spec → spec_draft`
  back-edge. Bumps the workflow machine version.
- `slash-command-guides`: The `/specflow` command body gains a verify step
  between structural validation and design handoff that drives the new phase
  and surfaces conflicts to the user.

## Impact

- Code: `src/lib/workflow-machine.ts` (new state / events / transitions,
  version bump); a new deterministic helper `specflow-spec-verify`
  (likely backed by a `src/lib/spec-verify.ts` module) that parses
  `Modified Capabilities`, loads only the referenced baseline specs, and
  emits structured JSON context; command-body template for `/specflow`
  updated with the hybrid verify step, conflict-surfacing UX, and the
  `design.md` accepted-conflict writer; `phase-router` / `PhaseContract`
  wiring if the registry enforces phase ↔ command-body coupling.
- Tests: unit tests for the CLI extractor (empty `Modified Capabilities`,
  single capability, multiple capabilities, modified capability pointing to
  missing baseline), state machine transition tests
  (`spec_validate → spec_verify → spec_ready`; `spec_verify → spec_draft`),
  golden-file tests for the updated command body, and an integration test
  exercising the full happy-path advance sequence plus an accept-as-is
  variant that writes to `design.md`.
- Docs: `openspec/specs/workflow-run-state/spec.md` delta, Mermaid workflow
  diagram, and any README/architecture doc listing the phases.
- Context budget: verification reads only the baseline specs referenced by
  `Modified Capabilities` (typically 2–3 files, ~30–60 KB), never the full
  catalog.
- Out of scope: extending `openspec validate` itself, verifying implementation
  vs artifacts (`/opsx:verify`), and injecting `design.md` / `spec.md` into
  `review_apply` prompts.
