# Data Model: approve-ledger-gate

## Entity: ReviewLedger (read-only reference)

この機能は既存の review-ledger.json を **読み取り専用** で使用する。スキーマは 002-review-ledger で定義済み。

### approve が参照するフィールド

| Field | Type | 用途 |
|-------|------|------|
| `status` | enum: `has_open_high` / `all_resolved` / `in_progress` | gate 判定の唯一の正本 |
| `findings` | Finding[] | 停止時の概要表示用（存在する場合のみ） |

### Finding から抽出するフィールド（停止時表示用）

| Field | Type | 用途 |
|-------|------|------|
| `id` | string | finding の識別子（例: R1-F01） |
| `title` | string | finding のタイトル |
| `detail` | string | finding の詳細説明 |
| `status` | enum: `new` / `open` / `resolved` / `accepted_risk` / `ignored` | finding の現在の状態 |
| `severity` | enum: `high` / `medium` / `low` | フィルタ条件（high のみ抽出） |

### Gate 判定テーブル

| ledger.status | approve の動作 | 理由 |
|---------------|---------------|------|
| `has_open_high` | STOP | 未解決 high finding が存在 |
| `all_resolved` | PASS | 全 finding が解決済み |
| `in_progress` | PASS | 未解決はあるが high は 0 件 |
| その他 / 不明 | STOP | 不正な状態 |

### Blocking status テーブル（high finding）

| finding.status | gate 上の扱い | 説明 |
|----------------|-------------|------|
| `new` | blocking | 初回検出、未解決 |
| `open` | blocking | 2 ラウンド以上未解決 |
| `accepted_risk` | blocking | リスク受容しても high はブロック |
| `ignored` | blocking | 無視しても high はブロック |
| `resolved` | non-blocking | 解決済み |
