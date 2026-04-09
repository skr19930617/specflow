## Why

specflow の review_apply / fix_apply スラッシュコマンド内に決定論的な制御フロー（diff フィルタリング、Codex 呼び出し、ledger ライフサイクル、スコア集計、auto-fix ラウンドループ、divergence 検出、next-action 分岐）が markdown prompt として埋め込まれている。これにより LLM の prompt 解釈に依存した不安定な挙動が発生し、テスト不能な制御ロジックが品質リスクとなっている。Phase 1 として Apply 側の制御フローを Bash オーケストレーターに抽出する。

## What Changes

- **Apply 側 Bash オーケストレーター新設 (`bin/specflow-review-apply`)**: review_apply / fix_apply から以下の制御フローを Bash + jq スクリプトに抽出（end-to-end 実行、最終結果を JSON で出力）:
  - Diff フィルタリング: specflow-filter-diff の呼び出しとサマリー解析
  - Codex 呼び出し: codex CLI 直接呼び出し（`codex --approval-mode full-auto -q`）+ レスポンス JSON パース
  - Ledger ライフサイクル: 読み込み・整合性チェック・round カウンタ更新・finding マッチング・max_finding_id 管理・バックアップ・永続化
  - スコア集計: severity/category 別 unresolved count、top-level status 導出（has_open_high / all_resolved / in_progress）
  - Auto-fix ラウンドループ: 成功判定・最大ラウンド到達判定・divergence 検出
  - Next-action 分岐: autofix 継続 vs ユーザー向けハンドオフの決定（結果 JSON で通知、UI 表示は slash command 側）
- **スラッシュコマンドの薄型化**: review_apply / fix_apply から全制御フローを除去し、Bash オーケストレーター呼び出し + 結果 JSON の UI 表示のみの薄い UI ラッパーに変換
- **specflow-run 拡張**: オーケストレーターが必要とする追加サブコマンド（round 管理、ledger 操作用ヘルパー）を追加
- **テスト基盤**: bats-core による Bash テストを tests/ 配下に追加

## Capabilities

### New Capabilities
- `apply-orchestrator`: Apply 側の決定論的制御フロー（diff フィルタリング、Codex 呼び出し、ledger ライフサイクル、スコア集計、auto-fix ラウンドループ、divergence 検出、next-action 分岐）を end-to-end で管理する Bash + jq オーケストレーター。最終結果を JSON で出力し、slash command は UI 表示のみ担当

### Modified Capabilities
- `run-state-management`: オーケストレーターが必要とする追加サブコマンド（round 管理、ledger 操作用ヘルパー）の追加

## Impact

- **bin/**: 新規 Bash スクリプト `specflow-review-apply` + specflow-run への追加サブコマンド
- **global/commands/**: `specflow.review_apply.md` と `specflow.fix_apply.md` を薄型化（Bash 呼び出し + 結果 JSON の UI 表示のみ）
- **tests/**: bats-core による Apply オーケストレーターの単体テスト追加
- **依存関係**: jq（既存依存）、bats-core（テスト用、新規依存）、codex CLI（既存依存、MCP 経由から CLI 直接呼び出しに変更）
- **既存ユーザーフロー**: ユーザー facing のコマンドインターフェースは変更なし（内部実装の移行のみ）
- **Parent Issue**: https://github.com/skr19930617/specflow/issues/76
- **This Issue**: https://github.com/skr19930617/specflow/issues/77
