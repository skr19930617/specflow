# Approval Summary: workflow-state-machine

**Generated**: 2026-04-09
**Branch**: workflow-state-machine
**Status**: ✅ No unresolved high

## What Changed

 .gitignore                  |   1 +
 bin/specflow-run            | 247 +++
 global/workflow/state-machine.json | 16 +
 tests/test-specflow-run.sh  | 195 +++
 openspec/changes/workflow-state-machine/ (specs, design, tasks, ledgers)

## Files Touched

- `.gitignore` — added `.specflow/runs/` exclusion
- `bin/specflow-run` — new: transition core CLI (start/advance/status)
- `global/workflow/state-machine.json` — new: static workflow definition
- `tests/test-specflow-run.sh` — new: 28-assertion test suite
- `openspec/changes/workflow-state-machine/` — proposal, specs, design, tasks, ledgers

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 2     |
| Resolved high      | 3     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 3     |

## Proposal Coverage

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Static workflow definition at global/workflow/state-machine.json | Yes | global/workflow/state-machine.json |
| 2 | Top-level phase states (start, proposal, design, apply, approved, rejected) | Yes | global/workflow/state-machine.json |
| 3 | Event definitions (propose, accept_proposal, accept_design, accept_apply, reject, revise) | Yes | global/workflow/state-machine.json |
| 4 | Transition rules (9 transitions, forward/reject/revise) | Yes | global/workflow/state-machine.json |
| 5 | Per-run state file at .specflow/runs/<run_id>/run.json | Yes | bin/specflow-run |
| 6 | Run state schema (run_id, change_name, current_phase, status, allowed_events, timestamps) | Yes | bin/specflow-run |
| 7 | Run state history (append-only with from/to/event/timestamp) | Yes | bin/specflow-run |
| 8 | Atomic write (mktemp + mv) | Yes | bin/specflow-run |
| 9 | Git-ignore .specflow/runs/ | Yes | .gitignore |
| 10 | Issue metadata via --issue-url | Yes | bin/specflow-run |
| 11 | specflow-run start command | Yes | bin/specflow-run |
| 12 | specflow-run advance command with transition validation | Yes | bin/specflow-run |
| 13 | specflow-run status command | Yes | bin/specflow-run |
| 14 | Runtime validation against state-machine.json | Yes | bin/specflow-run |
| 15 | Command output format (JSON stdout, stderr errors) | Yes | bin/specflow-run |

**Coverage Rate**: 15/15 (100%)

## Remaining Risks

- F6: Missing-run scenarios fail as missing change IDs instead of missing run state (severity: medium)
- F4 (design): Issue lookup helper contract mismatch — repo field derived from URL, not from specflow-fetch-issue output (severity: medium, mitigated in implementation)
- F5 (design): Run IDs not validated against change names in design doc (severity: medium, resolved in implementation via validate_run_id)
- F6 (design): Post-transition invariants not fully in task plan (severity: medium, resolved in implementation and tests)

## Human Checkpoints

- [ ] Verify `specflow-run` works correctly when invoked via symlink from `~/bin/` (installed mode)
- [ ] Confirm `state-machine.json` is copied to `~/.config/specflow/global/workflow/` by `specflow-install`
- [ ] Test the reject flow: `specflow-run advance <id> reject` transitions to `rejected` state with no further allowed events
- [ ] Verify `.specflow/runs/` is properly gitignored in downstream projects after `specflow-install`
- [ ] Confirm `jq` is available in the target CI/deployment environment
