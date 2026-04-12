## MODIFIED Requirements

### Requirement: `specflow-run start` initializes persisted run state
`specflow-run start` SHALL create run state via the `RunArtifactStore` interface and
SHALL populate current workflow metadata including the auto-generated run_id in
`<change_id>-<sequence>` format.

Repository metadata SHALL be obtained via the injected `WorkspaceContext` interface
rather than being passed as direct parameters or resolved internally.

#### Scenario: Started runs capture repository metadata via WorkspaceContext
- **WHEN** a run is started inside a valid workspace
- **THEN** `run-state` SHALL include `run_id`, `change_name`, `project_id`,
  `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`,
  `allowed_events`, `created_at`, and `updated_at`
- **AND** `repo_name` SHALL be obtained from `WorkspaceContext.projectDisplayName()`
- **AND** `repo_path` SHALL be obtained from `WorkspaceContext.projectRoot()`
- **AND** `branch_name` SHALL be obtained from `WorkspaceContext.branchName()`
- **AND** `worktree_path` SHALL be obtained from `WorkspaceContext.worktreePath()`

#### Scenario: Run start receives WorkspaceContext via dependency injection
- **WHEN** `specflow-run start` is invoked from a CLI entry point
- **THEN** the CLI entry point SHALL construct a `WorkspaceContext` implementation and pass it to the run start function
- **AND** the run start function SHALL NOT resolve workspace metadata independently
