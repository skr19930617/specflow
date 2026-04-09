## 1. Ledger Library Parameterization

- [x] 1.1 Remove `readonly` from `LEDGER_FILENAME` and `LEDGER_BAK_FILENAME` in `lib/specflow-ledger.sh`, keep them as default values
- [x] 1.2 Add `ledger_init` function that accepts filename (required) and phase (optional) parameters, setting module-level `LEDGER_FILENAME`, `LEDGER_BAK_FILENAME`, and `LEDGER_DEFAULT_PHASE` variables
- [x] 1.3 Update `_empty_ledger` to use `LEDGER_DEFAULT_PHASE` (defaulting to `"impl"` for backward compatibility)
- [x] 1.4 Verify `bin/specflow-review-apply` still works without calling `ledger_init` (backward compatibility)

## 2. Design Artifact Loop Script

- [x] 2.1 Create `bin/specflow-design-artifacts` with `next` and `validate` subcommands and argument parsing
- [x] 2.2 Implement `next` subcommand: poll `openspec status`, find next ready artifact, fetch instructions via `openspec instructions`, output single JSON object (stateless, one-artifact-at-a-time)
- [x] 2.3 Implement completion/blocked detection: output `{"status": "complete"}` or `{"status": "blocked", "blocked": [...]}`
- [x] 2.4 Implement the `validate` subcommand wrapping `openspec validate` with consistent JSON output
- [x] 2.5 Make the script executable and add to `bin/`

## 3. Design Review Orchestrator - Core Pipeline

- [x] 3.1 Create `bin/specflow-review-design` with subcommand dispatch (`review`, `fix-review`, `autofix-loop`) and argument parsing
- [x] 3.2 Implement artifact file reading: read proposal.md, design.md, tasks.md, and spec files, assembling them into the Codex prompt
- [x] 3.3 Implement `build_review_prompt` for initial design review (concatenate `review_design_prompt.md` + artifact contents)
- [x] 3.4 Implement `build_rereview_prompt` for design re-review (concatenate `review_design_rereview_prompt.md` + previous findings + artifact contents)
- [x] 3.5 Implement Codex invocation and response parsing (reuse `call_codex` pattern from apply-side)
- [x] 3.6 Call `ledger_init "review-ledger-design.json" "design"` at script initialization

## 4. Design Review Orchestrator - Ledger Integration

- [x] 4.1 Implement the `review` subcommand pipeline: artifact reading → codex → ledger read/create → validate → increment → match findings → summary → status → score → backup → write
- [x] 4.2 Implement the `fix-review` subcommand pipeline: artifact reading → codex re-review → `ledger_match_rereview` → severity re-evaluation for still_open → `ledger_error: true` handling (clear findings, use new_findings only) → summary → status → score → backup → write
- [x] 4.3 Implement `--reset-ledger` flag for `review` and `fix-review`: create fresh empty ledger before normal pipeline, used after slash command AskUserQuestion approval for corrupt-ledger recovery
- [x] 4.4 Implement `generate_current_phase` for design-specific phases (`design-review`, `design-fix-review`) and next-action derivation (`/specflow.fix_design` or `/specflow.apply`)
- [x] 4.5 Implement handoff state determination (`review_with_findings`, `review_no_findings`, `loop_no_findings`, `loop_with_findings`)
- [x] 4.6 Implement result JSON output matching the apply-side schema, with `rereview_classification` object (resolved/still_open/new_findings IDs) included in fix-review results for slash command display

## 5. Design Review Orchestrator - Auto-fix Loop

- [x] 5.1 Create `fix_design_prompt.md` prompt file and add to `specflow-install` delivery list; implement `build_fix_prompt` with fallback to generic fix instruction if prompt file is missing
- [x] 5.2 Implement autofix-loop ledger auto-reinitialization: create fresh empty ledger on missing/corrupt file with warning to stderr (non-interactive, no prompt_user)
- [x] 5.3 Implement baseline snapshot recording (baseline_score, baseline_new_high_count, baseline high finding titles)
- [x] 5.4 Implement round iteration: each round calls codex CLI to fix artifacts via `build_fix_prompt`, then runs the re-review pipeline (codex re-review → ledger update → score)
- [x] 5.5 Implement stop conditions: success (unresolved_high == 0), max rounds reached, no_progress (2 consecutive no-change rounds)
- [x] 5.6 Implement round failure handling: codex fix failure → skip round; re-review parse failure → skip ledger update; fatal errors → terminate with result "error"
- [x] 5.7 Implement divergence warnings: quality gate degradation, finding re-emergence, new high increase
- [x] 5.8 Implement loop summary output (score progression table, divergence warning history)

## 6. Slash Command Simplification

- [x] 6.1 Update `global/commands/specflow.review_design.md` to call `bin/specflow-review-design review` for initial review, and replace the inline auto-fix loop with a call to `bin/specflow-review-design autofix-loop`; parse result JSON for display and handoff
- [x] 6.2 Update `global/commands/specflow.fix_design.md` to call `bin/specflow-review-design fix-review` for re-review after LLM fixes; parse result JSON
- [x] 6.3 Update `global/commands/specflow.design.md` to: (a) call `bin/specflow-design-artifacts next` in a loop (slash command drives loop, LLM generates content per artifact); handle `{"status": "blocked"}` by reporting blocked artifacts and asking user how to proceed, (b) call `bin/specflow-design-artifacts validate` for structural validation; present validation issues and let user decide (fix/continue/abort, matching current behavior), (c) invoke `bin/specflow-review-design review` or the review wrapper after validation for the design review handoff
- [x] 6.4 Wire corrupt-ledger recovery: when orchestrator returns `ledger_recovery: "prompt_user"`, show AskUserQuestion and re-invoke with `--reset-ledger` on user approval
- [x] 6.5 Verify all AskUserQuestion handoffs and user-facing messages remain unchanged

## 7. Integration Verification

- [x] 7.1 End-to-end test: `/specflow.design` on a new change produces all artifacts and runs design review via orchestrator
- [x] 7.2 End-to-end test: `/specflow.fix_design` modifies artifacts and runs re-review via orchestrator with correct ledger update
- [x] 7.3 End-to-end test: auto-fix loop runs multiple rounds and terminates correctly
- [x] 7.4 Verify apply-side orchestrator (`specflow-review-apply`) backward compatibility with parameterized ledger library
