# Approval Summary: bash-orchestrator-extraction

**Generated**: 2026-04-09T05:27:16Z
**Branch**: bash-orchestrator-extraction
**Status**: ⚠️ 4 unresolved high (impl ledger stale — fixes applied but not re-reviewed)

## What Changed

New files (this branch):
- `bin/specflow-review-apply` — Main orchestrator (752 lines, 3 subcommands)
- `lib/specflow-ledger.sh` — Ledger manipulation library (559 lines, 12 functions)
- `tests/` — bats-core test suite (7 test files, fixtures, mock codex)

Modified files:
- `bin/specflow-run` — Added `get-field` subcommand (+21 lines)
- `global/commands/specflow.review_apply.md` — Thinned to orchestrator wrapper
- `global/commands/specflow.fix_apply.md` — Thinned to orchestrator wrapper

## Files Touched

bin/specflow-review-apply (new)
bin/specflow-run (modified)
lib/specflow-ledger.sh (new)
global/commands/specflow.review_apply.md (modified)
global/commands/specflow.fix_apply.md (modified)
tests/test_helper.bash (new)
tests/mock-codex (new)
tests/ledger_read.bats (new)
tests/ledger_match.bats (new)
tests/ledger_rereview.bats (new)
tests/ledger_score.bats (new)
tests/diff_filter.bats (new)
tests/specflow_run.bats (new)
tests/fixtures/ledger_clean.json (new)
tests/fixtures/ledger_empty.json (new)
tests/fixtures/codex_response.json (new)
tests/fixtures/codex_rereview.json (new)

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 4     |
| Resolved high      | 0     |
| Unresolved high    | 4     |
| New high (later)   | 0     |
| Total rounds       | 1     |

Note: Impl ledger is stale. 4 high findings (F01-F04) were fixed in code but ledger was not re-reviewed before approve.

## Proposal Coverage

| # | Criterion | Covered? | Mapped Files |
|---|-----------|----------|--------------|
| 1 | Auto-fix loop no longer depends on markdown-defined pseudo-looping | Yes | bin/specflow-review-apply (autofix-loop subcommand) |
| 2 | Ledger read/update/write is handled entirely by Bash script | Yes | lib/specflow-ledger.sh (12 functions) |
| 3 | Score calculation and status derivation are testable independently | Yes | lib/specflow-ledger.sh (ledger_compute_score, ledger_compute_status), tests/ledger_score.bats |
| 4 | review_apply and fix_apply slash commands are thin wrappers | Yes | global/commands/specflow.review_apply.md, global/commands/specflow.fix_apply.md |
| 5 | Existing user-facing command interface is unchanged | Yes | Slash commands maintain same entry points and UI patterns |

**Coverage Rate**: 5/5 (100%)

## Remaining Risks

- R1-F01: fix_apply no longer applies fixes before rereview (severity: high) — FIXED in code
- R1-F02: Corrupt-ledger recovery broken by double read (severity: high) — FIXED in code
- R1-F03: Ledger schema mismatch in finding fields (severity: high) — FIXED in code
- R1-F04: Autofix-loop misses parse failure counting (severity: high) — FIXED in code
- R1-F05: Diff-size warning after Codex invocation (severity: medium) — FIXED in code
- R1-F06: Missing orchestrator-level tests (severity: medium) — Partially addressed

Note: All high findings were fixed but ledger was not updated with a re-review round.

- ⚠️ New file not mentioned in review: lib/specflow-ledger.sh
- ⚠️ New file not mentioned in review: tests/test_helper.bash

## Human Checkpoints

- [ ] Verify `specflow-review-apply review <change>` produces valid JSON output end-to-end with a real Codex call
- [ ] Verify `specflow-review-apply fix-review <change>` applies fixes before re-review (F01 fix)
- [ ] Verify corrupt ledger recovery path: corrupt `review-ledger.json` → uses `.bak` → outputs `prompt_user` (F02 fix)
- [ ] Verify ledger finding schema contains `origin_round`, `latest_round`, `supersedes`, `relation`, `notes` for all finding types (F03 fix)
- [ ] Run bats-core tests: `bats tests/` (requires `brew install bats-core`)
