## Why

現在の specflow ワークフローは、スラッシュコマンドガイドを AI agent が読んで自律的にオーケストレーションするモデルに依存している。このモデルでは phase 遷移やサブエージェント起動タイミングが AI の判断に委ねられ、決定性と再現性に欠ける。

**Server が決定的にオーケストレーションし、AI agent は phase ごとの作業員としてのみ呼ばれる**モデルへ移行することで、ワークフローの信頼性・再現性・スケーラビリティを確保する。

Source: https://github.com/skr19930617/specflow/issues/127

## What Changes

### Phase 1: 基盤 (core repo 内)
- RunState の core/adapter フィールド分離 — server adapter が独自フィールドを拡張可能にする
- Phase Contract の構造化定義 — phase ごとの入出力・gate 条件をプログラムで検証可能な型に
- Change ID → Run ID 自動解決 (#125)

### Phase 2: サーバー基盤 (別 repo)
- DB-backed RunArtifactStore — artifact 永続化を DB adapter で実現
- Deterministic Phase Router — phase 遷移ロジックをプログラムコードで 100% 決定的に実行
- Agent Session Manager — 1 change = 1 session のライフサイクル管理

### Phase 3: 対話・UI 統合 (別 repo)
- Agent-Server 対話 protocol — agent へのピンポイント phase 指示送信
- Event streaming — phase 遷移・進捗のリアルタイム配信
- Frontend chat UI

## Capabilities

### New Capabilities
- `deterministic-phase-router`: Server 側の決定的 phase 遷移ロジック。State Machine + Phase Router がすべての phase 遷移・gated decision ルーティング・サブエージェント起動タイミングをプログラムコードで判定する
- `agent-session-lifecycle`: 1 change = 1 session のライフサイクル管理。Agent Session Manager が session の生成・コンテキスト蓄積・approve/reject 時の破棄を制御する
- `agent-server-protocol`: Agent-Server 間の対話 protocol。agent にはピンポイントの phase 指示のみ送信し、セッション内でプロジェクトコンテキストを蓄積する

### Modified Capabilities
- `workflow-run-state`: RunState に core/adapter フィールド分離を導入。core フィールドは既存のまま維持し、adapter 固有フィールド（DB 接続情報、session ID 等）を拡張ポイントとして追加
- `run-artifact-store-conformance`: LocalFs 実装に加え、DB-backed adapter の conformance 要件を追加。artifact 永続化の抽象インターフェースを拡張
- `phase-contract-types`: phase ごとの入出力・gate 条件を構造化型として定義。現在の暗黙的な contract を明示的な型定義に昇格
- `surface-event-contract`: Server surface (`remote-api`) 向けの event streaming 要件を追加。phase 遷移・進捗イベントのリアルタイム配信

## Impact

- **Core module**: 変更なし（Principle 5）。workflow-machine.ts, RunState 型の core 部分はそのまま活用
- **Adapter 層**: 全新規コードは adapter 層に追加。新しい surface `remote-api` を導入
- **既存 CLI**: reference implementation として残す。Server モデルとの共存
- **依存関係**: DB ドライバー、WebSocket/SSE ライブラリ等の新規依存が Phase 2-3 で追加
- **Actor/Surface Model**: Server は新しい surface。actor taxonomy はそのまま
- **agent-context-template**: surface-neutral プロファイルスキーマはそのまま利用
