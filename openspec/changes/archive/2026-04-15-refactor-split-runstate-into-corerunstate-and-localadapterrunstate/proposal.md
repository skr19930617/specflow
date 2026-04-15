## Why

`RunState` in `src/types/contracts.ts` currently mixes core-contract fields
(`run_id`, `change_name`, `current_phase`, `status`, `allowed_events`,
`agents`, `history`, `source`, `created_at`, `updated_at`,
`previous_run_id`, `run_kind`) with local-adapter-specific fields
(`project_id`, `repo_name`, `repo_path`, `branch_name`,
`worktree_path`, `last_summary_path`). `docs/architecture.md` explicitly
records this as a known issue ("field-level split deferred") and notes
that external runtimes cannot reliably determine which fields they must
persist.

To unblock DB-backed persistence and a Server-side orchestrator (Epic
#127), we need a type-level boundary that distinguishes the run-state
fields every runtime must persist from the fields that only the local
filesystem adapter owns.

## What Changes

- Introduce `CoreRunState` containing only the fields that every runtime
  persists: `run_id`, `change_name`, `current_phase`, `status`,
  `allowed_events`, `agents`, `history`, `source`, `created_at`,
  `updated_at`, `previous_run_id`, and `run_kind`. All of these are
  preexisting fields on `RunState`; no field is added or removed.
- Introduce `LocalRunState` containing the local-adapter-only fields:
  `project_id`, `repo_name`, `repo_path`, `branch_name`,
  `worktree_path`, and `last_summary_path`. `project_id` stays local
  because it is currently derived from the local git remote via
  `WorkspaceContext`; external runtimes will supply their own
  equivalents.
- Redefine `RunState` as `CoreRunState & LocalRunState` so existing
  imports and consumers keep compiling unchanged.
- Narrow **every** `src/core/**` function signature that currently
  consumes `RunState` but does not read any local-adapter field to
  `CoreRunState`. Any signature that still reads a local-adapter
  field stays on `RunState` and is explicitly called out in tasks.md.
  Call sites in `src/bin/` (CLI wiring) and the local FS adapters
  continue to pass the combined `RunState`.
- Add a **compile-time drift guard** under `src/tests/` that asserts
  `keyof CoreRunState` and `keyof LocalRunState` are disjoint and
  together equal `keyof RunState`. This catches drift where a new
  field lands in the wrong partition.
- Audit every serialization/validation/persistence helper that
  currently operates on `RunState` (schema validator,
  `RunArtifactStore`, JSON writers/readers). Record the survey in
  design.md. Keep these helpers typed on `RunState`, because they
  still serialize the full local-adapter payload today; narrowing them
  would require a JSON-schema split and is out of scope.
- Remove the "field-level split deferred" wording from
  `docs/architecture.md` (the inventory row, the core-adjacent module
  caveat, and the Persistence concerns section) and replace it with a
  reference to the new split.
- No behavior change, no runtime change, no on-disk format change. The
  persisted JSON for local runs still contains every field it contains
  today. Splitting the JSON schema for external-runtime consumers is a
  separate follow-up change under Epic #127 and is explicitly out of
  scope here.

## Capabilities

### New Capabilities

- None. This change introduces type-level structure without adding a new
  capability.

### Modified Capabilities

- `workflow-run-state`: Clarify that the run-state shape persisted by
  every runtime is `CoreRunState` (run_id, change_name, current_phase,
  status, allowed_events, agents, history, source, created_at,
  updated_at, previous_run_id, run_kind), while `LocalRunState` fields
  (`project_id`, `repo_name`, `repo_path`, `branch_name`,
  `worktree_path`, `last_summary_path`) are owned by the local
  filesystem adapter only. Existing scenarios that assert on
  local-adapter fields remain local-adapter scenarios; core scenarios
  assert only on `CoreRunState` fields. A new requirement records the
  compile-time drift guard.

## Impact

- **Types**: `src/types/contracts.ts` — split `RunState` into
  `CoreRunState` + `LocalRunState` with intersection alias preserved.
- **Core runtime**: `src/core/**` modules whose signatures currently
  take `RunState` but do not touch local-adapter fields are narrowed
  to `CoreRunState`. Modules that read/write local-adapter fields
  continue to use `RunState` explicitly. Exhaustive narrowing across
  `src/core/**` is the agreed scope.
- **Local adapter**: `src/adapters/**` continues to produce and
  consume the full `RunState` (intersection), so no behavioral
  change.
- **Tests**: Existing `src/tests/**` continue to pass unchanged because
  `RunState` remains the intersection type. New type-level drift-guard
  test added under `src/tests/` that fails compilation if
  `keyof CoreRunState` and `keyof LocalRunState` are not disjoint or
  do not together equal `keyof RunState`.
- **Serialization/validation helpers**: Surveyed during design; stay
  typed on `RunState`. No helper narrowing in this change.
- **Docs**: `docs/architecture.md` updated — remove "field-level split
  deferred" comments from the inventory row, the core-adjacent module
  section, and the Persistence concerns section.
- **Schema**: `run-state` JSON schema is unchanged (no added/removed
  fields; no annotations). A machine-readable core/local boundary for
  external runtimes is deferred to a follow-up change.
- **External runtimes**: Future DB-backed or server orchestrators can
  now rely on `CoreRunState` as the type-level contract while the
  JSON-schema-level contract lands in a follow-up.
