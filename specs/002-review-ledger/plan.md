# Implementation Plan: Review Ledger for Impl Review Loop

**Branch**: `002-review-ledger` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-review-ledger/spec.md`

## Summary

impl フェーズの review loop 状態を `review-ledger.json` で追跡する機能を追加する。specflow の Claude Code スラッシュコマンド（specflow.impl.md / specflow.fix.md）に、Codex review 結果の受信後に ledger を生成・更新するロジックを組み込む。全ロジックは Claude Code のプロンプト内で JSON 操作として実行される（外部スクリプト不要）。

## Technical Context

**Language/Version**: Bash scripts + Claude Code slash commands (Markdown)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), GitHub CLI (gh), speckit
**Storage**: JSON ファイル (`specs/<issue>-<slug>/review-ledger.json`)
**Testing**: 手動テスト（specflow は Claude Code プロンプトベースのツールであり、自動テストフレームワークは不使用）
**Target Platform**: macOS / Linux (Claude Code CLI 環境)
**Project Type**: CLI workflow tool (Claude Code slash commands)
**Performance Goals**: N/A（ファイル I/O のみ、インタラクティブワークフロー）
**Constraints**: `.specflow/` ディレクトリは read-only。全変更は `global/` (slash commands) と `template/` (初期化テンプレート) に限定
**Scale/Scope**: 1 feature あたり数十件の findings を想定。JSON ファイルサイズは negligible

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution は未設定（テンプレートのまま）。ゲート違反なし。

## Project Structure

### Documentation (this feature)

```text
specs/002-review-ledger/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── tasks.md             # Phase 2 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
global/
├── specflow.impl.md     # 変更: Codex review 後に ledger 更新ロジック追加
├── specflow.fix.md      # 変更: Codex review 後に ledger 更新ロジック追加
└── specflow.review.md   # 新規: （不要 — ledger は impl/fix 内で処理）

template/
└── .specflow/
    └── review_impl_prompt.txt  # 変更なし（Codex 出力 JSON は既存の findings[] フォーマットを維持）
```

**Structure Decision**: 外部スクリプトは追加しない。全 ledger ロジックは specflow.impl.md / specflow.fix.md 内のプロンプト指示として実装する。Claude Code が JSON の読み書き・マッチング・集計をすべて実行する。

## Implementation Approach

### 設計方針

1. **プロンプト内ロジック**: review-ledger の全操作（生成・マッチング・更新・集計）は Claude Code の Read/Write ツールを使い、slash command のプロンプト内で JSON を操作する
2. **既存コマンドの拡張**: specflow.impl.md と specflow.fix.md の「Codex review 後、結果表示前」に ledger 更新ステップを挿入する
3. **Codex 出力形式の維持**: review_impl_prompt.txt の出力 JSON スキーマは変更しない。ledger は Codex が返す `findings[]` を入力として処理する
4. **手動 override**: ユーザーが JSON ファイルを直接編集して `accepted_risk` / `ignored` を設定。ledger 読み込み時にバリデーションを実行

### 統合ポイント

specflow.impl.md / specflow.fix.md の現在のフロー:
```
1. Codex review 実行 → JSON レスポンス取得
2. findings テーブル表示
3. AskUserQuestion でハンドオフ
```

変更後のフロー:
```
1. Codex review 実行 → JSON レスポンス取得
2. ★ review-ledger.json を読み込み（なければ新規作成）
2a. ★ パース失敗時: review-ledger.json.bak から復旧を試行。bak もなければユーザーに新規作成を確認。復旧成功時は破損ファイルを .corrupt に退避し、bak は書き込み成功後まで保持
3. ★ バリデーション（無効 override → 自動リバート）
4. ★ Finding マッチング（FR-007 アルゴリズム — override findings も参加）
5. ★ Status 遷移適用（状態遷移テーブル）
6. ★ Round summary 生成（スナップショット）
7. ★ Top-level status 算出（FR-002 導出ルール）
8. ★ review-ledger.json が正常に読めた場合のみ .bak にバックアップ作成（破損復旧時は bak を上書きしない）
9. ★ review-ledger.json に書き込み
10. ★ Ledger サマリーを表示（前ラウンドとの差分）
11. findings テーブル表示（既存）
12. AskUserQuestion でハンドオフ（既存）
```

### Pre-processing: ラウンドメタデータ（FR-008）

Codex review 結果を受信するたびに、マッチング前に以下を実行:
1. `current_round` をインクリメント（+1）
2. 当該ラウンドの finding シーケンスカウンタを 0 に初期化
3. 新規/reframed finding 作成時: `id` = `R{current_round}-F{seq++}`, `origin_round` = `current_round`, `latest_round` = `current_round`
4. マッチした既存 finding: `latest_round` = `current_round` に更新
5. 消失（auto-resolved）した finding: `latest_round` は変更しない（最後に検出されたラウンドを保持）

### マッチングアルゴリズム（FR-007）

Codex が返す `findings[]` と既存 ledger の `findings[]` を比較。**全非 resolved findings を統合してマッチングする（active + override 一括）。**

**Step 0: 候補プール構築**
1. 既存 findings から status ≠ `resolved` のものを全て抽出（open, new, accepted_risk, ignored すべて含む）

**Step 1: Same マッチング** (file + category + severity 完全一致)
2. Codex findings を 1 件ずつ候補プールと比較:
   a. `file` + `category` + `severity` 完全一致の候補を検索
   b. 1:1 なら same 確定
   c. N:M なら `title` 正規化（lowercase + whitespace collapse + trim）後の完全一致でマッチ。残りは出現順（候補プール内のインデックス順）で 1:1 ペアリング。余った Codex findings は Step 2 へ
3. マッチした finding の status 遷移を適用:
   - active (open/new) → status を `open` に、relation=`same`、latest_round を更新
   - override (accepted_risk/ignored) → status を維持、relation=`same`、latest_round を更新

**Step 2: Reframed マッチング** (file + category 一致、severity 変更)
4. Step 1 でマッチしなかった Codex findings に対して、候補プールの未マッチ findings と比較:
   a. `file` + `category` 一致 + `severity` が異なる → reframed 候補
   b. 1:1 ペアリング（出現順）
5. マッチした finding の遷移:
   - 元 finding（active/override 問わず）: status=`resolved`, relation=`reframed`
   - 新 finding 作成: status=`open`, relation=`reframed`, supersedes=元 finding の id（override は引き継がない）

**Step 3: 残余処理**
6. マッチしなかった Codex findings → new finding 作成 (status=`new`, relation=`new`)
7. マッチしなかった候補プールの active findings (open/new) → status=`resolved`（消失）、relation は直前値保持
8. マッチしなかった候補プールの override findings → status を維持（累積モデルで保持）

## Complexity Tracking

> No constitution violations to justify.
