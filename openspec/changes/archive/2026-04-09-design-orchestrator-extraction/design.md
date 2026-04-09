## Context

The apply-side orchestrator extraction (PR #77) established the pattern: deterministic control flow lives in `bin/specflow-review-apply` (Bash), with the shared ledger library in `lib/specflow-ledger.sh`. The design-side (`specflow.design`, `specflow.review_design`, `specflow.fix_design`) still embeds equivalent logic in LLM-interpreted markdown — artifact dependency loops, ledger CRUD, finding matching, re-review classification, score aggregation, and autofix loops.

Current state:
- `lib/specflow-ledger.sh` hardcodes `LEDGER_FILENAME="review-ledger.json"` as `readonly`, preventing reuse for the design-side's `review-ledger-design.json`
- Design review passes artifact file contents (design.md, tasks.md, spec.md) directly to Codex — no diff filtering needed (unlike apply-side which uses `specflow-filter-diff`)
- The artifact dependency loop in `specflow.design` mixes deterministic loop control (status → ready → instructions) with LLM content generation

## Goals / Non-Goals

**Goals:**
- Extract design-side review/fix/autofix lifecycle into `bin/specflow-review-design` with the same subcommand interface as the apply-side orchestrator (`review`, `fix-review`, `autofix-loop`)
- Extract the artifact dependency loop into `bin/specflow-design-artifacts` (loop control + metadata output only)
- Parameterize `lib/specflow-ledger.sh` via a `ledger_init` function so both orchestrators share the same library
- Produce the same result JSON schema as the apply-side for unified slash command parsing
- Reduce slash commands to thin UI wrappers (AskUserQuestion, content generation)

**Non-Goals:**
- Moving artifact content generation (design.md, tasks.md, spec.md writing) into Bash — this remains LLM's responsibility
- Changing user-facing command interfaces or adding new slash commands
- Introducing diff filtering for design reviews
- Modifying the apply-side orchestrator's behavior (only the shared library changes)

## Decisions

### Decision 1: Ledger library parameterization via `ledger_init`

**Choice:** Add a `ledger_init` function that sets module-level variables `LEDGER_FILENAME` and `LEDGER_BAK_FILENAME`. Remove `readonly` from these constants and set them as defaults that `ledger_init` can override.

**Rationale:** Function-based initialization is self-documenting (the caller's intent is clear in the source), backward-compatible (apply-side needs no changes if it doesn't call `ledger_init`), and avoids environment variable pollution.

**Alternatives considered:**
- Environment variable (`SPECFLOW_LEDGER_FILENAME`): Less discoverable, potential name collision
- Per-function argument: Too invasive — every `ledger_*` function would need an extra parameter, breaking existing callers

### Decision 2: Design orchestrator mirrors apply-side architecture

**Choice:** `bin/specflow-review-design` follows the same structure as `bin/specflow-review-apply`: same subcommands, same pipeline stages, same result JSON schema. Key differences are design-specific:
- No diff filtering step — reads artifact files directly
- Prompt templates: `review_design_prompt.md` / `review_design_rereview_prompt.md`
- Phase field: `"design"` instead of `"impl"`
- current-phase.md uses design-specific phase names (`design-review`, `design-fix-review`)
- Next-state derivation: `fix → fix_design`, `advance → apply`, `stop → rejected`

**Rationale:** Structural consistency reduces cognitive overhead and enables future unification. Differences are isolated to configuration-level constants.

### Decision 3: Artifact dependency loop — one-artifact-at-a-time invocations

**Choice:** `bin/specflow-design-artifacts` uses a **one-artifact-at-a-time** invocation model instead of a streaming JSONL model. The slash command drives the loop:
1. Slash command calls `specflow-design-artifacts next <CHANGE_ID>` → script runs `openspec status`, finds the next ready artifact, fetches its instructions, and outputs a single JSON object to stdout. If all artifacts are complete, outputs `{"status": "complete"}`.
2. Slash command uses the LLM to generate content for that artifact and writes it to `outputPath`.
3. Slash command calls `specflow-design-artifacts next <CHANGE_ID>` again → script re-polls status, finds next ready artifact, etc.
4. Loop until `{"status": "complete"}` or `{"status": "blocked"}`.

**Subcommands:**
- `next <CHANGE_ID>` — returns the next ready artifact's metadata or completion/blocked status
- `validate <CHANGE_ID>` — structural validation wrapper

**Rationale:** The one-at-a-time model avoids the synchronous continuation problem: the Bash script doesn't need to wait for mid-stream LLM output. Each invocation is stateless — it reads `openspec status` fresh. The slash command owns the loop control and can interleave LLM content generation between invocations.

### Decision 4: Design review prompt construction in Bash

**Choice:** The orchestrator reads artifact files (proposal.md, design.md, tasks.md, and any spec files under specs/) and assembles the Codex prompt by concatenating the prompt template with file contents. No diff is involved.

**Rationale:** This matches the current behavior of the slash command but moves the file reading and prompt assembly into deterministic Bash code.

### Decision 5: Fix-review and autofix-loop scope

**Choice:** Two distinct paths for design artifact fixes:
- **Manual path (`fix-review` subcommand):** The slash command (`specflow.fix_design`) uses the main LLM (Claude Code) to modify design.md/tasks.md, then calls `bin/specflow-review-design fix-review` for re-review + ledger update only. Bash handles: prompt assembly → Codex re-review → response parsing → ledger update → score computation → current-phase.md generation.
- **Auto-fix path (`autofix-loop` subcommand):** The Bash orchestrator owns the full loop. Each round uses `codex` CLI to both fix design.md/tasks.md (via a design-specific fix prompt, `fix_design_prompt.md`) AND re-review them. This mirrors the apply-side pattern where `specflow-review-apply autofix-loop` calls codex for fixes and re-review within Bash.

**Rationale:** The manual path preserves LLM quality for user-initiated fixes. The autofix path uses codex CLI for speed and determinism within the loop. This matches the apply-side exactly: `fix-review` is called by the slash command after LLM fixes, while `autofix-loop` uses codex for both fix and review internally.

**Key implementation detail:** The `autofix-loop` builds a fix prompt (`build_fix_prompt`) containing the current findings and artifact contents, sends it to codex CLI to modify the files, then runs the re-review pipeline. The slash command is not invoked during the loop.

**Prompt file delivery:** The `fix_design_prompt.md` file SHALL be installed to `~/.config/specflow/global/prompts/fix_design_prompt.md` by `specflow-install`. If the file is missing at runtime, the orchestrator SHALL fall back to a generic fix instruction (same pattern as apply-side `build_fix_prompt` which falls back to `review_apply_prompt.md` when `fix_apply_prompt.md` is absent).

**Failure handling in autofix-loop:**
- If the codex fix step fails (non-zero exit, empty output): log warning, skip the round, continue to the next round. Do NOT count as a successful round.
- If the codex re-review returns invalid JSON: log warning, skip ledger update for this round, continue.
- If a round produces no effective artifact changes (codex returns but files are unchanged): log warning, increment round counter, continue. If 2 consecutive no-change rounds occur, terminate with `result: "no_progress"`.
- Fatal errors (ledger write failure, etc.): terminate loop with `result: "error"`.

### Decision 6: Corrupt-ledger recovery via `--reset-ledger` flag

**Choice:** Add a `--reset-ledger` flag to the `review` and `fix-review` subcommands. When passed, the orchestrator creates a fresh empty ledger (overwriting any existing file) before proceeding with the normal pipeline. The slash command uses this flag after `AskUserQuestion` confirms the user wants to reset.

**Flow:**
1. Orchestrator detects corrupt ledger with no backup → returns `ledger_recovery: "prompt_user"` in result JSON
2. Slash command shows AskUserQuestion: "新規 ledger を作成しますか？"
3. User selects "新規作成" → slash command re-invokes orchestrator with `--reset-ledger`
4. User selects "中止" → workflow stops

**Rationale:** Keeps recovery logic in Bash (deterministic), the slash command only handles UI. No need for a separate subcommand — a flag on existing subcommands is simpler.

**Autofix-loop exception:** In `autofix-loop` mode, the orchestrator SHALL auto-reinitialize a missing or corrupt ledger with a warning to stderr (no user prompt), since autofix runs non-interactively. The `--reset-ledger` flag and `ledger_recovery: "prompt_user"` only apply to interactive `review` and `fix-review` subcommands.

### Decision 7: Re-review ledger semantics — shared library reuse

**Choice:** The existing `ledger_match_rereview` function in `lib/specflow-ledger.sh` already handles the re-review contract (resolved/still_open/new_findings classification, exhaustive check, duplicate check, unknown ID exclusion). The design-side orchestrator reuses this function directly, same as the apply-side. Additional design-specific post-processing (re-evaluated severity for still_open, `ledger_error: true` handling) is implemented in the orchestrator script, not the shared library.

**Key behaviors already in `ledger_match_rereview`:**
- Resolved findings: status set to "resolved", resolved_round updated
- Still-open findings: status preserved (open) or override preserved, latest_round updated
- New findings: created with sequential IDs from `max_finding_id`
- Exhaustive check: missing prior IDs auto-classified as still_open
- Duplicate check: IDs in both lists → still_open wins

**Design-specific additions in orchestrator:**
- Severity re-evaluation: update severity field for still_open findings based on Codex response
- `ledger_error: true` handling: clear all existing findings, use only new_findings from response
- Override notes validation: existing in shared library (`ledger_validate`)

**Rationale:** The shared library already covers 90% of re-review semantics. Only the Codex-response-specific post-processing needs orchestrator-level code, avoiding unnecessary library changes.

**Result JSON extension for re-review:** When `fix-review` runs, the result JSON SHALL include a `rereview_classification` object alongside the standard fields: `{"resolved": [...ids], "still_open": [...ids], "new_findings": [...ids]}`. This allows the slash command wrapper to display the resolved/still-open/new classification table without reimplementing classification logic.

## Risks / Trade-offs

- **[Risk] Ledger `readonly` removal may cause accidental mutation** → Mitigation: `ledger_init` sets defaults at source-time; apply-side callers are not affected since they never call `ledger_init` and the defaults remain unchanged.
- **[Risk] Two parallel orchestrator scripts with similar but not identical logic** → Mitigation: Both share `lib/specflow-ledger.sh` for all ledger operations. Design-specific differences (no diff, different prompts, different phase names) are isolated to the orchestrator-level code.
- **[Risk] Artifact dependency loop stdout streaming may be fragile** → Mitigation: Each artifact outputs a self-contained JSON line (JSONL format), making parsing robust. The script exits with a final summary JSON.
- **[Risk] Backward compatibility of slash command changes** → Mitigation: Slash commands call the orchestrator scripts and parse their stdout JSON. The user-facing interface (AskUserQuestion buttons, progress messages) is unchanged.
