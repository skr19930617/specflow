## Context

specflow の autofix ループは `specflow.review_apply` と `specflow.review_design` が管理し、`specflow.fix_apply` / `specflow.fix_design` を繰り返し呼び出す。現在、ループの停止条件として以下の 3 つの divergence ゲートが即停止を引き起こす:

- **5b**: 同種 high finding の再発（resolved → 再出現）
- **5c**: quality gate スコア悪化（`current_score > previous_score`）
- **5d**: new high finding 増加（round 2 以降）

また、`specflow.fix_apply` / `specflow.fix_design` の autofix モードでは ledger が見つからない・破損している場合に即停止する。

これらの即停止は修正過程での一時的なスコア変動でも発動するため、autofix ループが本来の回数に達する前に停止してしまう。

## Goals / Non-Goals

**Goals:**

- divergence 検出（5b, 5c, 5d）時にループを即停止せず、警告ログに記録して `MAX_AUTOFIX_ROUNDS` まで継続する
- ledger 破損・欠損時に autofix モードでも自動再初期化してループを継続する
- ループ終了サマリーに各ラウンドの divergence 警告履歴を含める
- `specflow.review_apply` と `specflow.review_design` の両方に同じ変更を適用する

**Non-Goals:**

- `MAX_AUTOFIX_ROUNDS` のデフォルト値変更（4 を維持）
- divergence 検出ロジック自体の変更（検出条件は据え置き、検出後の挙動のみ変更）
- 通常モード（非 autofix）のフローへの影響
- success check（5a）や max rounds check（5e）の挙動変更

## Decisions

### Decision 1: divergence を警告ログとして記録し、即停止条件から除外

**選択**: `divergence_detected = true` 設定を削除し、代わりに `divergence_warnings[]` 配列に警告を追加する。ループの WHILE 条件から `NOT divergence_detected` を除外する。

**理由**: 修正は非線形なプロセスであり、一時的なスコア悪化は正常。即停止は過剰反応であり、規定回数まで回すことで自己修復の機会を与える。

**代替案**:
- 猶予回数（grace period）を設ける → 複雑さが増す割にメリットが少ない
- スコア悪化の閾値を設ける → 適切な閾値の決定が困難

### Decision 2: ledger 欠損・破損時の自動再初期化

**選択**: autofix モードの fail-fast を削除し、以下の 2 ケースで空の ledger を新規作成して継続する:
- **ledger ファイルが存在しない場合（欠損）**: 空の ledger を新規作成して継続。警告メッセージを表示。
- **ledger ファイルが存在するが JSON パースに失敗した場合（破損）**: 破損ファイルを `.corrupt` にリネームして退避した上で、空の ledger を新規作成して継続。警告メッセージを表示。

いずれの場合も全 findings は `new` として扱う。

**理由**: ledger は回復可能なデータであり、全 findings を new として扱えば最悪でも重複修正が発生するだけで安全。即停止よりもループ継続の価値が高い。破損ファイルの `.corrupt` 退避は、後からデバッグできるようにするため（通常モードの既存動作と同様）。

### Decision 3: divergence 警告とスコア推移の記録形式

**選択**: ループ変数に以下の 2 つの配列を追加:
- `divergence_warnings[]`: 各ラウンドで検出された divergence を `{ round, type, detail }` として記録
- `round_scores[]`: 各ラウンド終了時のスコアスナップショットを `{ round, score, unresolved_high, new_high }` として記録

ループ終了サマリーでは両方を表示し、divergence 警告と合わせてスコアの推移をユーザーが確認できるようにする。

**理由**: ループ終了後にユーザーが判断材料として参照できるようにする。divergence 警告だけでなくスコア推移を含めることで、修正の進捗が改善傾向にあるのか発散傾向にあるのかを定量的に把握できる。

## Risks / Trade-offs

- **[修正の発散]** divergence が本当に発散しているケースでも MAX_AUTOFIX_ROUNDS まで回すため、無駄なラウンドが増える可能性がある → 最大 4 回なのでコスト影響は限定的。警告ログで発散傾向が確認できるため、ユーザーは次回の判断に活用できる
- **[ledger 再初期化によるデータロス]** 以前の review 履歴が失われる → 破損時点で既にデータは信頼できないため、new として再スキャンする方が安全。サマリーに再初期化した旨を記録する
- **[review_apply と review_design の同期]** 両ファイルに同じ変更を適用する必要がある → 変更箇所が明確（ループ変数初期化・WHILE 条件・停止条件チェック・サマリー）なので漏れリスクは低い
