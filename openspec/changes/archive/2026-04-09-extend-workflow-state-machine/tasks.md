## 1. Expand State Machine Definition

- [x] 1.1 Update `global/workflow/state-machine.json`: bump version to `"2.0"`, add `explore` and `spec_bootstrap` to `states` array
- [x] 1.2 Replace `revise` event with `revise_design` and `revise_apply` in `events` array
- [x] 1.3 Add `explore_start`, `explore_complete`, `spec_bootstrap_start`, `spec_bootstrap_complete` to `events` array
- [x] 1.4 Update `transitions`: remove `revise` self-transitions, add `revise_design` on design and `revise_apply` on apply
- [x] 1.5 Add transitions for explore branch path (`start` → `explore` → `start`) and spec_bootstrap branch path (`start` → `spec_bootstrap` → `start`)

## 2. Enrich Run Metadata in specflow-run

- [x] 2.1 Add auto-detection functions in `bin/specflow-run`: `detect_project_id` (from git remote), `detect_repo_path`, `detect_branch_name`, `detect_worktree_path`
- [x] 2.2 Add `--agent-main` and `--agent-review` flags to `cmd_start` with defaults `"claude"` / `"codex"`
- [x] 2.3 Update `cmd_start` to include all new required fields (`project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`) in the initial run state JSON
- [x] 2.4 Update `cmd_advance` to preserve all metadata fields across transitions
- [x] 2.5 Add `specflow-run update-field <run_id> <field> <value>` subcommand for atomic single-field updates (used by `last_summary_path` lifecycle)
- [x] 2.9 Add `validate_run_schema` helper in `bin/specflow-run` that checks for required metadata fields (`project_id`, `repo_name`, `repo_path`, `branch_name`, `worktree_path`, `agents`, `last_summary_path`) when reading `run.json`; call it from `cmd_advance`, `cmd_status`, and `cmd_update_field`; exit 1 with clear error if any field is missing
- [x] 2.6 Wire `specflow-run update-field` into `specflow.approve` template: call after writing `approval-summary.md`
- [x] 2.7 Update `global/commands/specflow.review_design.md` and `specflow.fix_design.md`: replace `revise` event with `revise_design` in any `specflow-run advance` calls
- [x] 2.8 Update `global/commands/specflow.review_apply.md` and `specflow.fix_apply.md`: replace `revise` event with `revise_apply` in any `specflow-run advance` calls

## 3. Update Tests

- [x] 3.1 Update `tests/test-specflow-run.sh`: replace `revise` event references with `revise_design` / `revise_apply`
- [x] 3.2 Add test cases for explore branch path transitions (start → explore → start)
- [x] 3.3 Add test cases for spec_bootstrap branch path transitions (start → spec_bootstrap → start)
- [x] 3.4 Add test cases verifying enriched metadata fields are present in initial run state
- [x] 3.5 Add test cases verifying metadata is preserved across transitions
- [x] 3.6 Add test cases for `--agent-main` / `--agent-review` flag handling
- [x] 3.7 Add test case verifying `revise_design` self-transition records correct history entry (`from: "design"`, `to: "design"`, `event: "revise_design"`)
- [x] 3.8 Add test case verifying `revise_apply` self-transition records correct history entry
- [x] 3.9 Add test case verifying branch-path transitions recompute `allowed_events` correctly (e.g., `explore` state only allows `explore_complete`)
- [x] 3.10 Add test case verifying removed `revise` event returns error with allowed events list
- [x] 3.11 Add test case verifying `project_id` equals parsed `owner/repo` from git remote and `repo_name` equals `project_id`
- [x] 3.12 Add test case for `specflow-run update-field` subcommand (update `last_summary_path`)
- [x] 3.13 Add test case verifying `specflow-run advance` fails with error on pre-2.0 `run.json` missing required metadata fields

## 4. Documentation

- [x] 4.1 Document UI binding metadata convention (`.specflow/runs/<run_id>/<ui>.json` naming) in README and architecture docs
- [x] 4.2 Update README to mention workflow core components (state-machine.json, specflow-run, run.json) and link to architecture docs
- [x] 4.3 Document expanded states (`explore`, `spec_bootstrap`) and new events in README workflow section; note that branch paths are state-machine-only (no run state persistence yet, per D6)
- [x] 4.4 Document the `revise` → `revise_design`/`revise_apply` breaking change and version bump to 2.0 in README and architecture docs
- [x] 4.5 Document the enriched `run.json` metadata schema (all required fields, auto-detection strategy) in architecture docs
- [x] 4.6 Document no-migration policy for existing runs (old runs disposable, gitignored) in architecture docs
