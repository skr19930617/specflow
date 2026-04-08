## Why

specflow のワークフロー制御ロジック（状態遷移・許可アクション判定）が slash commands、プロンプト、handoff ボタン、スクリプトに分散しており、暗黙的な規約に依存している。このため、resumable run・複数 UI フロントエンド（Slack bot、ダッシュボード等）・状態監視が困難になっている。今がこの分離に適したタイミングである — OpenSpec ベースのフェーズ境界が明確化され、autofix/divergence 処理など運用が複雑化しつつあるため。

## What Changes

- ワークフロー遷移定義を静的な JSON ファイルとして `global/workflow/state-machine.json` に導入する
- per-run の状態管理を `.specflow/runs/<run_id>/run.json` として導入する（run_id = change name）
- UI バインディングメタデータを run state から分離する設計とする（将来の Slack 等向け）
- 状態遷移を一元管理する内部エントリポイント（Bash + jq による `specflow-run` コマンド群）を導入する
- 既存 slash commands とは並行共存させる（この change では既存コマンドを書き換えない。後続 issue で段階的に移行）

### Design Decisions (from Clarify)

- **状態粒度**: トップレベルフェーズのみ（proposal / design / apply / approve / reject）。サブステップ（clarify, validate, review 等）はフェーズ内部ロジックとして扱い、state-machine では管理しない
- **run_id**: change name をそのまま使用（OpenSpec の change ディレクトリ名と 1:1 対応）
- **実装言語**: Bash + jq（既存 bin/ スクリプト群と一貫性を保ち、新たなランタイム依存を追加しない）
- **移行戦略**: 並行共存 — 既存 slash commands はそのまま動作。transition-core を並行で導入し、安定後に後続 issue で移行
- **fix ループ**: 初期スコープには含めない。fix_design / fix_apply は各フェーズ内の revise イベントとしてモデルし、同フェーズに状態を戻すだけで表現

## Capabilities

### New Capabilities
- `workflow-definition`: メインラインフローの静的ステートマシン定義（states, events, transitions）を JSON で管理する機能
- `run-state-management`: per-run の状態（現在フェーズ、許可イベント、メタデータ等）を追跡・永続化する機能
- `transition-core`: 遷移の妥当性検証と実行を一元管理するコアエントリポイント（`specflow-run start/advance/status`）

### Modified Capabilities

## Impact

- `bin/` 配下のスクリプト — 新しい `specflow-run` コマンド群（start / advance / status）の追加
- `global/workflow/` ディレクトリ — state-machine.json の保存先として新設
- `.specflow/runs/` ディレクトリ — per-run state の保存先として新設（`.gitignore` 対象）
- 既存 `global/commands/` および `bin/` の slash command スクリプトは**この change では変更しない**（並行共存）
