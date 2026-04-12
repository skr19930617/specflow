## ADDED Requirements

### Requirement: WorkspaceContext interface provides VCS-neutral workspace metadata
The system SHALL define a `WorkspaceContext` interface that abstracts workspace metadata access without depending on any specific VCS.

#### Scenario: projectRoot returns the project root path
- **WHEN** `projectRoot()` is called on a valid workspace
- **THEN** it SHALL return the absolute path to the project root

#### Scenario: projectRoot throws on invalid workspace
- **WHEN** `projectRoot()` is called and the workspace is invalid
- **THEN** it SHALL throw an exception with a descriptive error message

#### Scenario: branchName returns current branch or null
- **WHEN** `branchName()` is called on a valid workspace
- **THEN** it SHALL return the current branch name as a string, or `null` if the branch cannot be determined

#### Scenario: projectIdentity returns a stable project identifier
- **WHEN** `projectIdentity()` is called on a valid workspace
- **THEN** it SHALL return a non-empty string that uniquely identifies the project
- **AND** the same workspace SHALL always return the same value

#### Scenario: projectDisplayName returns a human-readable name
- **WHEN** `projectDisplayName()` is called on a valid workspace
- **THEN** it SHALL return a non-empty string suitable for use as the `repo_name` field in run metadata

#### Scenario: worktreePath returns the working tree path
- **WHEN** `worktreePath()` is called on a valid workspace
- **THEN** it SHALL return the absolute path to the current working tree

### Requirement: WorkspaceContext interface provides filtered diff
The system SHALL define a `filteredDiff` method on `WorkspaceContext` that returns working tree changes as unified diff text with a summary.

#### Scenario: filteredDiff returns diff and summary for changed files
- **WHEN** `filteredDiff(excludeGlobs)` is called and the working tree has changes
- **THEN** it SHALL return `{ diff: string, summary: DiffSummary }` where `diff` is unified diff text and `summary` includes `excluded`, `warnings`, `included_count`, `excluded_count`, and `total_lines` fields

#### Scenario: filteredDiff returns empty when no changes exist
- **WHEN** `filteredDiff(excludeGlobs)` is called and the working tree has no changes
- **THEN** it SHALL return `{ diff: "", summary: "empty" }`

#### Scenario: filteredDiff excludes files matching exclude globs
- **WHEN** `filteredDiff(["*/review-ledger.json"])` is called
- **THEN** files matching the glob pattern SHALL be excluded from the diff
- **AND** they SHALL appear in `summary.excluded`

#### Scenario: filteredDiff excludes pure renames
- **WHEN** a file is renamed without content changes (100% match)
- **THEN** it SHALL be excluded from the diff
- **AND** it SHALL appear in `summary.excluded` with reason `rename_only`

### Requirement: LocalWorkspaceContext provides git-backed implementation
The system SHALL provide a `LocalWorkspaceContext` class that implements `WorkspaceContext` using git CLI commands.

#### Scenario: LocalWorkspaceContext resolves metadata from git
- **WHEN** `LocalWorkspaceContext` is constructed in a git repository
- **THEN** `projectRoot()` SHALL return the value of `git rev-parse --show-toplevel`
- **AND** `branchName()` SHALL return the value of `git rev-parse --abbrev-ref HEAD` (returns `"HEAD"` for detached HEAD, preserving existing run metadata parity)
- **AND** `projectIdentity()` SHALL derive the identifier from the remote origin URL
- **AND** `projectDisplayName()` SHALL return a value compatible with the existing `repo_name` format

#### Scenario: LocalWorkspaceContext fails in non-git directory
- **WHEN** `LocalWorkspaceContext` is constructed outside a git repository
- **THEN** it SHALL throw an exception with a clear error message

#### Scenario: LocalWorkspaceContext filteredDiff uses working tree vs index
- **WHEN** `filteredDiff()` is called on `LocalWorkspaceContext`
- **THEN** the baseline for the diff SHALL be the git index (staging area)
- **AND** the diff SHALL represent working tree changes vs the index (equivalent to `git diff`)

### Requirement: WorkspaceContext is injected via dependency injection
Core runtime modules SHALL receive `WorkspaceContext` as a function argument and SHALL NOT import or instantiate concrete implementations.

#### Scenario: Core modules depend only on the interface
- **WHEN** core modules under `src/lib/` use workspace metadata or diff
- **THEN** they SHALL accept `WorkspaceContext` as a parameter
- **AND** they SHALL NOT import `LocalWorkspaceContext` or any concrete implementation

#### Scenario: CLI entry points inject LocalWorkspaceContext
- **WHEN** a CLI command needs workspace context
- **THEN** the CLI entry point SHALL construct `LocalWorkspaceContext` and pass it to core functions
