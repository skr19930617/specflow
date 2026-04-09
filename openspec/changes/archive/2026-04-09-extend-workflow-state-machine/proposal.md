## Why

The workflow state machine (`global/workflow/state-machine.json`) currently models only the mainline flow (start → proposal → design → apply → approved/rejected) with a single `revise` self-transition for fix loops. It does not cover important existing paths such as `/specflow.explore`, `/specflow.spec`, or the distinct design/apply revision loops. The per-run state (`run.json`) also lacks metadata needed for multi-project usage, resumable execution, and future non-Claude UI integrations (e.g., Slack). As the product surface grows, the machine must become the authoritative source of truth for the flow — otherwise commands, docs, and workflow state will drift apart.

## What Changes

- **Expand states**: Add `explore` and `spec_bootstrap` as independent branch paths parallel to the mainline (start → explore → start, start → spec_bootstrap → start). These do not feed into the mainline but return to `start` upon completion.
- **Split revision events** (**BREAKING**): Remove the single `revise` event and replace with `revise_design` (self-transition on `design`) and `revise_apply` (self-transition on `apply`). This makes each fix loop explicit in the machine definition.
- **Add branch-path events**: Add `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete` events for the independent branch paths
- **Enrich run metadata (all fields required)**: Extend `run.json` schema with required fields: `project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents` (`{ main, review }`), and `last_summary_path`. All fields are required and auto-detected at run initialization.
- **Separate UI binding metadata (convention only)**: Document the convention that delivery-specific metadata (e.g., Slack routing) lives in `.specflow/runs/<run_id>/<ui>.json` (e.g., `slack.json`), separate from `run.json`. No stub files are created in this scope — only the naming convention is documented.
- **No migration for existing runs**: Existing `.specflow/runs/` data is gitignored and local-only. Old runs are considered disposable; new runs use the new schema exclusively.
- **Update specflow-run CLI**: Extend `specflow-run` to handle the new states, events, and enriched metadata
- **Update docs**: Align README and architecture docs with the expanded workflow core

## Capabilities

### New Capabilities
- `extended-workflow-states`: Expanded state machine covering explore, spec bootstrap, and distinct revision loops for design and apply phases
- `enriched-run-metadata`: Per-run state enriched with project, branch, agent, and artifact pointer fields for multi-project and resumable execution
- `ui-binding-separation`: Convention for separating delivery/UI metadata from workflow state to keep the core portable

### Modified Capabilities
- `workflow-definition`: States and events expanded to cover explore, spec bootstrap, and split revision events
- `run-state-management`: Run state schema extended with project/branch/agent metadata fields
- `transition-core`: specflow-run CLI updated to handle new states, events, and enriched metadata initialization

## Impact

- `global/workflow/state-machine.json` — expanded states, events, transitions
- `bin/specflow-run` — updated to support new states/events, enriched run init
- `.specflow/runs/<run_id>/run.json` — schema extended with new metadata fields
- Existing runs are not migrated — old run.json files are disposable (gitignored, local-only)
- README and architecture docs updated to reflect the workflow core
