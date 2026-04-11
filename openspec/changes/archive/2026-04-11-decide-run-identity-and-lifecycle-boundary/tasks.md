## 1. Type and Schema Updates

- [x] 1.1 Add `previous_run_id: string | null` to RunState in `src/types/contracts.ts`
- [x] 1.2 Expand `status` type to `"active" | "suspended" | "terminal"` in RunState
- [x] 1.3 Add shared run-event typing so `allowed_events` and `RunHistoryEntry.event` cover workflow phase events plus `suspend` / `resume`
- [x] 1.4 Update Zod schema in `src/lib/schemas.ts` to validate new RunState fields, including `run_kind`-specific `change_name` invariants
- [x] 1.5 Ensure `run_id` field is required (not optional) in the schema

## 2. Lifecycle Contract and State Machine Metadata

- [x] 2.1 Bump workflow machine version from 4.0 to 5.0 in `src/lib/workflow-machine.ts`
- [x] 2.2 Export a shared lifecycle contract for `suspend` / `resume` alongside the existing phase machine, including lifecycle event typing, status-transition rules, status-based allowed-event gating, and shared derivation helpers consumed by both the CLI and future runtimes
- [x] 2.3 Update serialized state-machine metadata if it exists so it includes the lifecycle event contract consumed by `allowed_events` and history

## 3. Run ID Generation

- [x] 3.1 Implement `generateRunId(changeId: string): string` for change runs by scanning `.specflow/runs/` for `<changeId>-*` directories and returning `<changeId>-<next_seq>`
- [x] 3.2 Implement `findRunsForChange(changeId: string): RunState[]` that returns all runs for a given change_id
- [x] 3.3 Implement `findLatestRun(changeId: string): RunState | null` that returns the most recent run for a change

## 4. CLI: start Command Refactor

- [x] 4.1 Split `start` into explicit change-run and synthetic-run branches before any change-directory lookup or sequence generation
- [x] 4.2 Refactor change-run `start <change_id>` to require `openspec/changes/<change_id>/proposal.md` for both initial starts and retry starts, auto-generate run_id as `<change_id>-<N>`, and persist `change_name = change_id`
- [x] 4.3 Add "one non-terminal run per change" invariant checks to plain `start` for active and suspended runs
- [x] 4.4 Reject plain `start <change_id>` when prior runs exist and all are terminal unless `--retry` is supplied, so terminal-only history cannot create a new lineage implicitly and retry remains the only path that sets `previous_run_id`
- [x] 4.5 Add `--retry` to change-run `start` with precondition validation (all prior runs terminal, most recent run not rejected)
- [x] 4.6 Implement retry field copy/reset logic (copy source/change_name/agents, reset phase/history/status, set previous_run_id)
- [x] 4.7 Update change-run `start` to set `status = "active"` explicitly on new runs and `previous_run_id = null` on first runs
- [x] 4.8 Preserve synthetic `start <run_id> --run-kind synthetic`: accept the explicit run_id verbatim, reject duplicates, bypass change-directory lookup, proposal lookup, and sequence generation, persist `change_name = null`, initialize `previous_run_id = null`, and reject `--retry`

## 5. Shared Lifecycle Events, suspend, and resume

- [x] 5.1 Add shared helpers that consume the lifecycle contract to derive `allowed_events` from `(status, current_phase)` and record typed lifecycle history entries for `suspend` / `resume` instead of encoding those rules only inside CLI subcommands
- [x] 5.2 Add `suspend <run_id>` subcommand: validate active status, set status to `suspended`, set allowed_events to `["resume"]`, append history
- [x] 5.3 Add `resume <run_id>` subcommand: validate suspended status, set status to `active`, recompute allowed_events from current_phase, append history
- [x] 5.4 Update `advance` to reject phase events when status is `suspended`

## 6. CLI: advance and Terminal Status

- [x] 6.1 Update `advance` to set `status = "terminal"` when transitioning to `approved`, `decomposed`, or `rejected`
- [x] 6.2 Ensure `allowed_events` is empty for terminal runs via the shared lifecycle-event contract

## 7. Backward Compatibility

- [x] 7.1 Add read-time fallback: when loading run.json without `run_id` field, derive from directory name
- [x] 7.2 Add read-time fallback: when loading run.json without `previous_run_id`, default to null
- [x] 7.3 Add read-time fallback: when loading run.json without explicit `status`, infer from current_phase (terminal phases → "terminal", others → "active")

## 8. Integration: specflow-prepare-change

- [x] 8.1 Update `specflow-prepare-change` to use the new `start` interface (pass change_id, receive generated run_id)
- [x] 8.2 Update any callers that assume run_id === change_id

## 9. Tests

- [x] 9.1 Unit tests for change-run `generateRunId` sequence number logic
- [x] 9.2 Unit tests for synthetic starts accepting explicit run_id values without sequence generation, rejecting duplicate IDs, and rejecting `--retry`
- [x] 9.3 Unit tests for "one non-terminal run per change" invariant
- [x] 9.4 Unit tests that plain `start <change_id>` rejects terminal-only history unless `--retry` is supplied
- [x] 9.5 Unit tests for retry precondition validation (terminal check, rejected exclusion)
- [x] 9.6 Unit tests for retry field copy/reset logic
- [x] 9.7 Unit tests that change runs require `proposal.md` for both initial starts and retry starts and persist `change_name = change_id`
- [x] 9.8 Unit tests that synthetic runs persist `change_name = null`, initialize `previous_run_id = null`, bypass change-directory/proposal lookup, and reject `--retry`
- [x] 9.9 Unit tests for shared lifecycle-event metadata, serialized lifecycle contract, allowed-events derivation, typed history entries, and suspend/resume history entries
- [x] 9.10 Unit tests for suspend/resume status transitions
- [x] 9.11 Unit tests for advance rejection when suspended
- [x] 9.12 Integration test for backward-compatible legacy run.json reading
- [x] 9.13 Update existing tests that hardcode run_id = change_id assumptions
