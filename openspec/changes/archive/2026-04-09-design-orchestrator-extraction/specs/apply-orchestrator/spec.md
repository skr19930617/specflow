## MODIFIED Requirements

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

## ADDED Requirements

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
