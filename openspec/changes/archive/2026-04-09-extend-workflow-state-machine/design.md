## Context

The specflow workflow core currently consists of three pieces:
- `global/workflow/state-machine.json` — a static workflow definition with 6 states (start, proposal, design, apply, approved, rejected) and 6 events
- `bin/specflow-run` — a bash CLI that reads the state machine, validates transitions, and manages per-run state
- `.specflow/runs/<run_id>/run.json` — per-run state tracking current phase, history, and issue metadata

The current machine covers the mainline flow but omits explore, spec bootstrap, and does not distinguish design vs apply revision loops. The run state lacks project/environment metadata needed for multi-project usage and future UI integrations.

## Goals / Non-Goals

**Goals:**
- Expand state-machine.json to model explore, spec_bootstrap as independent branch paths returning to start
- Replace single `revise` event with `revise_design` and `revise_apply` for explicit fix loop modeling
- Add all new metadata fields to run.json as required fields auto-detected at initialization
- Document UI binding metadata separation convention
- Keep the state machine as a pure data file (no code in JSON)
- Update specflow-run CLI to handle new states, events, and enriched metadata

**Non-Goals:**
- Implementing Slack integration or creating stub delivery files
- Migrating existing run.json files (old runs are disposable)
- Modeling utility commands (dashboard, license, readme, decompose) in the state machine
- Introducing a public API or external integration layer
- Wiring `/specflow.explore` or `/specflow.spec` to emit `specflow-run` events — these are non-change-scoped commands with no natural run_id (see D6)

## Decisions

### D1: Independent branch paths for explore and spec_bootstrap

**Decision**: Model explore and spec_bootstrap as independent loops that fork from and return to `start`, rather than feeding into the mainline.

**Rationale**: These commands operate independently of any specific change — explore creates issues, spec_bootstrap generates baseline specs. They don't produce artifacts that feed into proposal → design → apply. Modeling them as `start → explore → start` preserves the mainline's semantic integrity.

**Alternative considered**: Making explore/spec_bootstrap pre-stages to proposal. Rejected because they don't always lead to a proposal — explore may produce zero issues, and spec_bootstrap is a one-time setup operation.

### D2: Split revise into revise_design and revise_apply (BREAKING)

**Decision**: Remove the generic `revise` event. Add `revise_design` (self-transition on `design`) and `revise_apply` (self-transition on `apply`).

**Rationale**: The current single `revise` event obscures which fix loop is executing. Distinct events enable per-phase history tracking and allow future UIs to show "design revision #3" vs "apply revision #2" clearly.

**Alternative considered**: Keep `revise` and add `revise_design`/`revise_apply` alongside it. Rejected because keeping the old event creates ambiguity — callers must choose between generic and specific, and the generic one provides no value.

**Migration**: Update all callers of the `revise` event:
1. `tests/test-specflow-run.sh` — replace `revise` references with `revise_design`/`revise_apply`
2. `global/commands/specflow.review_design.md` — update any `specflow-run advance ... revise` calls to use `revise_design`
3. `global/commands/specflow.review_apply.md` (and `specflow.fix_apply.md`) — update to use `revise_apply`
4. `global/commands/specflow.fix_design.md` — update to use `revise_design`

### D3: All new run metadata fields required

**Decision**: All new fields (`project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`) are required and auto-detected at `specflow-run start`.

**Rationale**: User chose all-required to ensure consistent, complete metadata from the start. Auto-detection at init time means callers don't need to supply them manually.

**Auto-detection strategy** (source of truth: `project_id` is authoritative, parsed first):
- `project_id`: parsed from `git remote get-url origin` → extract `owner/repo` (strip .git suffix, host prefix)
- `repo_name`: set equal to `project_id` in this scope (same `owner/repo` format). Note: these fields are intentionally equal for single-repo usage. `project_id` is reserved for future multi-project scenarios where a project may span multiple repos or a monorepo may host multiple projects — at that point `project_id` would diverge from `repo_name`. Both fields are included now to establish the schema contract without requiring a migration later.
- `repo_path`: `git rev-parse --show-toplevel`
- `branch_name`: `git rev-parse --abbrev-ref HEAD`
- `worktree_path`: `git rev-parse --show-toplevel` (same as repo_path for non-worktree usage)
- `agents.main`: defaults to `"claude"`, overridable via `--agent-main`
- `agents.review`: defaults to `"codex"`, overridable via `--agent-review`
- `last_summary_path`: defaults to `null` at init, updated by commands that produce summaries

**Exception**: `last_summary_path` starts as `null` and is updated post-init. This is acceptable because it's a pointer that only becomes meaningful after a summary is generated.

**`last_summary_path` lifecycle**: The following change-scoped command produces a summary artifact and SHALL update `last_summary_path` in `run.json` after writing the summary file:
- `specflow.approve` — writes `approval-summary.md` to the change directory

Note: `specflow.dashboard` is excluded because its output is repository-wide (not tied to a single run), so it cannot update a per-run `last_summary_path`.

The update mechanism is a new `specflow-run update-field <run_id> last_summary_path <path>` subcommand that atomically updates a single field in `run.json`. This keeps the write path simple and avoids callers needing to read-modify-write the full JSON. In this scope, we add the subcommand AND wire the call into `specflow.approve`.

### D4: UI binding metadata convention (docs only)

**Decision**: Document that delivery-specific metadata lives at `.specflow/runs/<run_id>/<ui>.json` (e.g., `slack.json`). No code or stub files in this scope.

**Rationale**: The convention establishes the separation principle early. Creating stubs would add dead code with no consumers.

### D6: Branch-path run lifecycle (state machine only, no run state)

**Decision**: The `explore` and `spec_bootstrap` states are modeled in `state-machine.json` for conceptual completeness and documentation, but they do NOT participate in persisted run state (`specflow-run start/advance`) in this scope.

**Rationale**: `specflow-run` is change-scoped — `run_id` equals the OpenSpec change name, and `run.json` lives under `.specflow/runs/<change_name>/`. The `/specflow.explore` and `/specflow.spec` commands are not tied to any change: explore creates issues, spec_bootstrap generates baseline specs. There is no natural `run_id` for these flows.

**What this means**:
- The state machine documents the full conceptual flow including branch paths
- `specflow-run advance ... explore_start` is a valid transition if a run happens to be in `start` state, but no existing command calls it
- Wiring explore/spec_bootstrap to emit `explore_start`/`explore_complete`/`spec_bootstrap_start`/`spec_bootstrap_complete` via `specflow-run` is a future enhancement that requires deciding on a run-id strategy for non-change flows (e.g., synthetic IDs like `_explore_<timestamp>`)

**Alternative considered**: Creating synthetic run IDs for non-change flows. Deferred because it adds complexity with no current consumer — the branch states serve as documentation of the flow.

### D5: Version bump in state-machine.json

**Decision**: Bump version from `"1.0"` to `"2.0"` since this is a breaking change (revise event removal).

**Rationale**: The version field exists for exactly this purpose. Consumers can check the version to handle schema differences.

## Risks / Trade-offs

**[BREAKING: revise event removal]** → Mitigated by limited callers (specflow-run tests and internal slash commands). All callers are updated in this change.

**[Auto-detection may fail in CI/non-standard environments]** → Mitigated by clear error messages when git commands fail. specflow-run already requires a git repo context.

**[All-required fields increase init complexity]** → Accepted trade-off for data consistency. Auto-detection handles most fields; only `agents` has defaults.

**[Branch paths add states but no run uses them yet]** → Acceptable — this models the existing command surface. explore and spec_bootstrap commands exist today but weren't tracked in the state machine.

**[Pre-2.0 run.json files lack required fields]** → `specflow-run advance`, `status`, and `update-field` SHALL validate that required metadata fields exist when reading `run.json`. If any required field is missing, the command exits with code 1 and a clear error message directing the user to re-create the run. This enforces the "all fields required" contract at runtime without needing migration.
