## MODIFIED Requirements

### Requirement: Design review operates on change artifacts and a design ledger

`specflow-review-design` SHALL review `proposal.md`, `design.md`, `tasks.md`,
and any change-local `spec.md` files, and SHALL persist its state in
`review-ledger-design.json`.

#### Scenario: Design review requires generated design artifacts

- **WHEN** `design.md` or `tasks.md` is missing from the change directory
- **THEN** `specflow-review-design` SHALL return `missing_artifacts`

#### Scenario: Design re-review updates matched finding severity

- **WHEN** a re-review marks an existing finding as still open with a different
  severity
- **THEN** the stored finding SHALL keep its id and update its severity

#### Scenario: Design review supports an autofix loop

- **WHEN** `specflow-review-design autofix-loop <CHANGE_ID>` is invoked
- **THEN** the CLI SHALL iterate review rounds until the loop resolves the
  actionable findings, reaches `max_rounds_reached`, or detects `no_progress`

#### Scenario: Design autofix loop emits round-level observation events

- **WHEN** `specflow-review-design autofix-loop <CHANGE_ID>` is running
- **THEN** the loop SHALL emit a `review_completed` observation event at
  the start of each round (`autofix.loop_state = "in_progress"`) and
  another at the end of each round (`autofix.loop_state` transitioning
  to `"awaiting_review"`, `"terminal_success"`, or `"terminal_failure"`)
- **AND** the loop SHALL emit a final terminal `review_completed` event
  carrying `autofix.loop_state ∈ {terminal_success, terminal_failure}`
  and a non-null `autofix.terminal_outcome` when the loop exits
- **AND** the event payloads SHALL conform to the extended
  `review_completed` payload defined by `workflow-observation-events`

#### Scenario: Design autofix loop refreshes the progress snapshot

- **WHEN** `specflow-review-design autofix-loop <CHANGE_ID>` is running
- **THEN** the loop SHALL rewrite the per-run progress snapshot defined
  by `review-autofix-progress-observability` at least every
  `autofix_heartbeat_seconds` (default `30`)
- **AND** the snapshot SHALL converge to a terminal `loop_state` on
  loop exit

### Requirement: Apply review operates on filtered git diffs and an implementation ledger
`specflow-review-apply` SHALL obtain the implementation diff via the injected
`WorkspaceContext.filteredDiff()` method instead of calling `specflow-filter-diff`
directly, and SHALL persist implementation review state in `review-ledger.json`.

#### Scenario: Apply review filters the diff via WorkspaceContext
- **WHEN** `specflow-review-apply review <CHANGE_ID>` runs
- **THEN** it SHALL call `WorkspaceContext.filteredDiff()` with appropriate exclude globs
- **AND** it SHALL pass the filtered diff and `proposal.md` content into the review prompt

#### Scenario: Apply review handles empty diff from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns `summary: "empty"`
- **THEN** it SHALL skip the review and report that no reviewable changes were found

#### Scenario: Apply review warns on large diffs from WorkspaceContext
- **WHEN** `WorkspaceContext.filteredDiff()` returns a `DiffSummary` with `total_lines` exceeding the configured threshold
- **THEN** it SHALL set the `diff_warning` flag and follow the existing warning flow

#### Scenario: Apply autofix loop emits round-level observation events

- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID>` is running
- **THEN** the loop SHALL emit a `review_completed` observation event at
  the start of each round (`autofix.loop_state = "in_progress"`) and
  another at the end of each round (`autofix.loop_state` transitioning
  to `"awaiting_review"`, `"terminal_success"`, or `"terminal_failure"`)
- **AND** the loop SHALL emit a final terminal `review_completed` event
  carrying `autofix.loop_state ∈ {terminal_success, terminal_failure}`
  and a non-null `autofix.terminal_outcome` when the loop exits
- **AND** the event payloads SHALL conform to the extended
  `review_completed` payload defined by `workflow-observation-events`

#### Scenario: Apply autofix loop refreshes the progress snapshot

- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID>` is running
- **THEN** the loop SHALL rewrite the per-run progress snapshot defined
  by `review-autofix-progress-observability` at least every
  `autofix_heartbeat_seconds` (default `30`)
- **AND** the snapshot SHALL converge to a terminal `loop_state` on
  loop exit

### Requirement: Review configuration is read from `openspec/config.yaml` with stable defaults

The review runtime SHALL read review configuration from `openspec/config.yaml`
and SHALL fall back to built-in defaults when the keys are absent or invalid.

#### Scenario: Missing config uses defaults

- **WHEN** review configuration cannot be read from `openspec/config.yaml`
- **THEN** the runtime SHALL use `diff_warn_threshold = 1000`,
  `max_autofix_rounds = 4`, `autofix_heartbeat_seconds = 30`, and
  `autofix_stale_threshold_seconds = 120`

#### Scenario: Invalid max-autofix values fall back to the default

- **WHEN** `max_autofix_rounds` is not an integer in the range `1..10`
- **THEN** the runtime SHALL use `4`

#### Scenario: Invalid autofix heartbeat values fall back to the default

- **WHEN** `autofix_heartbeat_seconds` is not a positive integer
- **THEN** the runtime SHALL use `30`
- **AND** when `autofix_stale_threshold_seconds` is not a positive
  integer greater than or equal to the effective
  `autofix_heartbeat_seconds` value, the runtime SHALL use `120`
