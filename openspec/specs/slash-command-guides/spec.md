# slash-command-guides Specification

## Purpose

Describe the slash-command guides generated from the current command contract
registry.
## Requirements
### Requirement: Contract-defined slash-command assets

The system SHALL define slash-command assets from `commandContracts`. Each
command SHALL have an id, slash-command name, output path under
`global/commands/`, accepted argument placeholder, references, and a markdown
body.

#### Scenario: Mainline commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL include `specflow`, `specflow.design`, `specflow.apply`,
  and `specflow.approve`
- **AND** each of those commands SHALL render to `global/commands/<id>.md`

#### Scenario: Support commands are registered

- **WHEN** the command registry is inspected
- **THEN** it SHALL also include `specflow.reject`, `specflow.review_design`,
  `specflow.review_apply`, `specflow.fix_design`, `specflow.fix_apply`,
  `specflow.explore`, `specflow.spec`, `specflow.decompose`,
  `specflow.dashboard`, `specflow.setup`, `specflow.license`, and
  `specflow.readme`

### Requirement: Generated markdown preserves body sections and hook sections

Generated command markdown SHALL render command body sections in order and SHALL
append a `Run State Hooks` section whenever the contract defines run hooks.

#### Scenario: Hooked commands render run-state hook sections

- **WHEN** generated `specflow.md`, `specflow.design.md`, `specflow.apply.md`,
  `specflow.fix_design.md`, or `specflow.fix_apply.md` is read
- **THEN** the file SHALL contain a `## Run State Hooks` section

#### Scenario: Commands without hooks omit the hook section

- **WHEN** generated command markdown is read for a command with no run hooks
- **THEN** the file SHALL render the command body without a `Run State Hooks`
  section

### Requirement: Mainline workflow guides encode strict phase gates

The generated guides for the main slash-command workflow SHALL encode the
current phase order and SHALL not document bypasses around the implemented
gates.

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

#### Scenario: Approve keeps archive before commit

- **WHEN** generated `specflow.approve.md` is read
- **THEN** it SHALL order the `Archive`, `Commit`, and `Push & Pull Request`
  sections in that sequence

### Requirement: Review-loop guides define handoff targets and revision events

The review and fix-loop slash-command guides SHALL describe the current Codex
review handoffs and the phase-specific revision transitions used by the run
state machine.

#### Scenario: Design review guide exposes apply and fix handoffs

- **WHEN** the `specflow.review_design` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.apply`,
  `handoff:specflow.reject`, and `handoff:specflow.fix_design`

#### Scenario: Apply review guide exposes approve and fix handoffs

- **WHEN** the `specflow.review_apply` contract is inspected
- **THEN** it SHALL reference `handoff:specflow.approve`,
  `handoff:specflow.fix_apply`, and `handoff:specflow.reject`

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

