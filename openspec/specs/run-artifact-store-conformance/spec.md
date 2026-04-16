# run-artifact-store-conformance Specification

## Purpose
TBD - created by archiving change feat-db-backed-runartifactstore-adapter. Update Purpose after archive.
## Requirements
### Requirement: A conformance test suite validates RunArtifactStore implementations

The system SHALL provide an exported conformance test factory function that accepts any `RunArtifactStore` implementation and executes a standard battery of tests against it. The factory SHALL be importable from the published npm package so that external runtimes can validate their own adapters.

#### Scenario: Conformance suite is importable from the npm package

- **WHEN** an external project imports the conformance test factory from the specflow npm package
- **THEN** the import SHALL resolve to a function that accepts a `RunArtifactStore` instance and a test runner context

#### Scenario: Conformance suite covers read-after-write round-trip

- **WHEN** the conformance suite runs against any `RunArtifactStore` implementation
- **THEN** it SHALL verify that `write(ref, content)` followed by `read(ref)` returns the identical content

#### Scenario: Conformance suite covers exists after write

- **WHEN** the conformance suite runs against any `RunArtifactStore` implementation
- **THEN** it SHALL verify that `exists(ref)` returns `true` after a successful `write(ref, content)`

#### Scenario: Conformance suite covers read of non-existent run

- **WHEN** the conformance suite reads a run that has never been written
- **THEN** the store SHALL reject with an `ArtifactStoreError` where `kind` is `not_found`

#### Scenario: Conformance suite covers list filtering by changeId

- **WHEN** the conformance suite writes runs for two different changeIds
- **THEN** `list({ changeId })` SHALL return only the refs belonging to the queried changeId

#### Scenario: Conformance suite covers list without filter

- **WHEN** the conformance suite writes runs for multiple changeIds
- **THEN** `list()` without arguments SHALL return refs for all written runs

#### Scenario: Conformance suite covers overwrite semantics

- **WHEN** the conformance suite writes to the same ref twice with different content
- **THEN** `read(ref)` SHALL return the second content

### Requirement: A conformance test suite validates ChangeArtifactStore implementations

The system SHALL provide an exported conformance test factory function that accepts any `ChangeArtifactStore` implementation and executes a standard battery of tests against it.

#### Scenario: Conformance suite covers ChangeArtifactStore read-after-write

- **WHEN** the conformance suite runs against any `ChangeArtifactStore` implementation
- **THEN** it SHALL verify that `write(ref, content)` followed by `read(ref)` returns the identical content

#### Scenario: Conformance suite covers ChangeArtifactStore exists

- **WHEN** the conformance suite runs against any `ChangeArtifactStore` implementation
- **THEN** it SHALL verify that `exists(ref)` returns `true` after a successful write and `false` before any write

#### Scenario: Conformance suite covers ChangeArtifactStore list

- **WHEN** the conformance suite writes qualified artifacts for a change
- **THEN** `list(query)` SHALL return the correct refs

#### Scenario: Conformance suite covers ChangeArtifactStore not_found error

- **WHEN** the conformance suite reads a non-existent change artifact
- **THEN** the store SHALL reject with an `ArtifactStoreError` where `kind` is `not_found`

### Requirement: The conformance suite does not test concurrency or atomicity

The conformance test suite SHALL test only single-threaded, sequential operation semantics. Concurrent access guarantees and atomicity enforcement are adapter-specific responsibilities and SHALL NOT be tested by the conformance suite.

#### Scenario: No concurrent test cases exist

- **WHEN** the conformance test suite is inspected
- **THEN** no test case SHALL issue concurrent (parallel) read or write operations against the store

### Requirement: The in-memory test store passes the conformance suite

The existing `InMemoryRunArtifactStore` test helper SHALL pass all conformance tests. This serves as the reference validation that the conformance suite is correct.

#### Scenario: In-memory store is conformant

- **WHEN** the conformance suite is executed with the `InMemoryRunArtifactStore`
- **THEN** all tests SHALL pass

