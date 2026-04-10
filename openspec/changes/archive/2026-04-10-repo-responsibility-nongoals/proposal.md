## Why

specflow を workflow core + bundled local reference implementation として位置づけ、DB-backed runtime や server PoC は別リポジトリに分離する方針を固めたい。リポジトリの責務境界が明文化されていないため、今後の開発で「この repo に入れるべきか」の判断基準がなく、スコープクリープのリスクがある。

## What Changes

- 既存の `docs/architecture.md`（Contract-First Node Architecture）に "Repository Scope" セクションを追加する。既存セクション（Workflow Truth, Runtime Strategy 等）はそのまま保持し、新規セクションとして責務定義を末尾に追加する
- "This repo owns" として以下を明記する:
  - **Workflow core**: 状態遷移定義、run-state 管理、review orchestration など workflow の根幹ロジック
  - **Bundled local reference implementation**: specflow-* CLI ツール群（specflow-run, specflow-analyze 等）、slash command ガイド、templates を含む。ファイルシステムベースの実行環境一式
- "This repo does not own" として以下を明記する:
  - DB-backed runtime（PostgreSQL 等を使った永続化ランタイム）
  - Server PoC（HTTP API サーバー実装）
  - External runtime adapter（サードパーティ統合）
- local reference implementation の位置づけを定義する: bundled だが交換可能であり、external runtime が同じ workflow core contract に準拠すれば置換できる
- **Boundary decision rules** を定義する: ボーダーライン上のコンポーネント（shared contracts/interfaces、test harnesses、migration tools、runtime-selection glue 等）が this repo に属するか否かを判断するためのルールと具体例を示す
  - 例: shared interface 定義（state machine schema, review protocol）→ workflow core として this repo に含む
  - 例: DB migration scripts → external runtime 固有のため this repo には含まない
  - 例: contract conformance test suite → workflow core contract の検証手段として this repo に含む
- **Workflow core contract surface の棚卸し**（inventory のみ、規範仕様ではない）: architecture.md 内で contract surface を列挙する。ただし、これは棚卸し（inventory）であり、各 contract の権威的な規範仕様ではない。規範仕様の策定は follow-up proposal に委ねる
  - 列挙対象: state machine schema、run-state JSON 構造、review protocol interface
  - **CLI entry-point は core contract に含めない**: CLI 表面（コマンド名、引数、出力形式）は bundled local reference implementation に属する実装詳細であり、external runtime が準拠すべき contract ではない。external runtime は workflow core contract（state machine, run-state, review protocol）のみに準拠すればよい
  - architecture.md の contract セクションは「何が contract surface か」を示す棚卸しに留め、各 contract の詳細仕様・バージョニング・変更管理プロセスは別途 proposal で定義する

## Capabilities

### New Capabilities
- `repo-responsibility`: リポジトリの責務・非責務・境界を定義するドキュメント。workflow core / bundled local reference implementation / out-of-scope の区分を明文化する

### Modified Capabilities

## Impact

- 既存の `docs/architecture.md` にセクション追加（ドキュメントのみ、コード変更なし）
- 今後の機能提案・PR レビュー時の判断基準として参照される
- 別リポジトリへの分離判断の根拠となる
