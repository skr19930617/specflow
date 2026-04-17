## Context

The specflow workflow currently ends its "does the spec hold water?" checks at
`spec_validate`, which only runs `openspec validate --type change`. That CLI
performs a structural sweep — required sections, scenario header shape,
SHALL/MUST presence — but never cross-references the delta's clauses against
the baseline specs under `openspec/specs/**/spec.md`. Any delta that
contradicts, weakens, or removes clauses that other baseline specs already
depend on passes the gate and proceeds to `/specflow.design`.

The baseline is written in normative Markdown (SHALL / MUST clauses plus
Scenario blocks). The delta is written in the same shape under
`openspec/changes/<id>/specs/<capability>/spec.md`. The machinery to parse
both already exists inside `@fission-ai/openspec` (for structural validation)
and a thin layer inside this repo's `specflow-run` pipeline.

Stakeholders:

- **Proposal authors**: get fast feedback when their delta contradicts an
  existing SHALL or breaks a reference from another spec.
- **`/specflow` command**: needs a deterministic CLI hook plus a prescribed
  agent flow; today everything is free-form prose.
- **Reviewers**: want a record of any accepted conflict so later audits can
  see which divergences were intentional.

Relevant code locations:

- `src/lib/workflow-machine.ts` — xstate flat machine, `workflowVersion = "6.0"`.
- `src/core/advance.ts` — pure transition core; already recognises
  approval-gate phases (`spec_ready`, `design_ready`, `apply_ready`).
- `src/contracts/phase-contract.ts` — phase → CLI + agent-task registry consumed by generated command bodies.
- `assets/commands/specflow.md.tmpl` — the `/specflow` command body template (Steps 1–9 today).
- `src/bin/specflow-challenge-proposal.ts` — existing hybrid CLI + agent example that we should mirror stylistically.

Out-of-the-box constraints:

- Context budget: the full baseline catalog is ~22 files / ~66K tokens. Only
  the specs referenced by `Modified Capabilities` (typically 2–3 files) plus
  grep excerpts for REMOVED ripple candidates may be read into agent context.
- Determinism boundary: path resolution, file reading, REMOVED-clause grep,
  and missing/unparseable baseline detection SHALL be fully deterministic
  (CLI). Only semantic judgement of pairings is delegated to the LLM agent.
- All new code must observe the project's "contract discipline" rule
  (`CLAUDE.md`): the phase contract registry and the generated command body
  must stay in sync — no drift between what the machine allows and what the
  prose instructs.

## Goals / Non-Goals

**Goals:**

- Add a `spec_verify` phase strictly between `spec_validate` and `spec_ready`
  in the workflow machine, with `spec_verified` / `revise_spec` edges and
  a version bump.
- Introduce a new CLI helper `specflow-spec-verify` that deterministically
  resolves impacted baseline specs, parses delta clauses, greps for REMOVED
  ripple candidates, and emits a structured JSON report.
- Extend `assets/commands/specflow.md.tmpl` with a new Step (8.5) that
  drives the hybrid CLI + agent flow, surfaces conflicts via
  `AskUserQuestion`, writes accepted conflicts to `design.md`, and advances
  the run with `spec_verified` or `revise_spec`.
- Register a `spec_verify` entry in `phase-contract.ts` so the generated
  command body stays contract-driven.
- Provide unit + golden-file coverage for the CLI, the state machine
  transitions, and the generated command body.

**Non-Goals:**

- Extending `openspec validate` itself. Structural checks remain unchanged.
- Verifying implementation vs. artifacts (`/opsx:verify` territory).
- Injecting `design.md` / `spec.md` into the `review_apply` prompt.
- Automatically rewriting delta or baseline specs. The phase only surfaces
  findings; fixes are human (or subsequent-phase) work.
- Evolving the accepted-conflicts table into a machine-readable side file.
  We keep it inside `design.md` so downstream review already sees it.

## Decisions

### D1. Hybrid CLI + agent split (not pure agent, not pure CLI)

**Choice.** A new TS-backed CLI `specflow-spec-verify <CHANGE_ID> --json`
enumerates impacted baselines, loads them, parses requirements + scenarios,
and emits a JSON report with (a) `pairings` (one entry per delta clause /
scenario × baseline clause it touches), (b) `ripple_candidates` for REMOVED
clauses, and (c) structured errors for missing / unparseable baselines. The
`/specflow` agent reads the report and makes the semantic call.

**Alternatives considered.**

- *Agent-only* (command-body prose tells the LLM to find baselines, read
  them, judge). Rejected: non-deterministic path resolution and no way to
  enforce the "don't read all baseline specs" context budget.
- *Pure CLI with fixed rules* (SHALL diff, keyword matching). Rejected:
  too brittle for the incompat-only rule (e.g. "24 h" vs. "30 min" must not
  fire), and would drift from how reviewers actually judge.

### D2. Deterministic edges vs. LLM-judged edges

**Choice.** The following are fully deterministic (CLI):

- Capability → baseline path resolution (`openspec/specs/<name>/spec.md`).
- Missing-baseline detection → error code `missing_baseline`.
- Unparseable-baseline detection → error code `unparseable_baseline`.
- REMOVED-clause grep across **all** baseline specs (not just the
  `Modified Capabilities` set), bounded to file path + line + ±3 lines.
- Pairing enumeration (which delta clause touches which baseline clause, by
  requirement-name normalisation plus scenario WHEN/THEN alignment).

The following are LLM-judged:

- Whether each pairing is an actual incompat (D3 rule).
- Whether each ripple candidate is a live dependency that breaks on removal.

**Rationale.** Determinism where we can guarantee correctness; LLM where
reviewers today use judgement anyway. This also makes the CLI independently
testable with fixtures, and keeps the agent prompt bounded.

### D3. Conflict boundary: incompatibility only

**Choice.** A pairing is a conflict only when the delta clause is
**genuinely incompatible** with the baseline. Tightening (e.g. baseline
"SHALL respond within 24 hours", delta "SHALL respond within 30 minutes")
is NOT a conflict. The rule is evaluated at SHALL/MUST clause level and at
Scenario behaviour (WHEN/THEN) level; free prose inside `Purpose` is
ignored.

**Rationale.** Matches the project's blocker-risk threshold. Surfacing
every normative difference produces noise that trains authors to rubber-
stamp the prompt; false positives destroy the flow.

**Alternatives considered.** Classifying each pairing as
`conflict | tightening | loosening | unrelated` was rejected — the extra
UX surface doesn't carry weight for the current workflow, and adds
prompt-level brittleness.

### D4. User authority is absolute

**Choice.** Every candidate conflict surfaced by the agent is shown to the
user via `AskUserQuestion`. The four outcomes are `fix delta`,
`fix baseline`, `fix both`, and `accept-as-is`. The run does not advance
on `spec_verified` until every conflict has a user outcome. Any fix choice
advances with `revise_spec`; `accept-as-is` advances with `spec_verified`
after writing the design.md record.

**Rationale.** LLM judgement is inherently non-deterministic; making it
advisory (not authoritative) prevents gate drift across re-runs and gives
reviewers a single source of truth (the user's recorded decision).

### D5. Missing / unparseable baselines block, don't warn

**Choice.** Both `missing_baseline` and `unparseable_baseline` are
blocking errors: the CLI exits non-zero, `/specflow` advances the run with
`revise_spec` back to `spec_draft`, and the user fixes either
`Modified Capabilities` (for missing) or the broken baseline spec (for
unparseable) before retrying.

**Rationale.** Proceeding past a missing/broken baseline defeats the
purpose of the gate. Silent skip or warn-and-continue would let the exact
drift this phase is meant to catch slip through.

### D6. Uniform re-traversal after `revise_spec`

**Choice.** On `revise_spec`, the run returns to `spec_draft`. On the next
forward pass the user re-runs `validate_spec` → `spec_validated` →
(implicit) `spec_verify` again. There is no fast-path that skips
`spec_validate` when only delta content changed.

**Rationale.** Fast-paths create conditional branches in the state machine
that are hard to reason about and hard to keep covered by tests. The cost
of re-running `openspec validate` is negligible (tens of ms).

### D7. Accepted-conflicts land in `design.md`, not a side file

**Choice.** The `## Accepted Spec Conflicts` section is appended to
`openspec/changes/<CHANGE_ID>/design.md`, creating the file if it doesn't
yet exist. Schema (fixed):

```
| id | capability | delta_clause | baseline_clause | rationale | accepted_at |
```

`id` is monotonically increasing within the change (`AC1`, `AC2`, …).
`accepted_at` is an ISO-8601 UTC timestamp. `delta_clause` /
`baseline_clause` are anchor references (relative path + header) — full
text is intentionally NOT inlined.

**Rationale.** Design review (`/specflow.review_design`) already reads
`design.md`. Putting accepted conflicts there keeps them in the reviewer's
line of sight without introducing a new artifact type into the workflow.

### D8. Workflow machine version bump

**Choice.** `workflowVersion` in `src/lib/workflow-machine.ts` goes from
`6.0` to `6.1`. The `spec_validate` state loses its `spec_validated` →
`spec_ready` edge; that edge now targets `spec_verify`. A new `spec_verify`
state exposes two events: `spec_verified` (→ `spec_ready`) and
`revise_spec` (→ `spec_draft`). `workflowEventOrder` picks up
`spec_verified` in an ordering-compatible slot (between `spec_validated`
and `accept_spec`).

**Rationale.** Minimal surface change, keeps `spec_ready` as the single
approval-gate entry point for design, and lets the existing
`deriveAllowedEvents` logic pick up the new state without modification.

### D9. PhaseContract entry for `spec_verify`

**Choice.** `phase-contract.ts` gains a new entry:

- `phase: "spec_verify"`, `next_action: "invoke_agent"`, `gated: false`,
  `terminal: false`, `agent: "claude"`.
- `requiredInputs` points at both
  `openspec/changes/<CHANGE_ID>/proposal.md` and
  `openspec/changes/<CHANGE_ID>/specs/*/spec.md`.
- `cliCommands` include `specflow-spec-verify "<CHANGE_ID>" --json`,
  `specflow-run advance "<RUN_ID>" spec_verified`, and
  `specflow-run advance "<RUN_ID>" revise_spec`.
- `producedOutputs` includes `design.md` (conditional) so the accepted-
  conflict writer is captured in the contract.

**Rationale.** The generated command body is assembled from the contract;
adding the entry is what makes the `/specflow` template pick up the CLI
commands via `{{render:}}` tags. Without it, the prose will drift from the
machine.

## Risks / Trade-offs

- **[LLM false-negative]** → Mitigation: surface every pairing the CLI can
  produce (not just what the agent calls a conflict) in the JSON report so
  a reviewer can eyeball the raw set, and keep the phase advisory so false
  negatives from the agent are still catchable at design review.
- **[LLM false-positive friction]** → Mitigation: the incompat-only rule
  (D3) plus the ability to accept-as-is with rationale keeps the user
  moving even when the agent over-flags.
- **[Context bloat]** → Mitigation: hard limits inside the CLI — only
  `Modified Capabilities` specs load in full, REMOVED grep excerpts are
  bounded to ±3 lines, and no file contents are inlined into the JSON
  beyond those excerpts.
- **[REMOVED grep noise across many specs]** → Mitigation: grep the
  *requirement header text* (not arbitrary keywords), and present matches
  as "candidates" for the agent to filter. If a repo ever hosts >100
  baseline specs the grep is still O(content size) and stays well under a
  second.
- **[Spec drift between `phase-contract.ts` and `specflow.md.tmpl`]** →
  Mitigation: use the existing `{{render:}}` tag so the CLI commands come
  from the contract, not hand-written prose; add a golden-file test that
  verifies the generated `global/commands/specflow.md` includes the verify
  step.
- **[Design.md doesn't exist yet at verify time for pure spec changes]** →
  Mitigation: the template writer creates the file with only the
  `## Accepted Spec Conflicts` section, which design.md generation will
  later merge with its own content when the run advances into
  `design_draft`.

## Migration Plan

1. Ship the workflow-machine change, the new CLI, and the template update
   together in one PR. They are tightly coupled and splitting them would
   leave the repo in a state where `spec_verify` exists but no command can
   drive it.
2. Existing active runs (if any) in phases ≥ `spec_ready` are unaffected;
   they continue through design without touching the new state.
3. For any run currently in `spec_validate` or `spec_draft`: after the
   version bump, `allowed_events` will include `spec_verified` once the
   run passes `validate_spec`. No manual migration required — the machine
   just routes them through the new phase on the next advance.
4. Rollback: revert the single PR. The old machine at version `6.0`
   interprets old `run.json` files unchanged.

## Open Questions

- Do we want to emit telemetry on verify outcomes (conflict count, accept
  rate)? Left out of v1 to keep the CLI surface small; can be added behind
  a flag later.
- Should the CLI's JSON include a `schema_version` field so future
  consumers can branch? Recommended yes, default `1`.

## Concerns

- **C1. Workflow machine change.** Add state `spec_verify`, add events
  `spec_verified` + `revise_spec`, retarget `spec_validated`, bump version.
  Lives entirely in `src/lib/workflow-machine.ts`.
- **C2. Deterministic CLI (`specflow-spec-verify`).** New TS bin that
  parses `proposal.md` capabilities, loads only referenced baselines,
  parses delta clauses, runs REMOVED grep, and emits JSON with structured
  errors. Lives in `src/bin/specflow-spec-verify.ts` + supporting module
  `src/lib/spec-verify.ts`.
- **C3. PhaseContract registration.** Add the `spec_verify` entry to
  `phase-contract.ts` so generated command bodies render the CLI calls.
- **C4. Command-body update.** Extend `assets/commands/specflow.md.tmpl`
  with a new Step that orchestrates the CLI + `AskUserQuestion` +
  `design.md` writer. Insert between the existing Step 8 (Spec Validate)
  and Step 9 (Design Handoff), renumber trailing steps.
- **C5. design.md accepted-conflict writer.** A small helper (likely in
  `src/lib/spec-verify.ts`) that appends or creates the table. Not a CLI
  of its own — either invoked by the `/specflow` agent via Edit/Write
  tools (preferred, since it's a predictable, schema-bound append), or
  exposed as a `--record-accept` subcommand on `specflow-spec-verify`
  (fallback if append conflicts arise).
- **C6. Tests.** Unit tests for the parser/CLI (fixtures under
  `src/tests/spec-verify/`), state-machine transition tests, golden-file
  tests for the generated `specflow.md`, and an integration test that
  exercises `validate_spec → spec_validated → spec_verified → spec_ready`.

## State / Lifecycle

**Canonical state:**
- `workflowVersion` (`6.0` → `6.1`) in `src/lib/workflow-machine.ts`.
- `workflowMachineConfig.states.spec_verify` (new).
- `workflowMachineConfig.states.spec_validate.on.spec_validated` (retargeted to `spec_verify`).
- `workflowEventOrder` gains `spec_verified` (ordered after `spec_validated`).
- `allowed_events` for any run in `spec_verify` derived from the machine.

**Derived state:**
- `specflow-spec-verify` JSON output is computed on demand and never
  persisted. Re-running it is idempotent with respect to the same
  inputs.
- Accepted-conflict table rows are persisted in `design.md` but are
  monotonic across verify runs (never rewritten retroactively).

**Lifecycle boundaries:**
- A run enters `spec_verify` on the `spec_validated` event and exits via
  `spec_verified` (to `spec_ready`) or `revise_spec` (to `spec_draft`).
- The CLI runs synchronously per verify cycle; it does not hold state
  between runs.

**Persistence-sensitive state:**
- `design.md` is the only file mutated by the verify flow. Writes are
  additive (append-only for the accepted-conflicts table; create-file-
  if-missing for first acceptance).
- `run.json` history already captures phase transitions; no extra fields
  are required.

## Contracts / Interfaces

**CLI contract (`specflow-spec-verify`).** Invoked as
`specflow-spec-verify <CHANGE_ID> --json`.

JSON schema (v1):

```
{
  "schema_version": 1,
  "change_id": string,
  "modified_capabilities": string[],
  "pairings": [
    {
      "capability": string,
      "delta_path": string,
      "delta_anchor": string,          // e.g. "MODIFIED/<req-name>"
      "baseline_path": string,
      "baseline_anchor": string,        // e.g. "Requirement: <name>"
      "delta_excerpt": string,          // SHALL/MUST line or scenario bullet
      "baseline_excerpt": string
    }
  ],
  "ripple_candidates": [
    { "removed_requirement": string,
      "baseline_path": string,
      "line": number,
      "excerpt": string }
  ],
  "reason"?: "no_modified_capabilities",
  "error"?: {
    "code": "missing_baseline" | "unparseable_baseline",
    "capability": string,
    "parse_reason"?: string
  }
}
```

Exit codes: `0` on success (including `no_modified_capabilities`),
non-zero on structured error.

**Phase contract entry.** `spec_verify` entry with CLI commands,
required inputs, and produced outputs as listed in D9.

**`/specflow` command-body contract.** The new step SHALL read the CLI
JSON, call `AskUserQuestion` per conflict, edit `design.md` on accept,
and advance the run.

**Run-state contract.** `allowed_events` for `spec_verify` is
`["spec_verified", "revise_spec", "reject", "suspend"]`. No changes to
`run.json` shape.

## Persistence / Ownership

- **Workflow machine ownership:** `src/lib/workflow-machine.ts` owns the
  version, states, events, and transitions.
- **CLI ownership:** `src/bin/specflow-spec-verify.ts` (thin runner) +
  `src/lib/spec-verify.ts` (parsing, resolution, grep, JSON assembly).
- **Command-body ownership:** `assets/commands/specflow.md.tmpl` for the
  new step; `src/contracts/phase-contract.ts` for the machine-readable
  phase entry.
- **design.md ownership:** The existing design artifact generator owns
  the rest of the file; the verify flow is allowed to append/create only
  the `## Accepted Spec Conflicts` section. It SHALL NOT touch any other
  section.

## Integration Points

- `@fission-ai/openspec` is a **consumer**, not a dependency of the new
  CLI; the CLI uses its own small parser because it needs finer-grained
  access (scenario-level anchors) than OpenSpec's validator exposes.
- Generated `global/commands/specflow.md` is downstream of both
  `phase-contract.ts` and `specflow.md.tmpl`. The existing template
  generator (`src/contracts/command-bodies.ts`) already handles
  `{{render:}}` expansion — no generator changes needed.
- `src/core/advance.ts` already routes events by workflow definition.
  Because `spec_verify` is NOT an approval gate (it doesn't create a
  pending `ApprovalRecord`), no additions to `APPROVAL_GATE_PHASES` are
  required.
- `specflow-review-design` and subsequent phases are unaffected; they
  consume `design.md` without knowing about the accepted-conflict
  section's origin.

## Ordering / Dependency Notes

1. **Foundation first:** C1 (workflow machine) and C3 (phase contract)
   must land together or the command body won't compile the new step.
2. **CLI parallel:** C2 (CLI + module) can be built alongside C1/C3 but
   must be wired into the command body only after C1+C3 are in.
3. **Command body last:** C4 (template) depends on C3, since the
   `{{render:}}` tag resolves from the registered PhaseContract.
4. **Writer helper:** C5 is coupled to C4 (same flow) and ships with it.
5. **Tests:** C6 tests must cover each of the above individually, then an
   integration test exercises them end-to-end. No bundle may be marked
   done without its test slice.

Things that can be done in parallel:
- CLI parser (C2) vs. workflow-machine change (C1) — independent files.
- Golden-file tests for the command body (C6) vs. CLI unit tests (C6).

## Completion Conditions

- **C1 done** when `workflowVersion === "6.1"`, the new state / events /
  transitions exist, and `deriveTransitions`/`deriveAllowedEvents`
  continue to validate. Confirmed by a new transition test.
- **C2 done** when `specflow-spec-verify <CHANGE_ID> --json` runs against
  a fixture change and produces the documented JSON for (a)
  empty-capabilities, (b) single-capability happy path, (c)
  REMOVED-ripple case, (d) missing-baseline error, (e)
  unparseable-baseline error. Confirmed by unit tests per case.
- **C3 done** when `phase-contract.ts` contains the `spec_verify` entry
  and the type check passes. Confirmed by the phase-contract registry
  test.
- **C4 done** when `bun run` (or the project's canonical template-
  regeneration command) produces a `global/commands/specflow.md` that
  contains the new step with the literal CLI invocations and the
  accept-as-is prose. Confirmed by a golden-file test.
- **C5 done** when an end-to-end scenario where the user picks
  `accept-as-is` produces a `design.md` with the six-column table and
  the correct row count. Confirmed by the integration test.
- **C6 done** when `bun test` (or the repo's `npm test`) is green with
  the new tests in place; the integration test exercises the full
  `validate_spec → spec_validated → spec_verified → spec_ready` path
  and the `spec_verify → revise_spec → spec_draft` back-edge; and the
  Mermaid diagram (if one exists in docs/) is refreshed to include
  `spec_verify`.
- **Change complete** when the full test suite is green, the generated
  command body is regenerated and committed, and `openspec validate`
  still reports the change as `valid: true`.
