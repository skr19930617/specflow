## MODIFIED Requirements

### Requirement: Workflow Core Contract Surface inventory annotated with support status
The existing "Workflow Core Contract Surface" section SHALL be amended to distinguish between target-state ownership and currently supported external-runtime contracts by annotating each contract surface with its support status.

#### Scenario: Contract surfaces have support status annotations
- **WHEN** a contributor reads the "Workflow Core Contract Surface" section
- **THEN** state machine is annotated as supported for external runtimes
- **THEN** persistence (run-state JSON) is annotated as not yet supported for external runtimes
- **THEN** review transport is annotated as not yet supported for external runtimes

### Requirement: Repository Scope distinguishes target state from current support
The existing "Repository Scope" section SHALL clarify that the statement about all runtimes implementing review orchestration describes the target state, not the current supported scope for external runtimes.

#### Scenario: Target vs current distinction is explicit
- **WHEN** a contributor reads the Repository Scope section alongside the Core Dependency Boundary section
- **THEN** it is clear that review orchestration is a target-state responsibility, not currently supported for external runtimes
