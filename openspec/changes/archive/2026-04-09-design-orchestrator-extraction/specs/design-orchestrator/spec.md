## ADDED Requirements

### Requirement: Orchestrator script entry point
The system SHALL provide `bin/specflow-review-design` as a Bash script with three subcommands: `review`, `fix-review`, and `autofix-loop`. The script SHALL exit with code 0 on success and non-zero on error, outputting result JSON to stdout and log messages to stderr.

#### Scenario: Review subcommand invocation
- **WHEN** `specflow-review-design review <CHANGE_ID>` is executed
- **THEN** the script SHALL run the full design review pipeline (read artifacts → codex → ledger → score → current-phase.md) and output result JSON to stdout

#### Scenario: Fix-review subcommand invocation
- **WHEN** `specflow-review-design fix-review <CHANGE_ID>` is executed
- **THEN** the script SHALL run the re-review pipeline (codex re-review → ledger → score) and output result JSON to stdout

#### Scenario: Autofix-loop subcommand invocation
- **WHEN** `specflow-review-design autofix-loop <CHANGE_ID> --max-rounds 4` is executed
- **THEN** the script SHALL run the auto-fix loop up to the specified max rounds and output result JSON to stdout

#### Scenario: Missing CHANGE_ID argument
- **WHEN** `specflow-review-design review` is executed without a CHANGE_ID
- **THEN** the script SHALL exit with code 1 and print usage to stderr

#### Scenario: Invalid subcommand
- **WHEN** `specflow-review-design invalid-cmd` is executed
- **THEN** the script SHALL exit with code 1 and print available subcommands to stderr

### Requirement: Artifact file reading pipeline
The orchestrator SHALL read artifact files (proposal.md, design.md, tasks.md, and spec files under specs/) from the change directory and pass their contents directly to Codex. No diff filtering SHALL be applied.

#### Scenario: Normal artifact reading
- **WHEN** the review subcommand runs and all required artifact files exist in the change directory
- **THEN** the prompt SHALL contain the full contents of proposal.md, design.md, tasks.md, and any spec.md files under specs/

#### Scenario: Missing artifact detection
- **WHEN** a required artifact file (design.md or tasks.md) is missing from the change directory
- **THEN** the orchestrator SHALL exit with code 1 and set `status: "error"` with `error: "missing_artifacts"` in the result JSON

### Requirement: Codex CLI invocation for design review
The orchestrator SHALL invoke `codex --approval-mode full-auto -q` with the design review prompt and parse the JSON response. The orchestrator SHALL handle parse failures gracefully.

#### Scenario: Successful Codex invocation
- **WHEN** codex CLI returns valid JSON
- **THEN** the result JSON SHALL contain the parsed review findings in `review.findings`

#### Scenario: Codex JSON parse failure
- **WHEN** codex CLI returns invalid JSON
- **THEN** the result JSON SHALL contain `review.parse_error: true` and `review.raw_response` with the raw output
- **THEN** ledger update SHALL be skipped

#### Scenario: Review prompt selection for initial review
- **WHEN** the subcommand is `review`
- **THEN** the orchestrator SHALL use `review_design_prompt.md`

#### Scenario: Review prompt selection for re-review
- **WHEN** the subcommand is `fix-review`
- **THEN** the orchestrator SHALL use `review_design_rereview_prompt.md`

### Requirement: Design ledger lifecycle management
The orchestrator SHALL manage the full design ledger lifecycle using `review-ledger-design.json`: read (with corruption recovery), validate, increment round, match findings, compute summary, compute status, backup, and write. The orchestrator SHALL call `ledger_init "review-ledger-design.json"` before any ledger operations.

#### Scenario: Ledger creation on first review
- **WHEN** `review-ledger-design.json` does not exist and `review` subcommand runs
- **THEN** the orchestrator SHALL create a new ledger with `phase: "design"`, `current_round: 0`, empty `findings`, and empty `round_summaries`

#### Scenario: Ledger corruption recovery from backup
- **WHEN** `review-ledger-design.json` exists but JSON parse fails and `review-ledger-design.json.bak` exists and is valid
- **THEN** the orchestrator SHALL rename the corrupt file to `.corrupt`, use the backup, and log a warning to stderr

#### Scenario: Ledger corruption with no backup
- **WHEN** `review-ledger-design.json` is corrupt and no valid backup exists
- **THEN** the result JSON SHALL contain `ledger_recovery: "prompt_user"` so the slash command can ask the user whether to create a new ledger or abort

#### Scenario: Ledger reset via --reset-ledger flag
- **WHEN** `specflow-review-design review <CHANGE_ID> --reset-ledger` is executed
- **THEN** the orchestrator SHALL create a fresh empty ledger (overwriting any existing file) before proceeding with the normal review pipeline

#### Scenario: Autofix-loop auto-reinitialization on missing ledger
- **WHEN** `autofix-loop` runs and `review-ledger-design.json` does not exist
- **THEN** the orchestrator SHALL create a fresh empty ledger with a warning to stderr and continue the loop (no user prompt)

#### Scenario: Autofix-loop auto-reinitialization on corrupt ledger
- **WHEN** `autofix-loop` runs and `review-ledger-design.json` is corrupt with no valid backup
- **THEN** the orchestrator SHALL create a fresh empty ledger with a warning to stderr and continue the loop (no user prompt)

#### Scenario: High-severity override notes validation
- **WHEN** a high-severity finding has status `accepted_risk` or `ignored` with empty notes
- **THEN** the orchestrator SHALL revert the finding status to `open` and log a warning to stderr

#### Scenario: Round counter increment
- **WHEN** ledger update begins
- **THEN** `current_round` SHALL be incremented by 1

### Requirement: Finding matching algorithm (initial review)
For initial reviews, the orchestrator SHALL use the same 3-stage matching algorithm as the apply-side: same match, reframed match, remaining.

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

#### Scenario: Severity re-evaluation for still_open findings
- **WHEN** a still_open finding has a different severity in the Codex re-review response
- **THEN** the orchestrator SHALL update the finding's severity in the ledger to the re-evaluated value

#### Scenario: ledger_error true handling
- **WHEN** the Codex re-review response contains `ledger_error: true`
- **THEN** the orchestrator SHALL clear all existing findings and use only `new_findings` from the response, setting `max_finding_id` from new_findings only

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
- **THEN** the pre-update content SHALL be written to `review-ledger-design.json.bak` before the updated ledger is written

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
The orchestrator `autofix-loop` subcommand SHALL manage the full auto-fix cycle with baseline snapshot, round iteration, and stop conditions. Each round SHALL use the `codex` CLI to both fix design.md/tasks.md (via `fix_design_prompt.md`) AND re-review them. The slash command is NOT invoked during the loop.

#### Scenario: Round fix step via codex CLI
- **WHEN** an auto-fix round begins
- **THEN** the orchestrator SHALL build a fix prompt containing current findings and artifact contents, invoke `codex --approval-mode full-auto -q` to modify design.md/tasks.md, then proceed to re-review

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

#### Scenario: Fix prompt file fallback
- **WHEN** `fix_design_prompt.md` is not found at `~/.config/specflow/global/prompts/`
- **THEN** the orchestrator SHALL use a generic fix instruction as fallback

#### Scenario: Codex fix step failure in autofix round
- **WHEN** the codex fix invocation fails (non-zero exit or empty output) during a round
- **THEN** the orchestrator SHALL log a warning, skip the round, and continue to the next round

#### Scenario: Re-review parse failure in autofix round
- **WHEN** the codex re-review returns invalid JSON during a round
- **THEN** the orchestrator SHALL log a warning, skip ledger update for this round, and continue

#### Scenario: No-progress stop condition
- **WHEN** 2 consecutive autofix rounds produce no effective artifact changes
- **THEN** the loop SHALL terminate with `result: "no_progress"`

#### Scenario: Fatal error stop condition
- **WHEN** a fatal error occurs during autofix (ledger write failure, etc.)
- **THEN** the loop SHALL terminate with `result: "error"`

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
- **THEN** `current-phase.md` SHALL contain `Phase: design-review`, `Round: 1`, and the computed status

#### Scenario: current-phase.md content after fix review
- **WHEN** the fix-review completes at round > 1
- **THEN** `current-phase.md` SHALL contain `Phase: design-fix-review` and the current round number

#### Scenario: Next recommended action derivation
- **WHEN** open high findings exist
- **THEN** next action SHALL be `/specflow.fix_design`
- **WHEN** no open high findings exist
- **THEN** next action SHALL be `/specflow.apply`

### Requirement: Result JSON schema
All subcommands SHALL output a unified result JSON schema to stdout matching the apply-side schema, containing status, action, review results, ledger state, autofix state (if applicable), handoff state, and error information.

#### Scenario: Successful review result JSON
- **WHEN** the review pipeline completes successfully
- **THEN** the result JSON SHALL contain `status: "success"`, `review`, `ledger`, and `handoff` objects

#### Scenario: Error result JSON
- **WHEN** any pipeline step fails fatally
- **THEN** the result JSON SHALL contain `status: "error"` and `error` with a description

#### Scenario: Fix-review result includes re-review classification
- **WHEN** the `fix-review` pipeline completes successfully
- **THEN** the result JSON SHALL include a `rereview_classification` object with `resolved`, `still_open`, and `new_findings` arrays containing finding IDs, enabling the slash command to display the classification table
