## ADDED Requirements

### Requirement: Autofix loop SHALL continue on divergence detection
The autofix loop SHALL NOT stop when divergence is detected (quality gate degradation, finding re-emergence, or new high increase). Instead, the loop SHALL record a warning and continue until `MAX_AUTOFIX_ROUNDS` is reached or all high findings are resolved.

#### Scenario: Quality gate score increases during autofix round
- **WHEN** the quality gate score increases compared to the previous round (5c condition)
- **THEN** the system SHALL record a divergence warning with type "quality_gate_degradation" and the score delta
- **AND** the system SHALL continue to the next autofix round

#### Scenario: Resolved high finding re-emerges
- **WHEN** a previously resolved high-severity finding re-emerges with a matching title (5b condition)
- **THEN** the system SHALL record a divergence warning with type "finding_re_emergence" and the matching title
- **AND** the system SHALL continue to the next autofix round

#### Scenario: New high findings increase after round 2
- **WHEN** the count of new high findings increases compared to the previous round (5d condition, round >= 2)
- **THEN** the system SHALL record a divergence warning with type "new_high_increase" and the count delta
- **AND** the system SHALL continue to the next autofix round

#### Scenario: Success check still takes priority
- **WHEN** all high-severity findings with status "new" or "open" reach 0 during any round
- **THEN** the system SHALL stop the loop immediately with success, regardless of any divergence warnings recorded

### Requirement: Autofix loop SHALL re-initialize ledger on corruption in autofix mode
When the autofix loop calls `specflow.fix_apply` or `specflow.fix_design` in autofix mode, and the review ledger file is missing or corrupted, the system SHALL create a new empty ledger and continue the loop instead of stopping.

#### Scenario: Ledger file missing during autofix mode
- **WHEN** `specflow.fix_apply` is invoked with `autofix` argument
- **AND** `review-ledger.json` does not exist
- **THEN** the system SHALL create a new ledger with `current_round: 0`, `status: "all_resolved"`, empty findings
- **AND** the system SHALL display a warning: "⚠ autofix mode: review-ledger.json が見つかりません。新規作成して継続します。"
- **AND** the system SHALL continue processing (not stop)

#### Scenario: Ledger file corrupted during autofix mode
- **WHEN** `specflow.fix_apply` is invoked with `autofix` argument
- **AND** `review-ledger.json` exists but JSON parse fails
- **THEN** the system SHALL rename the corrupt file to `review-ledger.json.corrupt`
- **AND** the system SHALL create a new ledger with `current_round: 0`, `status: "all_resolved"`, empty findings
- **AND** the system SHALL display a warning: "⚠ autofix mode: review-ledger.json が破損していました。新規作成して継続します。"
- **AND** the system SHALL continue processing (not stop)

#### Scenario: Ledger re-initialization applies to design review equally
- **WHEN** `specflow.fix_design` is invoked with `autofix` argument
- **AND** `review-ledger-design.json` does not exist or JSON parse fails
- **THEN** the system SHALL apply the same re-initialization behavior as `specflow.fix_apply`

### Requirement: Loop completion summary SHALL include divergence warning history
The autofix loop completion summary SHALL display the divergence warnings recorded during the loop, showing per-round details.

#### Scenario: Loop completes with divergence warnings
- **WHEN** the autofix loop completes (by success or max rounds)
- **AND** one or more divergence warnings were recorded during the loop
- **THEN** the system SHALL display a summary including each warning's round number, type, and detail
- **AND** the summary SHALL appear after the standard loop completion summary

#### Scenario: Loop completes without divergence warnings
- **WHEN** the autofix loop completes
- **AND** no divergence warnings were recorded
- **THEN** the system SHALL display only the standard loop completion summary without a warnings section
