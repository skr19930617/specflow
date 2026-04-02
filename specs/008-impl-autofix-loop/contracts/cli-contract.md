# CLI Contract: Auto-fix Loop

## Modified Commands

### `/specflow.impl` (modified)

既存のハンドオフセクションに auto-fix loop のエントリポイントを追加。

**入力**: なし（既存フローの延長）
**トリガー**: Codex Implementation Review 完了後、ledger の `status` が `has_open_high`

**Auto-fix loop の動作**:

1. ループ開始条件: `status == "has_open_high"` AND `current_round < max_rounds`
2. 各ラウンド: `specflow.fix` を Skill ツールで呼び出す
3. ラウンド完了後: ledger を再読み込みし、発散検知 → 継続/停止を判定
4. ループ終了後: 停止理由に応じたハンドオフ UI を表示

**出力**（ラウンドごと）:
```
Auto-fix Round {n}/{max_rounds}:
  - Unresolved high: {count} ({delta} from previous)
  - Severity score: {score} ({delta} from previous)
  - New high findings: {count}
  - Status: {continuing | stopped: <reason>}
```

**出力**（ループ終了時）:
```
Auto-fix Loop Complete:
  - Total rounds: {n}
  - Result: {success | stopped}
  - Reason: {unresolved high = 0 | max rounds reached | divergence: <type>}
  - Remaining unresolved high: {count}
```

**ハンドオフ**（ループ終了後）:
- 成功時（high = 0）: "Approve & Commit" / "Reject"
- 停止時（high > 0）: "Fix All (manual)" / "Approve & Commit" / "Reject"

### `/specflow.fix` (unchanged)

既存のまま。auto-fix loop から Skill ツール経由で呼び出される。
1 ラウンド分の fix → re-review → ledger update を実行する。

## Configuration

### `.specflow/config.env`

```bash
# Auto-fix loop の最大ラウンド数（デフォルト: 4、範囲: 1〜10）
# export SPECFLOW_MAX_AUTOFIX_ROUNDS=4
```
