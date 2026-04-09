## 1. Script Scaffold and CLI Parsing

- [x] 1.1 Create `bin/specflow-review-apply` with shebang, `set -euo pipefail`, and subcommand dispatch (review / fix-review / autofix-loop)
- [x] 1.2 Implement argument parsing per subcommand: `review <CHANGE_ID>`, `fix-review <CHANGE_ID> [--autofix]`, `autofix-loop <CHANGE_ID> [--max-rounds N]`
- [x] 1.3 Add shared helper functions: `die()`, `now_iso()`, `atomic_write()`, project root detection, config reading (`openspec/config.yaml` → `diff_warn_threshold`, `max_autofix_rounds`)
- [x] 1.4 Add `cmd_get_field` subcommand to `bin/specflow-run` for reading individual run state fields

## 2. Diff Filtering Pipeline

- [x] 2.1 Implement `run_diff_filter()`: invoke `specflow-filter-diff`, capture stdout (diff) and stderr (summary JSON) to temp files
- [x] 2.2 Implement empty diff detection (exit with `status: "error"`, `error: "no_changes"`)
- [x] 2.3 Implement line count threshold warning (`diff_warning: true` in result JSON when exceeding threshold)

## 3. Codex CLI Invocation

- [x] 3.1 Implement `build_review_prompt()`: read prompt template from `~/.config/specflow/global/prompts/`, construct full prompt with diff and proposal content, write to temp file
- [x] 3.2 Implement `build_rereview_prompt()`: read re-review prompt template, inject previous findings and max_finding_id, write to temp file
- [x] 3.3 Implement `call_codex()`: invoke `codex --approval-mode full-auto -q`, capture output, attempt JSON parse
- [x] 3.4 Implement parse-failure handling for review/fix-review: set `review.parse_error: true`, populate `review.raw_response`, skip ledger update
- [x] 3.5 Implement parse-failure handling for autofix-loop: track `consecutive_failures` counter, skip round on failure, abort loop at 3 consecutive failures
- [x] 3.6 Implement Codex non-zero exit code handling: set `status: "error"`, `error: "codex_exit_<code>"`

## 4. Ledger Lifecycle Functions

- [x] 4.1 Implement `ledger_read()`: read `review-ledger.json` with corruption recovery (corrupt → rename to `.corrupt` → try `.bak` → signal `prompt_user` if both fail)
- [x] 4.2 Implement `ledger_validate()`: check high-severity override findings for empty notes, auto-revert to `open`
- [x] 4.3 Implement `ledger_increment_round()`: increment `current_round`, initialize seq counter
- [x] 4.4 Implement `ledger_backup_and_write()`: backup on clean read, atomic write via temp file + rename

## 5. Finding Matching (Initial Review)

- [x] 5.1 Implement `ledger_match_findings()` step 1: same match (file + category + severity exact match)
- [x] 5.2 Implement `ledger_match_findings()` step 2: reframed match (file + category match, severity differs)
- [x] 5.3 Implement `ledger_match_findings()` step 3: remaining (new findings + resolve unmatched active)
- [x] 5.4 Handle zero-findings edge case: resolve all active, preserve overrides

## 6. Finding Classification (Re-review Mode)

- [x] 6.1 Implement `ledger_match_rereview()`: apply resolved/still_open/new classification from Codex
- [x] 6.2 Implement exhaustive classification check: auto-classify missing prior IDs as still_open
- [x] 6.3 Implement duplicate classification check: keep still_open on conflict
- [x] 6.4 Implement unknown ID exclusion: log warning, exclude from ledger

## 7. Score Aggregation and Status

- [x] 7.1 Implement `ledger_compute_score()`: severity-weighted score (high=3, medium=2, low=1)
- [x] 7.2 Implement `ledger_compute_summary()`: round summary snapshot (total, open, new, resolved, overridden, by_severity)
- [x] 7.3 Implement `ledger_compute_status()`: top-level status derivation (has_open_high / all_resolved / in_progress)
- [x] 7.4 Implement `max_finding_id` persistence: compute and write on every ledger update

## 8. Auto-fix Loop

- [x] 8.1 Implement baseline snapshot: record baseline_score, baseline_new_high_count, baseline high titles
- [x] 8.2 Implement loop body: invoke fix prompt via codex CLI → invoke fix-review → read updated ledger → compute scores
- [x] 8.3 Implement success stop condition: unresolved_high_count == 0
- [x] 8.4 Implement max rounds stop condition: autofix_round >= MAX_ROUNDS
- [x] 8.5 Implement divergence warnings: quality_gate_degradation, finding_re_emergence, new_high_increase
- [x] 8.6 Implement loop completion summary: total rounds, result, round scores table, divergence warnings history

## 9. Handoff and Result JSON

- [x] 9.1 Implement handoff state determination: review_with_findings / review_no_findings / loop_no_findings / loop_with_findings
- [x] 9.2 Implement severity summary for handoff: actionable count, severity breakdown string
- [x] 9.3 Implement `generate_current_phase()`: write current-phase.md after ledger update
- [x] 9.4 Implement unified result JSON assembly: merge review, ledger, autofix, handoff into final stdout output

## 10. Slash Command Thinning

- [x] 10.1 Rewrite `global/commands/specflow.review_apply.md`: replace all control flow with `specflow-review-apply review` call + result JSON UI display
- [x] 10.2 Rewrite `global/commands/specflow.fix_apply.md`: replace all control flow with `specflow-review-apply fix-review` call + result JSON UI display
- [x] 10.3 Preserve all existing UI display patterns: Dual-Display Fallback, AskUserQuestion handoffs, severity tables, ledger summaries
- [x] 10.4 Preserve autofix loop entry: slash command calls `specflow-review-apply autofix-loop` and displays results

## 11. Testing (bats-core)

- [x] 11.1 Set up bats-core test infrastructure in `tests/`: test helper, fixtures directory, mock codex CLI
- [x] 11.2 Write tests for ledger_read: clean read, corrupt recovery, backup recovery, new creation
- [x] 11.3 Write tests for ledger_match_findings: same match, reframed match, remaining, zero findings, override preservation
- [x] 11.4 Write tests for ledger_match_rereview: exhaustive check, duplicate check, unknown ID exclusion
- [x] 11.5 Write tests for ledger_compute_score and ledger_compute_status: all status paths
- [x] 11.6 Write tests for auto-fix loop: success stop, max rounds stop, divergence warnings, consecutive parse failures
- [x] 11.7 Write tests for diff filtering: empty diff, threshold warning
- [x] 11.8 Write tests for specflow-run get-field: existing field, non-existent field, missing run
- [x] 11.9 Write tests for Codex parse-failure paths: empty stdout, invalid JSON, non-zero exit code, consecutive failures in loop
