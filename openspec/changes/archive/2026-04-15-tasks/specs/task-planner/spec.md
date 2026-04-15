## ADDED Requirements

### Requirement: `specflow-advance-bundle` is the sole mutation entry point for apply-class workflows

In apply-class slash-command workflows (currently `/specflow.apply`, and any fix-loop code path that resumes apply-class implementation work), when `task-graph.json` exists for the change and passes `validateTaskGraph`, all bundle and child-task status transitions SHALL be performed via the `specflow-advance-bundle` CLI. `specflow-advance-bundle` SHALL be the only supported mutation entry point for `task-graph.json` and for `tasks.md` in these workflows.

Direct writes to `openspec/changes/<CHANGE_ID>/task-graph.json` or `openspec/changes/<CHANGE_ID>/tasks.md` from apply-class workflows — whether via inline `node -e` scripts, `jq`, shell here-docs, the Edit/Write tools, or any other mechanism that bypasses `specflow-advance-bundle` — SHALL be considered a contract violation against this specification.

This requirement codifies the rule. Automated detection of violations during apply review (diff scanning, reviewer-prompt changes, or orchestrator-level enforcement) is NOT required by this requirement; it is tracked as a separate follow-up change.

This requirement does not alter the `updateBundleStatus` in-memory API defined in the existing "Apply phase writes back bundle status to task graph" requirement; `specflow-advance-bundle` is the user-facing CLI wrapper that calls `updateBundleStatus` and persists the result atomically.

#### Scenario: CLI is named as the sole entry point when task-graph is present and valid

- **WHEN** a change has `openspec/changes/<CHANGE_ID>/task-graph.json` that passes `validateTaskGraph`
- **AND** an apply-class workflow needs to transition a bundle's status
- **THEN** `specflow-advance-bundle` SHALL be the only sanctioned tool for performing the transition
- **AND** any other mechanism that writes to `task-graph.json` or `tasks.md` from that workflow SHALL be a contract violation

#### Scenario: Legacy fallback is unaffected when task-graph.json is absent

- **WHEN** a change has no `openspec/changes/<CHANGE_ID>/task-graph.json`
- **THEN** this requirement SHALL NOT apply
- **AND** the existing legacy fallback (editing `tasks.md` directly) defined in the "Legacy fallback supports changes without task graph" requirement SHALL remain the supported path

#### Scenario: Malformed task-graph.json does not permit silent fallback

- **WHEN** a change has `openspec/changes/<CHANGE_ID>/task-graph.json` that fails `validateTaskGraph`
- **THEN** an apply-class workflow SHALL NOT fall back to the legacy `tasks.md`-only path
- **AND** the workflow SHALL surface the validation error and halt in the apply draft state

#### Scenario: Violation detection is explicitly out of this requirement's scope

- **WHEN** this requirement is read
- **THEN** it SHALL state that automated detection of contract violations (via apply-review diff scanning, reviewer prompt changes, or orchestrator enforcement) is NOT required here and is tracked separately
