# apply-orchestrator Specification

## Purpose
TBD - created by archiving change bash-orchestrator-extraction. Update Purpose after archive.
## Requirements
### Requirement: Orchestrator script entry point
The system SHALL provide `bin/specflow-review-apply` as a Node-based CLI entrypoint with three subcommands: `review`, `fix-review`, and `autofix-loop`. The command SHALL exit with code 0 on success and non-zero on error, outputting result JSON to stdout and log messages to stderr.

#### Scenario: Review subcommand invocation
- **WHEN** `specflow-review-apply review <CHANGE_ID>` is executed
- **THEN** the script SHALL run the full review pipeline (diff → codex → ledger → score) and output result JSON to stdout

#### Scenario: Fix-review subcommand invocation
- **WHEN** `specflow-review-apply fix-review <CHANGE_ID>` is executed
- **THEN** the script SHALL run the fix-review pipeline (diff → codex re-review → ledger → score) and output result JSON to stdout

#### Scenario: Autofix-loop subcommand invocation
- **WHEN** `specflow-review-apply autofix-loop <CHANGE_ID> --max-rounds 4` is executed
- **THEN** the script SHALL run the auto-fix loop up to the specified max rounds and output result JSON to stdout

#### Scenario: Missing CHANGE_ID argument
- **WHEN** `specflow-review-apply review` is executed without a CHANGE_ID
- **THEN** the script SHALL exit with code 1 and print usage to stderr

#### Scenario: Invalid subcommand
- **WHEN** `specflow-review-apply invalid-cmd` is executed
- **THEN** the script SHALL exit with code 1 and print available subcommands to stderr

### Requirement: Diff filtering pipeline
The orchestrator SHALL invoke `specflow-filter-diff` to produce a filtered diff and parse the summary JSON. The orchestrator SHALL detect empty diffs and line count threshold exceedance.

#### Scenario: Normal diff filtering
- **WHEN** the review subcommand runs and `specflow-filter-diff` produces a non-empty diff
- **THEN** the result JSON SHALL contain `diff_summary` with `excluded_count`, `included_count`, and `total_lines`

#### Scenario: Empty diff detection
- **WHEN** `specflow-filter-diff` produces an empty diff (0 bytes)
- **THEN** the orchestrator SHALL exit with code 0 and set `status: "error"` with `error: "no_changes"` in the result JSON

#### Scenario: Line count threshold exceedance
- **WHEN** the filtered diff `total_lines` exceeds the configured `diff_warn_threshold`
- **THEN** the result JSON SHALL contain `diff_warning: true` and `diff_total_lines` so the slash command can prompt the user

### Requirement: Codex CLI invocation
The orchestrator SHALL invoke `codex exec --full-auto --ephemeral -o <output-file>` with the review prompt and parse the JSON response. The orchestrator SHALL handle parse failures gracefully.

#### Scenario: Successful Codex invocation
- **WHEN** codex CLI returns valid JSON
- **THEN** the result JSON SHALL contain the parsed review findings in `review.findings`

#### Scenario: Codex JSON parse failure
- **WHEN** codex CLI returns invalid JSON
- **THEN** the result JSON SHALL contain `review.parse_error: true` and `review.raw_response` with the raw output
- **THEN** ledger update SHALL be skipped

#### Scenario: Review prompt selection
- **WHEN** the subcommand is `review` (initial)
- **THEN** the orchestrator SHALL use `review_apply_prompt.md`
- **WHEN** the subcommand is `fix-review` (re-review)
- **THEN** the orchestrator SHALL use `review_apply_rereview_prompt.md`

### Requirement: Ledger lifecycle management
The orchestrator SHALL manage the full ledger lifecycle: read (with corruption recovery), validate, increment round, match findings, compute summary, compute status, backup, and write. The ledger filename SHALL be configurable via the `ledger_init` function in `lib/specflow-ledger.sh`.

#### Scenario: Ledger creation on first review
- **WHEN** the ledger file (as configured by `ledger_init` or default `review-ledger.json`) does not exist and `review` subcommand runs
- **THEN** the orchestrator SHALL create a new ledger with `current_round: 0`, empty `findings`, and empty `round_summaries`

#### Scenario: Ledger corruption recovery from backup
- **WHEN** the ledger file exists but JSON parse fails and the corresponding `.bak` file exists and is valid
- **THEN** the orchestrator SHALL rename the corrupt file to `.corrupt`, use the backup, and log a warning to stderr

#### Scenario: Ledger corruption with no backup
- **WHEN** the ledger file is corrupt and no valid backup exists
- **THEN** the result JSON SHALL contain `ledger_recovery: "prompt_user"` so the slash command can ask the user whether to create a new ledger or abort

#### Scenario: High-severity override notes validation
- **WHEN** a high-severity finding has status `accepted_risk` or `ignored` with empty notes
- **THEN** the orchestrator SHALL revert the finding status to `open` and log a warning to stderr

#### Scenario: Round counter increment
- **WHEN** ledger update begins
- **THEN** `current_round` SHALL be incremented by 1

### Requirement: Finding matching algorithm (initial review)
For initial reviews (no re-review mode), the orchestrator SHALL use a 3-stage matching algorithm: same match, reframed match, remaining.

#### Scenario: Same match (file + category + severity)
- **WHEN** a Codex finding matches an existing ledger finding by file, category, and severity
- **THEN** the existing finding SHALL be updated with `relation: "same"` and `latest_round` set to the current round

#### Scenario: Reframed match (file + category, different severity)
- **WHEN** a Codex finding matches by file and category but has a different severity
- **THEN** the old finding SHALL be set to `status: "resolved"`, `relation: "reframed"`
- **THEN** a new finding SHALL be created with `relation: "reframed"` and `supersedes` set to the old finding ID

#### Scenario: Remaining findings (no match)
- **WHEN** a Codex finding does not match any existing finding
- **THEN** a new finding SHALL be created with `relation: "new"` and a new ID in format `R{round}-F{seq}`

#### Scenario: Unmatched active findings resolved
- **WHEN** an existing active finding (open/new) is not matched by any Codex finding
- **THEN** the finding SHALL be set to `status: "resolved"`

#### Scenario: Override findings preserved
- **WHEN** an existing finding with status `accepted_risk` or `ignored` is not matched
- **THEN** the finding status SHALL be preserved unchanged

### Requirement: Finding classification (re-review mode)
For re-reviews, the orchestrator SHALL apply the Codex-provided classification (resolved/still_open/new_findings) with validation.

#### Scenario: Exhaustive classification check
- **WHEN** a prior finding ID is missing from both resolved and still_open lists
- **THEN** the orchestrator SHALL auto-classify it as `still_open` and log a warning

#### Scenario: Duplicate classification check
- **WHEN** a finding ID appears in both resolved and still_open lists
- **THEN** the orchestrator SHALL keep the `still_open` classification and remove from resolved

#### Scenario: Unknown ID exclusion
- **WHEN** a finding ID in the Codex response does not exist in prior findings
- **THEN** the orchestrator SHALL exclude it from ledger update and log a warning

### Requirement: Zero-findings edge case
The orchestrator SHALL handle the case where Codex returns zero findings.

#### Scenario: All active findings resolved on zero findings
- **WHEN** Codex returns 0 findings
- **THEN** all active (open/new) findings SHALL be set to `status: "resolved"`
- **THEN** override findings (accepted_risk/ignored) SHALL be preserved

### Requirement: Score aggregation
The orchestrator SHALL compute severity-weighted scores and round summaries.

#### Scenario: Severity-weighted score calculation
- **WHEN** ledger update completes
- **THEN** the score SHALL be computed as `sum(high*3 + medium*2 + low*1)` for all unresolved findings

#### Scenario: Round summary snapshot
- **WHEN** ledger update completes
- **THEN** a round summary SHALL be appended to `round_summaries` with counts for total, open, new, resolved, overridden, and by_severity breakdown

#### Scenario: Top-level status derivation
- **WHEN** any high-severity finding has status in [open, new, accepted_risk, ignored]
- **THEN** ledger status SHALL be `has_open_high`
- **WHEN** all findings have status resolved or findings is empty
- **THEN** ledger status SHALL be `all_resolved`
- **WHEN** neither condition applies
- **THEN** ledger status SHALL be `in_progress`

### Requirement: Ledger backup and atomic write
The orchestrator SHALL create a backup before writing and use atomic writes.

#### Scenario: Backup creation on clean read
- **WHEN** the ledger was read successfully (not recovered from backup)
- **THEN** the pre-update content SHALL be written to `review-ledger.json.bak` before the updated ledger is written

#### Scenario: No backup on recovery
- **WHEN** the ledger was recovered from backup or newly created
- **THEN** no backup SHALL be created from this content

#### Scenario: Atomic write
- **WHEN** the ledger is written
- **THEN** the write SHALL use a temporary file and rename pattern

### Requirement: max_finding_id persistence
The orchestrator SHALL maintain `max_finding_id` in the ledger to prevent ID collisions across rounds.

#### Scenario: max_finding_id computed on write
- **WHEN** ledger is written
- **THEN** `max_finding_id` SHALL be the maximum numeric part across all finding IDs

#### Scenario: max_finding_id on empty findings
- **WHEN** findings array is empty
- **THEN** `max_finding_id` SHALL be 0

### Requirement: Auto-fix loop orchestration
The orchestrator `autofix-loop` subcommand SHALL manage the full auto-fix cycle with baseline snapshot, round iteration, and stop conditions.

#### Scenario: Baseline snapshot before loop
- **WHEN** autofix-loop starts
- **THEN** the orchestrator SHALL record `baseline_score`, `baseline_new_high_count: 0`, and baseline high finding titles

#### Scenario: Success stop condition
- **WHEN** `unresolved_high_count == 0` after a round
- **THEN** the loop SHALL terminate with `result: "success"`

#### Scenario: Max rounds stop condition
- **WHEN** `autofix_round >= MAX_ROUNDS` and `unresolved_high_count > 0`
- **THEN** the loop SHALL terminate with `result: "max_rounds_reached"`

#### Scenario: Divergence warning - quality gate degradation
- **WHEN** `current_score > previous_score` after a round
- **THEN** the orchestrator SHALL record a divergence warning of type `quality_gate_degradation`

#### Scenario: Divergence warning - finding re-emergence
- **WHEN** a previously resolved high finding title re-appears as unresolved
- **THEN** the orchestrator SHALL record a divergence warning of type `finding_re_emergence`

#### Scenario: Divergence warning - new high increase
- **WHEN** `current_new_high_count > previous_new_high_count` in round 2 or later
- **THEN** the orchestrator SHALL record a divergence warning of type `new_high_increase`

### Requirement: Handoff state determination
The orchestrator SHALL determine the handoff state based on actionable findings count and include it in the result JSON.

#### Scenario: Review with findings
- **WHEN** `actionable_count > 0` after initial review
- **THEN** handoff state SHALL be `review_with_findings`

#### Scenario: Review no findings
- **WHEN** `actionable_count == 0` after initial review
- **THEN** handoff state SHALL be `review_no_findings`

#### Scenario: Loop no findings
- **WHEN** `actionable_count == 0` after auto-fix loop
- **THEN** handoff state SHALL be `loop_no_findings`

#### Scenario: Loop with findings
- **WHEN** `actionable_count > 0` after auto-fix loop
- **THEN** handoff state SHALL be `loop_with_findings`

### Requirement: current-phase.md generation
The orchestrator SHALL generate `current-phase.md` after ledger update with phase, round, status, open high findings, accepted risks, latest changes, and next recommended action.

#### Scenario: current-phase.md content after initial review
- **WHEN** the review completes at round 1
- **THEN** `current-phase.md` SHALL contain `Phase: impl-review`, `Round: 1`, and the computed status

#### Scenario: current-phase.md content after fix review
- **WHEN** the fix-review completes at round > 1
- **THEN** `current-phase.md` SHALL contain `Phase: fix-review` and the current round number

### Requirement: Result JSON schema
All subcommands SHALL output a unified result JSON schema to stdout containing status, action, review results, ledger state, autofix state (if applicable), handoff state, and error information.

#### Scenario: Successful review result JSON
- **WHEN** the review pipeline completes successfully
- **THEN** the result JSON SHALL contain `status: "success"`, `review`, `ledger`, and `handoff` objects

#### Scenario: Error result JSON
- **WHEN** any pipeline step fails fatally
- **THEN** the result JSON SHALL contain `status: "error"` and `error` with a description

### Requirement: Ledger library filename parameterization
The `lib/specflow-ledger.sh` library SHALL provide a `ledger_init` function that allows callers to configure the ledger filename and backup filename. If `ledger_init` is not called, the default filenames (`review-ledger.json` and `review-ledger.json.bak`) SHALL be used for backward compatibility.

#### Scenario: Default filename without ledger_init
- **WHEN** `ledger_read` is called without a prior `ledger_init` call
- **THEN** the library SHALL use `review-ledger.json` as the ledger filename and `review-ledger.json.bak` as the backup filename

#### Scenario: Custom filename via ledger_init
- **WHEN** `ledger_init "review-ledger-design.json"` is called before `ledger_read`
- **THEN** the library SHALL use `review-ledger-design.json` as the ledger filename and `review-ledger-design.json.bak` as the backup filename

#### Scenario: ledger_init with phase parameter
- **WHEN** `ledger_init "review-ledger-design.json" "design"` is called
- **THEN** the library SHALL use the specified filename AND set the default phase to `"design"` for newly created ledgers (via `_empty_ledger`)

#### Scenario: Multiple ledger_init calls
- **WHEN** `ledger_init` is called multiple times
- **THEN** the most recent call's values SHALL take effect
