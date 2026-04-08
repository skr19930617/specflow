## Why

autofix ループ（`specflow.review_apply` / `specflow.review_design` が管理）が、ゲートの一時的な悪化で意図せず早期停止してしまう。現在の実装では quality gate 悪化・finding 再発・new high 増加のいずれかを検出すると即座にループを中断するが、修正過程での一時的なスコア変動は正常であり、規定回数（`MAX_AUTOFIX_ROUNDS`）までは継続すべきである。

## What Changes

- **autofix ループの継続条件を緩和**: quality gate 悪化・finding 再発・new high 増加を検出しても、即座に停止せず警告ログに記録してループを継続する（MAX_AUTOFIX_ROUNDS = 4 まで必ず回す）
- **divergence 検出を警告ログに変更**: 現在 `divergence_detected = true` で即停止している箇所（5b, 5c, 5d）を、警告ログとして記録しつつループを継続するよう変更。即停止条件から除外する
- **ledger 破損時の自動再初期化**: autofix モードで ledger が見つからない・破損している場合、即停止ではなく ledger を新規作成し全 findings を new として扱いループを継続する
- **ループ終了時のサマリーに警告履歴を含める**: 規定回数到達時に、各ラウンドの divergence 警告とスコア推移を含むサマリーを表示（例: 「Round 2: quality gate 悪化 (+3)、Round 3: finding 再発 1件」）
- **MAX_AUTOFIX_ROUNDS のデフォルト値は 4 を維持**: 変更なし

## Capabilities

### New Capabilities

- `autofix-continuation`: autofix ループの継続制御ロジック。divergence 検出時の即停止を抑制し、規定回数まで継続する仕組み

### Modified Capabilities

(なし — 既存 spec のrequirement 変更なし)

## Impact

- `global/commands/specflow.review_apply.md` — autofix ループの gate 判定ロジック（5b, 5c, 5d の divergence 判定）
- `global/commands/specflow.review_design.md` — 同様の autofix ループ gate 判定ロジック
- `global/commands/specflow.fix_apply.md` — autofix モード時の制御フロー
- `global/commands/specflow.fix_design.md` — autofix モード時の制御フロー
- 既存の API・外部依存への影響なし
