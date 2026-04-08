## 1. ループ変数・WHILE 条件の変更

- [x] 1.1 `specflow.review_apply.md`: ループ変数初期化で `divergence_detected` と `divergence_reason` を削除し、`divergence_warnings = []` と `round_scores = []` を追加
- [x] 1.2 `specflow.review_apply.md`: WHILE 条件から `NOT divergence_detected` を削除（`WHILE autofix_round < MAX_AUTOFIX_ROUNDS AND NOT loop_success`）
- [x] 1.3 `specflow.review_design.md`: 同様にループ変数初期化で `divergence_detected` → `divergence_warnings = []` と `round_scores = []` に変更
- [x] 1.4 `specflow.review_design.md`: 同様に WHILE 条件から `NOT divergence_detected` を削除

## 2. 停止条件チェック（5b, 5c, 5d）を警告ログに変更

- [x] 2.1 `specflow.review_apply.md`: 5b（同種 high 再発）で `divergence_detected = true` を `divergence_warnings.push({ round: autofix_round, type: "finding_re_emergence", detail: "<matching title>" })` に変更
- [x] 2.2 `specflow.review_apply.md`: 5c（quality gate 悪化）で `divergence_detected = true` を `divergence_warnings.push({ round: autofix_round, type: "quality_gate_degradation", detail: "+<delta>" })` に変更
- [x] 2.3 `specflow.review_apply.md`: 5d（new high 増加）で `divergence_detected = true` を `divergence_warnings.push({ round: autofix_round, type: "new_high_increase", detail: "+<delta>" })` に変更
- [x] 2.4 `specflow.review_design.md`: 5b, 5c, 5d に同様の変更を適用

## 3. Ledger 破損時の自動再初期化

- [x] 3.1 `specflow.fix_apply.md`: autofix mode fail-fast セクションを変更 — ledger 欠損時に即停止ではなく空 ledger を新規作成して継続。警告メッセージを表示
- [x] 3.2 `specflow.fix_apply.md`: autofix mode fail-fast セクションを変更 — ledger 破損時に `.corrupt` にリネームし空 ledger を新規作成して継続。警告メッセージを表示
- [x] 3.3 `specflow.fix_design.md`: autofix mode fail-fast セクションに同様の変更を適用（review-ledger-design.json 対象）

## 4. ループ完了サマリーに警告履歴を追加

- [x] 4.1 `specflow.review_apply.md`: ループ完了サマリーに divergence_warnings の表示を追加（round, type, detail の一覧）
- [x] 4.2 `specflow.review_apply.md`: ループ後のハンドオフ状態判定の reason 表示を更新（divergence が停止理由にならなくなるため）
- [x] 4.3 `specflow.review_design.md`: 同様にループ完了サマリーとハンドオフ状態判定を更新

## 5. ラウンドごとのスコア記録と結果表示の更新

- [x] 5.1 `specflow.review_apply.md`: 追跡変数更新（ステップ6）の後に `round_scores.push({ round: autofix_round, score: current_score, unresolved_high: <count>, new_high: current_new_high_count })` を追加
- [x] 5.2 `specflow.review_apply.md`: ラウンド結果表示に divergence 警告があればその内容を含める
- [x] 5.3 `specflow.review_design.md`: 同様にスコア記録とラウンド結果表示を更新

## 6. ループ完了サマリーにスコア推移を追加

- [x] 6.1 `specflow.review_apply.md`: ループ完了サマリーに `round_scores` のスコア推移テーブルを追加（round, score, unresolved_high, new_high）
- [x] 6.2 `specflow.review_design.md`: 同様にスコア推移テーブルを追加
