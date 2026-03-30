# Tasks: Codex impl re-review classification

**Input**: Design documents from `/specs/003-impl-rereview-classify/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Phase 1: Setup

**Purpose**: Re-review prompt テンプレート作成と既存ファイル確認

- [x] T001 Read existing review prompt to understand format in `template/.specflow/review_impl_prompt.txt`
- [x] T002 Read existing specflow.impl.md to understand current review flow in `global/specflow.impl.md`
- [x] T003 Read existing specflow.fix.md to understand current fix/re-review flow in `global/specflow.fix.md`
- [x] T004 Read existing 002-review-ledger data model in `specs/002-review-ledger/data-model.md`

**Checkpoint**: 既存ファイルの構造を理解し、変更箇所を特定済み

---

## Phase 2: Foundational (Re-review Prompt)

**Purpose**: Re-review 専用 prompt を新規作成。すべての user story がこの prompt に依存する。

**⚠️ CRITICAL**: User Story の実装はこの prompt が完成するまで開始できない

- [x] T005 Create re-review prompt file `template/.specflow/review_impl_rereview_prompt.txt` with the following structure:
  - Same review criteria as initial review (correctness, completeness, quality, scope, testing, error_handling, forbidden_files, performance)
  - Input sections: PREVIOUS_FINDINGS (ledger findings array with id, severity, category, file, title, detail for each), MAX_FINDING_ID (integer), DIFF (git diff)
  - Output schema: `{ decision, resolved_previous_findings, still_open_previous_findings, new_findings, summary, ledger_error }`
  - **Prior-ID matching**: Codex MUST consume the `id` field of each previous finding and return that exact `id` in either resolved_previous_findings or still_open_previous_findings. No fuzzy matching — IDs are the sole identity key
  - Classification instructions: each previous finding (by `id`) MUST appear in exactly one of resolved/still_open (exclusive, exhaustive). Missing IDs are a schema violation
  - ID assignment: new_findings IDs start from MAX_FINDING_ID + 1, format F{N}, sequential
  - Decision rule: based on ALL currently open findings (still_open + new_findings)
  - Severity in still_open: re-evaluated current severity (not previous value)
  - **Split/merge handling**: when a previous finding has split into multiple issues or merged with others, classify the original finding ID as still_open with note explaining the split/merge (e.g., "split into F5, F6"). The new parts MUST appear in new_findings with fresh IDs. The original ID is thus "closed" for next round — only the new IDs carry forward
  - Broad review instruction: review entire diff, not just areas related to previous findings
  - Strict JSON output only, no markdown

**Checkpoint**: Re-review prompt template ready, output schema validated

---

## Phase 3: User Story 1 & 2 — Re-review 分類と新規 findings 検出 (Priority: P1)

**Goal**: re-review 実行時に resolved/still_open/new_findings が正しく分類されて返り、新規 high severity finding も検出可能

**Independent Test**: `specflow.fix` 実行時に re-review prompt が使われ、分類済み JSON が返ることを確認

### Implementation

- [x] T006 [US1] Update `global/specflow.fix.md` — Add ledger detection and fallback logic with these explicit branches:
  - **Branch A: No ledger file** — `review-ledger.json` does not exist in feature spec dir → use initial review prompt (`review_impl_prompt.txt`), unchanged behavior
  - **Branch B: Valid ledger** — file exists, JSON parses successfully, `findings` array present → use re-review prompt with PREVIOUS_FINDINGS from ledger findings and MAX_FINDING_ID from ledger (or derived from findings if absent)
  - **Branch C: Empty findings** — file exists, JSON valid, but `findings` array is empty → use re-review prompt with empty PREVIOUS_FINDINGS array, MAX_FINDING_ID=0. Re-review schema output with empty resolved/still_open arrays
  - **Branch D: Corrupt/malformed ledger** — file exists but JSON parse fails or required fields missing → use re-review prompt with empty PREVIOUS_FINDINGS, MAX_FINDING_ID=0, and instruct Codex to set `ledger_error: true` in output. All findings treated as new_findings
  - **Branch E: Missing max_finding_id** — file exists, JSON valid, findings present, but `max_finding_id` field absent → derive from `max(findings.map(f => extractNumber(f.id)))`. If findings also empty, use 0. Log a warning but proceed normally (FR-020)
- [x] T007 [US1] Update `global/specflow.fix.md` — Add re-review prompt assembly: read `review_impl_rereview_prompt.txt`, inject PREVIOUS_FINDINGS from ledger findings array, inject MAX_FINDING_ID from ledger, inject DIFF from git diff. Pass assembled prompt to Codex MCP
- [x] T008 [US1] Update `global/specflow.fix.md` — Parse re-review Codex response as JSON with fields: decision, resolved_previous_findings, still_open_previous_findings, new_findings, summary, ledger_error. **Decision derivation**: the decision returned by Codex is based on ALL currently open findings (still_open + new_findings) per FR-018 — the prompt instructs this, and the display should show the decision alongside the full open findings count. Display results to user in formatted table showing resolved/still_open/new separately with severity breakdown
- [x] T008b [US1] Update `global/specflow.fix.md` — Add prior-ID classification validation before ledger update:
  - Collect all prior finding IDs from the ledger (excluding override statuses accepted_risk/ignored)
  - Collect all IDs returned in resolved_previous_findings + still_open_previous_findings
  - **Check exhaustive**: every prior ID must appear in the response. If any prior ID is missing, log a warning and classify missing IDs as still_open with note "classification missing from Codex output"
  - **Check exclusive**: no prior ID may appear in both resolved and still_open. If duplicate found, keep the still_open classification (conservative)
  - **Check unknown**: IDs in the response that are not in the prior ledger are treated as **explicit anomalies**: display a warning message to the user listing the unknown IDs, exclude them from ledger update (do not add to findings), and include them in the review display output as "⚠ Unknown IDs: [list]" so the user can investigate. Do NOT silently ignore — anomalies must be visible
  - This validation ensures ledger integrity even when Codex output is imperfect
- [x] T009 [US1] Update `global/specflow.fix.md` — Add ledger update logic after re-review:
  - **Full attribute rules per FR-017**:
    - Ledger finding record MUST always contain: id, severity, category, file, title, detail, origin_round, latest_round, status, relation, supersedes, notes
    - `resolved` findings: all attributes preserved from previous ledger, only `status` → "resolved" and `latest_round` → current round change
    - `still_open` findings: stable attributes (id, category, file, title, detail, origin_round, relation, supersedes, notes) from previous ledger; `severity` and `note` from re-review output; `status` → "open", `latest_round` → current round
    - `new` findings: all attributes from Codex output + `origin_round`=current, `latest_round`=current, `status`="new", `relation`="new", `supersedes`=null, `notes`=""
  - For resolved findings: update status to "resolved" and latest_round in ledger. Keep all other attributes unchanged
  - For still_open findings: merge re-review output with previous ledger as follows:
    - **Overwrite from re-review**: `severity` (re-evaluated value from FR-015), `note` (current status description)
    - **Preserve from previous ledger**: `id`, `category`, `file`, `title`, `detail`, `origin_round`, `relation`, `supersedes`, `notes` (user override notes)
    - Update: `status` → "open", `latest_round` → current round
    - If re-review output includes updated `detail` text, append to existing detail rather than replace (preserves history)
  - For new findings: add as new entries with origin_round=current, status="new", relation="new"
  - **Persist max_finding_id**: compute `new_max = max(prev_ledger.max_finding_id, max(new_findings.map(f => extractNumber(f.id))) || 0)` and write to ledger JSON as `"max_finding_id": new_max`. This MUST be written on every ledger update, even if no new_findings exist (carry forward previous value)
  - Update round_summaries with new round snapshot
  - Handle ledger_error=true: max_finding_id from new_findings only, findings = new_findings only, round resets
  - Handle split/merge: original finding marked still_open in re-review output gets `status="resolved"` in next ledger (closed by split/merge), only new_findings versions carry forward with fresh IDs
  - Write updated ledger to review-ledger.json with .bak backup

**Checkpoint**: Re-review で前回 findings の resolved/still_open/new 分類が正しく動作し、ledger が更新される

---

## Phase 4: User Story 3 — 初回レビューとの互換性維持 (Priority: P2)

**Goal**: 初回レビュー（ledger なし）は既存動作を維持し、初回レビュー後に ledger を初期化する

**Independent Test**: 新規 feature で `specflow.impl` を実行し、既存フォーマットでレビューが返り、review-ledger.json が自動作成されることを確認

### Implementation

- [x] T010 [US3] Update `global/specflow.impl.md` — Add ledger initialization after initial Codex review: parse review response (existing format: { decision, findings[], summary }), create review-ledger.json with:
  - feature_id from branch name
  - phase: "impl"
  - current_round: 1
  - status: derived from findings
  - **max_finding_id**: compute `max(findings.map(f => extractNumber(f.id))) || 0` and write explicitly to ledger JSON as `"max_finding_id": <value>`. This field MUST be present in every ledger file from initialization onward
  - findings: all findings with full attributes + origin_round=1, latest_round=1, status="new", relation="new"
  - round_summaries: initial round summary
  - Ensure existing review display and flow is unchanged (FR-007)

**Checkpoint**: 初回レビューの動作に変更なし、かつ ledger が自動初期化される

---

## Phase 5: Verification & Polish

**Purpose**: Re-review 動作の検証、specflow-init の確認、ドキュメント更新

- [x] T011 Verify prompt switching (FR-013): test Branch A (no ledger → initial prompt used), Branch B (valid ledger → re-review prompt used), Branch D (corrupt ledger → re-review with ledger_error=true). Confirm correct prompt is selected in each case
- [x] T012 Verify tri-part output parsing (FR-002-005): confirm resolved_previous_findings, still_open_previous_findings, new_findings are correctly parsed from Codex response. Verify each field has required attributes (resolved: id+note, still_open: id+severity+note, new: id+severity+category+file+title+detail)
- [x] T013 Verify prior-ID validation (FR-009/010): test with Codex output missing a prior ID (should auto-classify as still_open), duplicate ID in both resolved/still_open (should keep still_open), unknown ID not in ledger (should display as anomaly warning)
- [x] T014 Verify ledger update persistence: confirm max_finding_id is correctly written after both initial review (T010) and re-review (T009). Verify findings array contains full attributes for all entries
- [x] T015 Verify `bin/specflow-init` copies new `review_impl_rereview_prompt.txt` when initializing projects (should work automatically since it copies entire `.specflow/` directory — verify only)
- [x] T016 Update `template/CLAUDE.md` — Add documentation about re-review classification behavior under Review Ledger section: describe that fix re-reviews now return classified findings, ledger_error flag behavior, and how ledger is auto-initialized after first review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — read existing files
- **Phase 2 (Foundational)**: Depends on Phase 1 — creates the re-review prompt
- **Phase 3 (US1 & US2)**: Depends on Phase 2 — modifies specflow.fix.md to use re-review prompt
- **Phase 4 (US3)**: Independent of Phase 3 — modifies specflow.impl.md only
- **Phase 5 (Polish)**: Depends on Phase 3 and Phase 4

### User Story Dependencies

- **US1 & US2 (P1)**: Depend on re-review prompt (Phase 2). US1 and US2 are implemented together as they both modify specflow.fix.md
- **US3 (P2)**: Depends on Phase 2 only. Can start in parallel with Phase 3 since it modifies a different file (specflow.impl.md)

### Parallel Opportunities

- Phase 3 (specflow.fix.md) and Phase 4 (specflow.impl.md) can run in parallel — different files
- T001-T004 are all read-only and can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 & 2)

1. Complete Phase 1: Read existing files
2. Complete Phase 2: Create re-review prompt
3. Complete Phase 3: Update specflow.fix.md with re-review logic
4. **STOP and VALIDATE**: Run `/specflow.fix` on a feature with existing ledger

### Incremental Delivery

1. Phase 1 + 2 → Re-review prompt ready
2. Phase 3 → Re-review classification working (MVP)
3. Phase 4 → Ledger auto-initialization from initial review
4. Phase 5 → Documentation and verification

---

## Notes

- All file modifications are to Markdown (slash command) or text (prompt) files — no compiled code
- The re-review prompt is the core deliverable; all other changes flow from it
- Existing review-ledger.json schema (002) is preserved and extended with max_finding_id
- specflow.fix.md and specflow.impl.md are the only slash commands that need modification
