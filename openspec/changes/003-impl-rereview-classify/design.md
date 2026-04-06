<!-- Historical Migration
  Source: specs/003-impl-rereview-classify/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: Codex impl re-review classification

**Branch**: `003-impl-rereview-classify` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-impl-rereview-classify/spec.md`

## Summary

Codex の impl re-review 時に、前回 findings との差分を `resolved_previous_findings` / `still_open_previous_findings` / `new_findings` に構造化して返すようにする。既存の review-ledger（002 で導入済み）を入力として使い、re-review 専用 prompt を新規作成する。初回レビュー prompt は変更しない。

## Technical Context

**Language/Version**: Bash scripts, Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit
**Storage**: JSON ファイル (`specs/<issue>-<slug>/review-ledger.json`)
**Testing**: 手動テスト（Codex MCP 呼び出し + JSON 出力検証）
**Target Platform**: macOS / Linux (CLI)
**Project Type**: CLI ツール群（specflow）
**Performance Goals**: N/A（バッチ処理）
**Constraints**: Codex の出力は LLM に依存するため厳密な構造保証は prompt 設計でカバー
**Scale/Scope**: 1 プロジェクトあたり 1 review-ledger.json、findings は通常 1-20 件程度

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution は未定義（テンプレートのみ）のため、制約なし。PASS。

## Project Structure

### Documentation (this feature)

```text
specs/003-impl-rereview-classify/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── tasks.md             # Phase 2 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
template/
└── .specflow/
    ├── review_impl_prompt.txt          # 既存（変更しない）
    └── review_impl_rereview_prompt.txt # 新規作成

global/
├── specflow.impl.md                    # 修正: ledger 有無で prompt 切替ロジック追加
└── specflow.fix.md                     # 修正: re-review prompt 使用 + ledger 更新ロジック
```

**Structure Decision**: 既存の specflow プロジェクト構造に従う。新規ファイルは `template/.specflow/` に re-review prompt を追加し、既存 slash commands を修正する。

## Complexity Tracking

> No violations — constitution is not yet defined.

## Implementation Approach

### 変更対象ファイル一覧

1. **`template/.specflow/review_impl_rereview_prompt.txt`** (新規)
   - re-review 専用の review prompt
   - 入力: 前回 ledger の findings + max_finding_id + 実装 diff
   - 出力: `{ decision, resolved_previous_findings, still_open_previous_findings, new_findings, summary, ledger_error }`
   - broad review を維持しつつ、前回 findings の分類を追加

2. **`global/specflow.impl.md`** (修正)
   - 初回レビュー後に review-ledger.json を初期化するロジックを追加
   - 既存の Codex review 呼び出しフローはそのまま
   - ledger 初期化: Codex 出力の findings から `max_finding_id` と `findings` を導出して保存

3. **`global/specflow.fix.md`** (修正)
   - ledger 有無で review prompt を切替: ledger あり → re-review prompt, なし → 初回 prompt
   - ledger JSON 不正時: re-review スキーマで空分類 + `ledger_error: true`
   - re-review 後の ledger 更新ロジック:
     - `still_open_previous_findings` のフル属性を前回 ledger から補完
     - `resolved_previous_findings` を除外
     - `new_findings` を統合
     - `max_finding_id` を更新
   - split/merge 時: 元 finding は canonical に still_open、分裂後は new_findings。次回 ledger には new_findings のみ残す（旧 ID は note で追跡）

4. **`bin/specflow-init`** (修正不要、ただし `specflow-init --update` で新 prompt が配布される)

### Re-review Prompt 設計

```
入力:
- PREVIOUS_LEDGER: { max_finding_id, findings[] }
- DIFF: git diff

出力スキーマ:
{
  "decision": "APPROVE | REQUEST_CHANGES | BLOCK",
  "resolved_previous_findings": [{ "id": "F1", "note": "..." }],
  "still_open_previous_findings": [{ "id": "F2", "severity": "high", "note": "..." }],
  "new_findings": [{ "id": "F3", "severity": "...", "category": "...", "file": "...", "title": "...", "detail": "..." }],
  "summary": "...",
  "ledger_error": false
}
```

decision ルール:
- 既存 impl review と同じ基準
- 全 currently open findings（still_open + new_findings）に基づく
- still_open の severity は今回の再評価値

Prior-ID matching:
- Codex は前回 findings の `id` をそのまま返す（fuzzy matching なし）
- 各 previous finding ID は resolved/still_open のいずれかに排他的に出現

ID 採番:
- new_findings の ID は `max_finding_id + 1` から連番
- prompt に前回の `max_finding_id` を明示

Split/merge:
- 元 finding ID → still_open に分類（note に split/merge 先を記載）
- 分裂後の findings → new_findings に新 ID で追加
- 次回 ledger: 元 finding はクローズ、新 ID のみ持ち越す

### Prior-ID バリデーション（specflow.fix.md 内、ledger 更新前）

```
After parsing re-review response, before ledger update:
1. Collect prior_ids = ledger.findings.filter(f => !["accepted_risk","ignored"].includes(f.status)).map(f => f.id)
2. Collect response_ids = resolved_ids ∪ still_open_ids
3. Missing IDs (prior_ids - response_ids): auto-classify as still_open + note="classification missing from Codex output"
4. Duplicate IDs (in both resolved and still_open): keep still_open (conservative)
5. Unknown IDs (response_ids - prior_ids): warn and ignore
```

### Ledger 更新ロジック（specflow.fix.md 内）

```
After validation:
1. For each resolved finding: status="resolved", latest_round=current
2. For each still_open finding: merge with previous ledger:
   - Overwrite: severity (re-evaluated), note (current status)
   - Preserve: id, category, file, title, detail, origin_round, relation, supersedes, notes
   - Update: status="open", latest_round=current
4. For each new finding: add with origin_round=current, status="new", relation="new"
5. **Persist max_finding_id**: new_ledger.max_finding_id = max(
     prev_ledger.max_finding_id,
     max(new_findings.map(f => extractNumber(f.id))) || 0
   ) — MUST be written to ledger JSON on every update
6. If ledger_error == true:
     new_ledger.max_finding_id = max(new_findings.map(f => extractNumber(f.id))) or 0
     new_ledger.findings = new_findings only
7. Write updated ledger to review-ledger.json with .bak backup

Split/merge ルール:
- 元 finding → re-review で still_open に分類（note に "split into F5, F6" 等）
- 次回 ledger: 元 finding は status="resolved" にクローズ、new_findings（F5, F6）のみ持ち越す
```

### Ledger 検出・フォールバック分岐

```
Branch A: ledger ファイルなし → 初回 review prompt 使用
Branch B: 有効な ledger → re-review prompt + PREVIOUS_FINDINGS + MAX_FINDING_ID
Branch C: 有効だが findings 空 → re-review prompt + 空 PREVIOUS_FINDINGS + MAX_FINDING_ID=0
Branch D: 破損/不正 JSON → re-review prompt + 空 PREVIOUS_FINDINGS + ledger_error=true
Branch E: max_finding_id 欠損 → findings から導出（FR-020）、正常続行
```

### 初回レビュー後の Ledger 初期化（specflow.impl.md 内）

```
After initial review:
1. Parse Codex review JSON (既存フォーマット: { decision, findings[], summary })
2. Create review-ledger.json:
   {
     "max_finding_id": max(findings.map(f => extractNumber(f.id))) or 0,
     "findings": findings  // フル属性そのまま
   }
3. Write to specs/<feature>/review-ledger.json
```

### 002-review-ledger との関係

002 で導入された review-ledger.json のデータモデル（Finding, RoundSummary, Matching Algorithm）は既に存在する。本 feature では:

- 002 のデータモデルを拡張するのではなく、re-review prompt の出力を分類形式にする
- 既存の ledger 更新ロジック（002 の specflow.fix.md 内）を、分類済み re-review 出力に対応させる
- `max_finding_id` フィールドは ledger に追加（既存の `current_round` から導出も可能だが、明示的に保持する方がシンプル）
