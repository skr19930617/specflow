## ADDED Requirements

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
