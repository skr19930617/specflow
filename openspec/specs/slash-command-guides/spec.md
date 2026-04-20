# slash-command-guides Specification

## Purpose

Describe the slash-command guides generated from the current command contract
registry.
## Requirements
### Requirement: Contract-defined slash-command assets

The system SHALL define slash-command assets from `commandContracts`. Each command SHALL have an id, slash-command name, output path under `global/commands/`, accepted argument placeholder, references, a template path pointing to `assets/commands/<id>.md.tmpl`, and a markdown body assembled from the resolved template merged with TS-side metadata.

#### Scenario: Mainline commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow`, `specflow.design`, `specflow.apply`, and `specflow.approve`
- **AND** each of those commands SHALL render to `global/commands/<id>.md`

#### Scenario: Support commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL also include `specflow.reject`, `specflow.review_design`, `specflow.review_apply`, `specflow.fix_design`, `specflow.fix_apply`, `specflow.explore`, `specflow.spec`, `specflow.decompose`, `specflow.dashboard`, `specflow.setup`, `specflow.license`, and `specflow.readme`

#### Scenario: Command contracts declare template paths

- **WHEN** a command contract is inspected
- **THEN** it SHALL include a `templatePath` field pointing to the corresponding `assets/commands/<id>.md.tmpl` file

### Requirement: Generated markdown preserves body sections and hook sections

Generated command markdown SHALL render command body sections from resolved `.md.tmpl` templates and SHALL append a `Run State Hooks` section whenever the contract defines run hooks. Body sections for phases with `PhaseContract` data SHALL be generated from the `PhaseContract` registry via `renderPhaseMarkdown` through `{{render:}}` tags in the template. Phases without `PhaseContract` data SHALL use prose directly authored in the template.

#### Scenario: Hooked commands render run-state hook sections

- **WHEN** generated `specflow.md`, `specflow.design.md`, `specflow.apply.md`, `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** the file SHALL contain a `## Run State Hooks` section

#### Scenario: Commands without hooks omit the hook section

- **WHEN** generated command markdown is read for a command with no run hooks
- **THEN** the file SHALL render the command body without a `Run State Hooks` section

#### Scenario: PhaseContract-backed sections are resolved via render tags

- **WHEN** a command body template contains a `{{render: <phase>}}` tag for a phase that has a `PhaseContract` entry in the registry
- **THEN** the resolved section's structured content (CLI commands, artifact references, gate conditions) SHALL be generated from the `PhaseContract` data via `renderPhaseMarkdown`
- **AND** the resolved section SHALL NOT contain hand-written duplicates of CLI command invocations that are already in `PhaseContract.cliCommands`

#### Scenario: Phases without PhaseContract use prose from template

- **WHEN** a command body template does not contain a `{{render:}}` or `{{contract:}}` tag for a given section
- **THEN** the section SHALL render using the prose directly written in the `.md.tmpl` template

### Requirement: Mainline workflow guides encode strict phase gates

The generated guides for the main slash-command workflow SHALL encode the
current phase order and SHALL not document bypasses around the implemented
gates. Guides SHALL present mainline terminal-handoff options via
`AskUserQuestion` blocks rather than prose-only text per the
"Mainline terminal-handoff phases SHALL present next-step options via
AskUserQuestion" requirement.

#### Scenario: Proposal guide materializes local proposal artifacts before run start

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL include
  `specflow-prepare-change [<CHANGE_ID>] <raw-input>`
- **AND** it SHALL NOT require the caller to write a temp file before invoking
  `specflow-prepare-change`
- **AND** it SHALL document writing `openspec/changes/<CHANGE_ID>/proposal.md`
  before `specflow-run start`
- **AND** it SHALL include `specflow-run advance "<RUN_ID>" propose`

#### Scenario: Proposal guide drafts and validates spec deltas before design

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL place `openspec instructions specs --change "<CHANGE_ID>" --json`
  before `openspec validate "<CHANGE_ID>" --type change --json`
- **AND** it SHALL include `specflow-run advance "<RUN_ID>" validate_spec`
- **AND** it SHALL include a distinct step that runs after `spec_validated`
  and before `spec_ready`, driven by `specflow-spec-verify` and advanced via
  `specflow-run advance "<RUN_ID>" spec_verified`
- **AND** it SHALL not offer `/specflow.design` before the run reaches
  `spec_ready`

#### Scenario: Design starts from spec_ready and enters review directly

- **WHEN** generated `specflow.design.md` is read
- **THEN** it SHALL describe `spec_ready` as the entry phase
- **AND** it SHALL enter the design review gate with
  `specflow-run advance "<RUN_ID>" review_design`
- **AND** it SHALL not document `openspec validate "<CHANGE_ID>" --type change --json`

#### Scenario: Apply gates approval behind apply_ready

- **WHEN** generated `specflow.apply.md` is read
- **THEN** it SHALL enter the apply review gate with
  `specflow-run advance "<RUN_ID>" review_apply`
- **AND** it SHALL only offer `/specflow.approve` after
  `specflow-run advance "<RUN_ID>" apply_review_approved`
- **AND** the gate to issue `apply_review_approved` SHALL depend solely on the
  HIGH+ severity gate (i.e., zero findings whose `severity ∈ {critical, high}`
  and `status ∈ {new, open}`); LOW / MEDIUM findings alone SHALL NOT block
  `apply_review_approved`

#### Scenario: Approve keeps archive before commit

- **WHEN** generated `specflow.approve.md` is read
- **THEN** it SHALL order the `Archive`, `Commit`, and `Push & Pull Request`
  sections in that sequence

### Requirement: Review-loop guides define handoff targets and revision events

The review and fix-loop slash-command guides SHALL describe the current Codex
review handoffs and the phase-specific revision transitions used by the run
state machine. The Apply / Apply-equivalent handoff exposed by the with-findings
states SHALL be defined per the "non-primary option" requirement above
(severity-summary suffix + accepted-risk warning + last-position placement).

#### Scenario: Design review guide exposes apply and fix handoffs

- **WHEN** the `specflow.review_design` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.apply`,
  `handoff:specflow.reject`, and `handoff:specflow.fix_design`
- **AND** every `_with_findings` state in the generated guide SHALL also expose
  `handoff:specflow.apply` as a non-primary (last-position) option

#### Scenario: Apply review guide exposes approve and fix handoffs

- **WHEN** the `specflow.review_apply` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.approve`,
  `handoff:specflow.fix_apply`, and `handoff:specflow.reject`
- **AND** every `_with_findings` state in the generated guide SHALL also expose
  `handoff:specflow.approve` as a non-primary (last-position) option

#### Scenario: Fix-loop guides record self-transitions

- **WHEN** the generated fix-loop guides are read
- **THEN** `specflow.fix_design` SHALL include `revise_design`
- **AND** `specflow.fix_apply` SHALL include `revise_apply`

### Requirement: Utility slash-command guides use synthetic branches where implemented

The exploration and baseline-spec bootstrap guides SHALL document the synthetic
run-state branch behavior implemented in their hooks.

#### Scenario: Explore guide uses a synthetic run

- **WHEN** generated `specflow.explore.md` is read
- **THEN** it SHALL start a synthetic run id and record `explore_start` and
  `explore_complete`

#### Scenario: Spec bootstrap guide uses a synthetic run

- **WHEN** generated `specflow.spec.md` is read
- **THEN** it SHALL start a synthetic run id and record
  `spec_bootstrap_start` and `spec_bootstrap_complete`

### Requirement: OpenSpec readiness probe is command-based

Generated slash-command guides SHALL use `openspec list --json > /dev/null 2>&1` as the OpenSpec readiness probe and SHALL NOT use `ls openspec/`. Readiness SHALL be determined solely from the probe's exit code; the probe's stdout/stderr SHALL NOT be parsed by the slash-command guide.

#### Scenario: Generated guides render the command-based probe

- **WHEN** every generated slash-command markdown file in
  `global/commands/` that has a Prerequisites section is read
- **THEN** each SHALL contain the literal invocation
  `openspec list --json > /dev/null 2>&1`
- **AND** NONE SHALL contain the string `ls openspec/`

#### Scenario: No slash command parses probe stdout

- **WHEN** the Prerequisites block of any generated slash-command guide
  is read
- **THEN** it SHALL NOT document piping probe stdout into `jq`,
  `openspec` re-invocation, or any other JSON parser
- **AND** only the probe's exit status SHALL be used to branch

### Requirement: Probe failure is disambiguated into two normalized paths

When the readiness probe fails, the slash-command guide SHALL distinguish
two failure modes and emit the corresponding Japanese remediation copy:

- Exit status 127 (command not found) → header
  `"❌ openspec CLI が見つかりません。"` with remediation
  `specflow-install` を実行。
- Any other non-zero exit → header
  `"❌ OpenSpec が初期化されていません。"` with remediation
  `specflow-init` を実行。

Both paths SHALL end by instructing the user to re-run the current
slash command and SHALL terminate with `**STOP**`. The remediation copy
SHALL NOT instruct the user to hand-create `openspec/config.yaml`.

#### Scenario: Missing-CLI branch points to specflow-install

- **WHEN** any generated slash-command guide's Prerequisites block is
  read
- **THEN** it SHALL contain the string
  `❌ openspec CLI が見つかりません。`
- **AND** it SHALL contain `specflow-install` as the remediation for
  that branch

#### Scenario: Uninitialized-workspace branch points to specflow-init

- **WHEN** any generated slash-command guide's Prerequisites block is
  read
- **THEN** it SHALL contain the string
  `❌ OpenSpec が初期化されていません。`
- **AND** it SHALL contain `specflow-init` as the remediation for that
  branch

#### Scenario: No guide advises hand-creating openspec/config.yaml

- **WHEN** every generated slash-command guide is read
- **THEN** NONE SHALL contain the string `openspec/config.yaml を作成`
  or any equivalent instruction to hand-create the config file

### Requirement: Probe invocation is not wrapped in a wall-clock timeout

The readiness probe SHALL be invoked directly without wrapping in
`timeout(1)` or any other wall-clock limit. `openspec list --json`
targets local workspace files only; imposing a timeout would introduce
a dependency on coreutils and is explicitly out of scope.

#### Scenario: Generated guides do not wrap the probe in timeout

- **WHEN** every generated slash-command guide is read
- **THEN** NONE SHALL contain the string `timeout ` immediately
  preceding `openspec list --json`

### Requirement: specflow.decompose Prerequisites has a single probe block

The generated `specflow.decompose` slash-command guide SHALL contain
exactly one Prerequisites block documenting the readiness probe. The
duplicated block that previously documented both
`openspec/config.yaml` creation and `specflow-init` as separate
remediations SHALL be removed.

#### Scenario: specflow.decompose renders a single probe block

- **WHEN** generated `specflow.decompose.md` is read
- **THEN** it SHALL contain exactly one occurrence of
  `openspec list --json > /dev/null 2>&1`
- **AND** it SHALL NOT contain two separate Prerequisites sections

### Requirement: `/specflow.apply` Step 1 selects mutation path from `task-graph.json` state

The generated `specflow.apply` guide SHALL, in "Step 1: Apply Draft and Implement", instruct the agent to select the bundle-status mutation path from the state of `openspec/changes/<CHANGE_ID>/task-graph.json`:

- If `task-graph.json` does NOT exist → legacy fallback: mark completed tasks in `tasks.md` directly (unchanged legacy behavior).
- If `task-graph.json` exists AND passes `validateTaskGraph` → CLI-mandatory path: every bundle status transition MUST be performed via `specflow-advance-bundle`.
- If `task-graph.json` exists AND fails schema validation → abort the apply immediately, surface the validation error to the user, and leave the run in `apply_draft`. The agent SHALL NOT silently fall back to legacy behavior in this case.

#### Scenario: Generated apply guide documents the three-way path selection

- **WHEN** generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL explicitly document the three cases above (absent, present + valid, present + malformed) and the required action for each
- **AND** it SHALL NOT document a path where a malformed `task-graph.json` silently falls through to the legacy path

### Requirement: `/specflow.apply` mandates `specflow-advance-bundle` for every bundle status transition

When the CLI-mandatory path is selected, the generated `specflow.apply` guide SHALL require the agent to perform every bundle status transition via `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`. This SHALL apply to all four logical transitions: `pending → in_progress`, `in_progress → done`, `pending → skipped`, and `pending → done`.

The guide SHALL explicitly prohibit the following alternative mutation mechanisms:

- Inline `node -e '…'` scripts that read/write `task-graph.json`
- `jq` / `sed` / `awk` / shell here-docs that edit `task-graph.json` or `tasks.md`
- Direct Edit/Write tool invocations against `task-graph.json` or `tasks.md` for the purpose of advancing bundle status

#### Scenario: Generated apply guide names the CLI as the only status-mutation tool

- **WHEN** generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL contain the literal CLI invocation shape `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`
- **AND** it SHALL contain prose explicitly forbidding inline `node -e` / `jq` / manual edits to `task-graph.json` and `tasks.md` in the CLI-mandatory path

#### Scenario: Generated apply guide does not embed example inline-edit scripts

- **WHEN** generated `specflow.apply.md` is read
- **THEN** it SHALL NOT contain a `node -e` snippet that reads `task-graph.json`, mutates a `bundle.status` or `tasks[*].status` field, and writes the file back
- **AND** it SHALL NOT contain a `jq` expression that rewrites a bundle or task `status` field in `task-graph.json`

### Requirement: `/specflow.apply` fails fast on `specflow-advance-bundle` error

The generated `specflow.apply` guide SHALL instruct the agent to treat a non-zero exit from `specflow-advance-bundle` (schema validation failure, unknown bundle id, invalid status transition, filesystem error, etc.) as a fatal condition for the current apply:

- The apply run SHALL stop at the failing bundle. Subsequent bundles SHALL NOT be advanced in the same Step 1 invocation.
- The CLI's JSON error envelope (from stdout) SHALL be surfaced to the user verbatim.
- The run state SHALL remain in `apply_draft` (no advance to `apply_review`).
- The guide SHALL NOT document any auto-retry or skip-and-continue behavior on CLI failure.

#### Scenario: Generated apply guide documents fail-fast on CLI error

- **WHEN** generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL contain language specifying that a non-zero exit from `specflow-advance-bundle` stops the apply, surfaces the error JSON envelope to the user, and leaves the run in `apply_draft`
- **AND** it SHALL NOT document `retry`, `再試行`, or `skip and continue` behavior for `specflow-advance-bundle` errors

### Requirement: `/specflow.fix_apply` documents the CLI safety-net rule

The generated `specflow.fix_apply` guide SHALL include, in its "Important Rules" (or equivalent bottom-rules) section, a single rule referencing `specflow-advance-bundle` as the required tool for any `task-graph.json` / `tasks.md` mutation that arises inside a fix loop. The rest of the `specflow.fix_apply` flow SHALL remain unchanged (fix loop continues to delegate to the `specflow-review-apply fix-review` orchestrator).

#### Scenario: Generated fix_apply guide carries the safety-net reference

- **WHEN** generated `specflow.fix_apply.md` is read
- **THEN** its "Important Rules" (or the equivalent bottom-rules) section SHALL contain a reference to `specflow-advance-bundle` as the required tool whenever `task-graph.json` or `tasks.md` must be mutated during a fix loop
- **AND** the rule SHALL identify inline edits to `task-graph.json` / `tasks.md` as a contract violation per `task-planner`

### Requirement: `_with_findings` handoffs SHALL expose Approve as a non-primary option

The generated `specflow.review_apply` and `specflow.review_design` guides SHALL, in every handoff state whose name ends in `_with_findings` (i.e., `review_with_findings` and `loop_with_findings`), expose the binding-approval slash command (`/specflow.approve` for apply review, `/specflow.apply` for design review) as a selectable option. The Approve / Apply option SHALL be placed last in the option list (after fix and reject options), SHALL include a severity-summary suffix derived from `handoff.severity_summary`, and SHALL display a confirmation warning describing accepted-risk responsibilities.

#### Scenario: Apply review with-findings exposes Approve as the last option

- **WHEN** the generated `specflow.review_apply.md` describes the `review_with_findings` or `loop_with_findings` handoff
- **THEN** the option list SHALL include `/specflow.approve` as a selectable choice
- **AND** `/specflow.approve` SHALL be the last entry in the list (after the fix-loop and reject options)
- **AND** the Approve label SHALL include a severity-summary suffix referencing `handoff.severity_summary`
- **AND** the guide SHALL display a confirmation warning before launching `/specflow.approve`, instructing the user to confirm accepted-risk treatment of the unresolved HIGH+ findings

#### Scenario: Design review with-findings exposes Apply as the last option

- **WHEN** the generated `specflow.review_design.md` describes the `review_with_findings` or `loop_with_findings` handoff
- **THEN** the option list SHALL include `/specflow.apply` as a selectable choice
- **AND** `/specflow.apply` SHALL be the last entry in the list
- **AND** the Apply label SHALL include a severity-summary suffix referencing `handoff.severity_summary`
- **AND** the guide SHALL display a confirmation warning before launching `/specflow.apply`, instructing the user to confirm accepted-risk treatment of the unresolved HIGH+ findings

#### Scenario: `_no_findings` handoffs do not require the warning

- **WHEN** the generated `specflow.review_apply.md` or `specflow.review_design.md` describes a `review_no_findings` or `loop_no_findings` handoff
- **THEN** the Approve / Apply option SHALL be the first option (primary handoff)
- **AND** the accepted-risk confirmation warning SHALL NOT be required (LOW/MEDIUM severity-summary suffix MAY still be displayed for transparency)

### Requirement: Approve guide Quality Gate SHALL apply the same HIGH+ threshold

The generated `specflow.approve.md` Quality Gate SHALL evaluate ledger blocking conditions using the same threshold as the apply / design review handoff: an unresolved finding whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}` SHALL trigger a Quality Gate WARNING, while findings whose `severity ∈ {medium, low}` SHALL NOT trigger the WARNING (they remain visible in the Approval Summary's Remaining Risks section). The guide SHALL describe the gate as severity-aware so the contract is consistent with the upstream apply / design review handoff.

#### Scenario: Approve Quality Gate warns on unresolved critical or high findings

- **WHEN** the generated `specflow.approve.md` Quality Gate is evaluated
- **AND** the impl or design ledger contains at least one finding whose `severity ∈ {critical, high}` and whose `status ∈ {new, open}`
- **THEN** the gate SHALL display the WARNING block referenced by the existing `has_open_high` semantics
- **AND** the gate description SHALL document that critical findings are included in the same threshold

#### Scenario: Approve Quality Gate passes with only LOW or MEDIUM findings

- **WHEN** the generated `specflow.approve.md` Quality Gate is evaluated
- **AND** every unresolved finding has `severity ∈ {medium, low}`
- **THEN** the gate SHALL pass without the WARNING block
- **AND** the LOW / MEDIUM findings SHALL still appear in the Approval Summary's Remaining Risks section

### Requirement: `/specflow` guide drives the `spec_verify` phase with hybrid CLI + agent flow

The generated `specflow.md` SHALL include a dedicated verify step that is
invoked only when the run is in `spec_verify`. The step SHALL:

- invoke `specflow-spec-verify "<CHANGE_ID>" --json` to obtain the
  machine-readable pairing + ripple report,
- interpret the JSON and surface every candidate conflict to the user
  via `AskUserQuestion` (one at a time), offering the four outcomes
  `fix delta / fix baseline / fix both / accept-as-is`,
- advance with `specflow-run advance "<RUN_ID>" revise_spec` on any
  fix choice, and with `specflow-run advance "<RUN_ID>" spec_verified`
  only when zero candidate conflicts remain unaccepted,
- when the user selects `accept-as-is`, append a row to the
  `## Accepted Spec Conflicts` markdown table in
  `openspec/changes/<CHANGE_ID>/design.md` (creating the file if it
  does not exist) before advancing.

The step SHALL NOT embed full baseline spec file contents inline in the
guide; only the CLI invocation and the conflict-processing prose SHALL
appear.

#### Scenario: Proposal guide contains the hybrid verify step

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain the literal CLI invocation shape
  `specflow-spec-verify "<CHANGE_ID>" --json`
- **AND** it SHALL contain prose describing the four outcome options
  `fix delta`, `fix baseline`, `fix both`, and `accept-as-is`
- **AND** it SHALL contain the literal advance call
  `specflow-run advance "<RUN_ID>" spec_verified`
- **AND** it SHALL contain the literal advance call
  `specflow-run advance "<RUN_ID>" revise_spec`

#### Scenario: Proposal guide describes accept-as-is record writing

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain prose instructing the agent to append a row
  to `## Accepted Spec Conflicts` inside
  `openspec/changes/<CHANGE_ID>/design.md` when the user selects
  `accept-as-is`
- **AND** it SHALL document the six-column schema
  `id | capability | delta_clause | baseline_clause | rationale | accepted_at`

#### Scenario: Empty Modified Capabilities short-circuits

- **WHEN** generated `specflow.md` is read
- **THEN** it SHALL contain prose stating that when
  `specflow-spec-verify` reports `reason: "no_modified_capabilities"`
  the guide advances with `spec_verified` immediately and without
  prompting the user

### Requirement: Mainline terminal-handoff phases SHALL present next-step options via AskUserQuestion

Generated slash-command guides for the mainline workflow SHALL, whenever a command's flow leaves the run in a mainline terminal-handoff phase, present the next-step choice to the operator through an `AskUserQuestion` block rather than prose-only text.

The mainline terminal-handoff phases for this requirement are exactly:

- `spec_ready` — terminal phase of `/specflow`
- `design_ready` — terminal phase of `/specflow.design`
- `apply_ready` — terminal phase of `/specflow.apply`

For each of those phases, the `AskUserQuestion` block in the corresponding generated guide SHALL reference the following slash-command targets in its option set (labels and option order are not normative):

- `spec_ready` in `specflow.md` SHALL reference `/specflow.design` and `/specflow.reject`.
- `design_ready` in `specflow.design.md` SHALL reference `/specflow.apply` and `/specflow.reject`.
- `apply_ready` in `specflow.apply.md` SHALL reference `/specflow.approve`, `/specflow.fix_apply`, and `/specflow.reject`.

Explanatory prose MAY coexist with the `AskUserQuestion` block, but prose-only handoffs SHALL NOT satisfy this requirement.

Review-loop guides (`specflow.review_design.md`, `specflow.review_apply.md`, `specflow.fix_design.md`, `specflow.fix_apply.md`) are NOT governed by this requirement; they remain governed by the existing review-loop handoff requirements.

#### Scenario: Proposal guide presents spec_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.md` is read
- **THEN** the section that offers the next step after the run reaches `spec_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference both `/specflow.design` and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text (for example, a bullet list of "recommended handoffs") in place of the `AskUserQuestion` block

#### Scenario: Design guide presents design_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.design.md` is read
- **THEN** the section that offers the next step after the run reaches `design_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference both `/specflow.apply` and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text in place of the `AskUserQuestion` block

#### Scenario: Apply guide presents apply_ready handoff via AskUserQuestion

- **WHEN** generated `specflow.apply.md` is read
- **THEN** the section that offers the next step after the run reaches `apply_ready` SHALL contain an `AskUserQuestion` block
- **AND** that block's options SHALL reference `/specflow.approve`, `/specflow.fix_apply`, and `/specflow.reject`
- **AND** the section SHALL NOT describe the handoff using prose-only text in place of the `AskUserQuestion` block

#### Scenario: Utility and review-loop guides are exempt

- **WHEN** generated `specflow.reject.md`, `specflow.dashboard.md`, `specflow.setup.md`, `specflow.explore.md`, `specflow.spec.md`, `specflow.license.md`, `specflow.readme.md`, `specflow.review_design.md`, `specflow.review_apply.md`, `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** this requirement SHALL NOT be evaluated against them
- **AND** those guides SHALL continue to be governed only by the existing requirements that apply to them

### Requirement: Review guides drive the auto-fix loop via background invocation and progress polling

The generated `specflow.review_design.md` and `specflow.review_apply.md` slash-command guides SHALL invoke the auto-fix loop via a background invocation + progress-polling pattern for chat-style surfaces, and SHALL NOT require the surface to block on a single synchronous Bash call for the entire loop. The auto-fix loop is defined as `specflow-review-design autofix-loop` or `specflow-review-apply autofix-loop`.

Specifically, each guide's "Auto-fix Loop" (or equivalent) section SHALL:

- document resolving the active `run_id` **before** launching the
  background CLI — the same `run_id` the surface already holds from the
  review-orchestration flow that preceded the autofix invocation — and
  passing it to the CLI so the surface can compute the snapshot path for
  polling;
- document launching the CLI with `run_in_background: true` (or the
  surface-native equivalent) rather than as a synchronous blocking Bash
  call;
- document polling the per-run progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events (per `workflow-observation-events`)
  between rounds, keyed by the known `run_id`;
- document rendering a per-round progress update to the operator that
  references `round_index`, `max_rounds`, `loop_state`, and the severity
  `counters` from the snapshot / event payload;
- document finalizing the loop only when a terminal `loop_state`
  (`terminal_success` or `terminal_failure`) is observed or the
  `abandoned` classification rule (stale `heartbeat_at` beyond
  `autofix_stale_threshold_seconds`) is triggered;
- document the poller switchover rule for retry after `abandoned`: a
  fresh invocation generates a new `run_id`; the surface SHALL stop
  polling the old `run_id` and begin polling the new `run_id`'s snapshot
  path, with no state migration required;
- avoid documenting any loop-step alternative that relies solely on
  `stderr` lines or on parsing the final `LOOP_JSON` to display
  intermediate progress.

The guides MAY describe `stderr` output as a secondary human aid, but
SHALL NOT treat it as the contract source of progress.

#### Scenario: Review-design guide documents background + polling for autofix

- **WHEN** generated `specflow.review_design.md` is read
- **THEN** the Auto-fix Loop section SHALL document invoking
  `specflow-review-design autofix-loop <CHANGE_ID>` via a background
  invocation (e.g. `run_in_background: true` for chat surfaces)
- **AND** it SHALL document polling the progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events between rounds
- **AND** it SHALL NOT document a synchronous blocking Bash invocation as
  the only auto-fix loop path

#### Scenario: Review-apply guide documents background + polling for autofix

- **WHEN** generated `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document invoking
  `specflow-review-apply autofix-loop <CHANGE_ID>` via a background
  invocation (e.g. `run_in_background: true` for chat surfaces)
- **AND** it SHALL document polling the progress snapshot defined by
  `review-autofix-progress-observability` and/or the extended
  `review_completed` observation events between rounds
- **AND** it SHALL NOT document a synchronous blocking Bash invocation as
  the only auto-fix loop path

#### Scenario: Review guides render per-round progress to the operator

- **WHEN** generated `specflow.review_design.md` or
  `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document rendering a per-round
  progress update to the operator that references `round_index`,
  `max_rounds`, `loop_state`, and the severity `counters` from the
  snapshot or the event payload
- **AND** it SHALL NOT rely solely on `stderr` lines or on the final
  `LOOP_JSON` return value to display mid-loop progress

#### Scenario: Review guides finalize only on terminal or abandoned state

- **WHEN** generated `specflow.review_design.md` or
  `specflow.review_apply.md` is read
- **THEN** the Auto-fix Loop section SHALL document that the chat surface
  finalizes the loop only when a terminal `loop_state`
  (`terminal_success` or `terminal_failure`) is observed in the snapshot
  or the event stream
- **AND** it SHALL document the `abandoned` classification rule based on
  the stale-`heartbeat_at` threshold defined by
  `review-autofix-progress-observability`
- **AND** it SHALL document that a subsequent re-invocation is allowed
  when a prior run has been classified as `abandoned`

### Requirement: Watch guide documents invocation forms, default run resolution, and terminal-launch fallback

The generated `specflow.watch.md` slash-command guide SHALL document three things: the accepted invocation forms, the default-run resolution rule when no argument is given, and the terminal-launch sequence (tmux first, macOS `open` second, manual-command fallback last). The guide SHALL NOT document any auto-launch branch that requires a server, a daemon, or a database.

Specifically, the guide SHALL:

- list the invocation forms `/specflow.watch <run_id>`, `/specflow.watch <change_name>`, and `/specflow.watch` (no argument);
- document that the CLI treats the positional argument first as a `run_id`, and if not found, as a `change_name`;
- document the default-run resolution rule used when no argument is given: match `run.change_name == <current git branch>`, `status == active`, ordered by `updated_at DESC` and then `created_at DESC`, picking the first;
- document the tmux branch first: when `$TMUX` is set, launch `specflow-watch <run>` in a new tmux pane or window;
- document the macOS branch second: when `$TMUX` is not set and `open` is available on `PATH`, open a new Terminal window running `specflow-watch <run>`;
- document the manual fallback last: when neither tmux nor `open` applies, print the exact command line for the user to run manually in a separate terminal and exit;
- document that the watcher is read-only: it consumes run-state, autofix progress snapshot, observation events, and `task-graph.json` only, and never mutates run artifacts.

#### Scenario: Watch guide lists the three invocation forms

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document `/specflow.watch <run_id>`, `/specflow.watch <change_name>`, and argument-less `/specflow.watch`
- **AND** it SHALL document that the positional argument is interpreted first as a `run_id` and then as a `change_name`

#### Scenario: Watch guide documents the default-run resolution rule

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document that the argument-less form resolves to the run whose `change_name` matches the current git branch and whose `status == active`
- **AND** it SHALL document the tie-break ordering as `updated_at DESC` then `created_at DESC`, picking the first match
- **AND** it SHALL document that a clear error is produced when no run matches

#### Scenario: Watch guide documents the tmux-then-open-then-manual launch sequence

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document the tmux branch as the first attempt (gated on `$TMUX` being set)
- **AND** it SHALL document the macOS `open` branch as the second attempt
- **AND** it SHALL document the manual-command fallback as the last branch, printing the ready-to-paste `specflow-watch <run>` command
- **AND** it SHALL NOT document any auto-launch path that requires a server, daemon, or database

#### Scenario: Watch guide declares the read-only artifact contract

- **WHEN** generated `specflow.watch.md` is read
- **THEN** it SHALL document that `specflow-watch` consumes run-state, autofix progress snapshot, observation events, and `task-graph.json`
- **AND** it SHALL document that `specflow-watch` does NOT consume or parse `tasks.md`
- **AND** it SHALL document that `specflow-watch` does NOT mutate any run artifact and does NOT call `specflow-run advance`

### Requirement: Watch command is registered in the slash-command registry

The slash-command registry SHALL include a `specflow.watch` entry alongside the other support commands, with a template path pointing to `assets/commands/specflow.watch.md.tmpl` and an output path under `global/commands/specflow.watch.md`.

#### Scenario: Watch command appears in the registry

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow.watch`
- **AND** `specflow.watch` SHALL render to `global/commands/specflow.watch.md`
- **AND** `specflow.watch` SHALL declare a `templatePath` pointing to `assets/commands/specflow.watch.md.tmpl`

### Requirement: `/specflow.apply` Step 1 documents the subagent dispatch decision

The generated `specflow.apply` guide SHALL, in "Step 1: Apply Draft and Implement", document the subagent-vs-inline decision made by the dispatcher for each window:

- The decision SHALL be described as a function of `apply.subagent_dispatch.enabled`, each bundle's `size_score`, and `apply.subagent_dispatch.threshold`.
- The guide SHALL state that a window with AT LEAST ONE subagent-eligible bundle SHALL dispatch the **entire window** as subagents (uniform per-window dispatch), and a window with NO subagent-eligible bundle SHALL execute inline on the main agent.
- The guide SHALL state that a bundle lacking a `size_score` field is always inline-only (backward compatibility for pre-feature `task-graph.json`).
- The guide SHALL state that when `apply.subagent_dispatch.enabled` is `false` (the default) the dispatcher SHALL NOT engage and every bundle SHALL be executed inline on the main agent, preserving pre-feature behavior.

#### Scenario: Generated apply guide documents the window-level dispatch rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL explicitly describe the three conditions under which a window is dispatched as subagents: (a) `enabled: true`, (b) a present-and-valid `task-graph.json`, and (c) at least one bundle in the window with `size_score > threshold`
- **AND** it SHALL state that a mixed window (some eligible, some not) dispatches ALL bundles as subagents
- **AND** it SHALL state that a window with zero eligible bundles executes inline on the main agent

#### Scenario: Generated apply guide documents the opt-in default

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** it SHALL state that subagent dispatch is opt-in via `apply.subagent_dispatch.enabled` in `openspec/config.yaml`
- **AND** it SHALL state that the default is `false`, which preserves the pre-feature single-agent behavior

#### Scenario: Generated apply guide documents the size_score backward-compatibility rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that a bundle with no `size_score` field is classified as inline-only regardless of the configured threshold

### Requirement: `/specflow.apply` documents the context-packaging contract for subagents

The generated `specflow.apply` guide SHALL document the context package the main agent assembles per subagent-dispatched bundle. The package SHALL be described as containing exactly:

1. `openspec/changes/<CHANGE_ID>/proposal.md` (full content)
2. `openspec/changes/<CHANGE_ID>/design.md` (full content)
3. For each `cap` in the bundle's `owner_capabilities`: the baseline spec at `openspec/specs/<cap>/spec.md` (if it exists) and the spec-delta at `openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md` (if it exists)
4. The bundle slice of `task-graph.json` (bundle object + `outputs` of direct `depends_on`)
5. The bundle's section of `tasks.md`
6. The contents of each artifact listed in the bundle's `inputs`

The guide SHALL explicitly state that at least one of the baseline spec or spec-delta SHALL exist for every `cap`, and that if both are missing the apply SHALL abort with a fail-fast error identifying the missing capability.

#### Scenario: Generated apply guide enumerates the six context-package items

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL enumerate, in order, the six categories of content included in a subagent's context package (proposal.md, design.md, per-capability specs, bundle slice of task-graph.json, bundle's section of tasks.md, bundle inputs)

#### Scenario: Generated apply guide documents the missing-capability abort rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that if a bundle's `owner_capabilities` contains a `cap` for which neither baseline spec nor spec-delta exists, the apply SHALL abort before dispatching any subagent in the window
- **AND** it SHALL state that the run remains in `apply_draft` on this abort

### Requirement: `/specflow.apply` documents chunked parallel fan-out and fail-fast semantics

The generated `specflow.apply` guide SHALL describe the chunked parallel fan-out used when a window is dispatched as subagents:

- Windows larger than `apply.subagent_dispatch.max_concurrency` SHALL be split into sequential chunks of size ≤ `max_concurrency`.
- Within a chunk, subagents run in parallel. The next chunk SHALL NOT begin until every subagent in the current chunk has settled.
- If any subagent in the current chunk returns `"failure"`, the main agent SHALL wait for every sibling in the same chunk to settle, SHALL invoke `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> done` for each success, and SHALL NOT transition the failed bundle beyond the pre-dispatch `in_progress` state. After settling, the apply SHALL STOP with the run remaining in `apply_draft`.
- The guide SHALL cite `/specflow.fix_apply` and manual intervention as the documented recovery paths.
- The guide SHALL explicitly state that `specflow-advance-bundle` remains the sole mutation entry point and is invoked only by the main agent — subagents SHALL NOT invoke `specflow-advance-bundle` and SHALL NOT directly edit `task-graph.json` or `tasks.md`.

#### Scenario: Generated apply guide describes chunked fan-out bounded by max_concurrency

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL describe the chunking rule: windows larger than `apply.subagent_dispatch.max_concurrency` are split into sequential chunks of size ≤ `max_concurrency` and chunks run sequentially while subagents within a chunk run in parallel

#### Scenario: Generated apply guide describes the fail-fast settle-then-stop rule

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL describe that on any subagent failure the main agent waits for sibling subagents in the same chunk to settle, records `done` for each success via `specflow-advance-bundle`, leaves the failed bundle in `in_progress`, and then STOPs the apply with the run remaining in `apply_draft`

#### Scenario: Generated apply guide preserves sole-mutation-entry-point rule for subagents

- **WHEN** the generated `specflow.apply.md` is read
- **THEN** Step 1 SHALL state that subagents SHALL NOT invoke `specflow-advance-bundle` and SHALL NOT edit `task-graph.json` or `tasks.md` directly
- **AND** the main agent SHALL be the sole caller of `specflow-advance-bundle`

