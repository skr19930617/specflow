# Research: Codex impl re-review classification

## R1: 既存 review-ledger データモデルとの統合

**Decision**: 002-review-ledger の既存データモデル（Finding, RoundSummary, Matching Algorithm）を基盤として使い、re-review prompt の出力を分類形式に拡張する。ledger のスキーマに `max_finding_id` を追加する。

**Rationale**: 002 で定義済みの Finding エンティティは id, severity, category, file, title, detail, status, relation 等を持ち、re-review の出力スキーマ（resolved/still_open/new_findings）と互換性がある。既存の Matching Algorithm が file + category + severity でマッチングするため、re-review prompt 側で分類を行い、呼び出し側で ledger を更新する二段構成が最もシンプル。

**Alternatives considered**:
- Codex に ledger 更新まで任せる → LLM の出力が不安定になるため却下
- 002 のデータモデルを全面置換する → 不要な破壊的変更

## R2: Re-review prompt の設計パターン

**Decision**: 初回 review prompt (`review_impl_prompt.txt`) とは別ファイル (`review_impl_rereview_prompt.txt`) として作成する。prompt 内で前回 findings を PREVIOUS_FINDINGS セクションとして渡し、分類を指示する。

**Rationale**: 初回 prompt の互換性を完全に維持でき、re-review 固有の指示（分類ルール、ID 採番）を独立して管理できる。

**Alternatives considered**:
- 1 ファイルで条件分岐 → prompt が複雑化し、LLM の出力精度が低下するリスク

## R3: split/merge の扱い

**Decision**: split/merge 時は元 finding を still_open として扱い（note に分裂先を記載）、分裂後の finding を new_findings とする。次回 ledger では元 finding を除外し、new_findings のみ持ち越す。

**Rationale**: 元 finding を still_open に分類することで FR-009（排他的・網羅的分類）を満たしつつ、次回 ledger では canonical な findings のみ残すことで重複を防ぐ。

**Alternatives considered**:
- 元 finding を resolved + note で記録 → 実際には未解決なので意味が変わる
- 元 finding をそのまま次回 ledger に残す → 重複が発生する

## R4: ledger_error 時の ID 採番

**Decision**: `ledger_error=true` の場合、信頼できる max_finding_id がないため、Codex には ID 採番のヒントを渡さず、F1 から採番させる。ledger 更新時は new_findings の最大 ID を max_finding_id とする。

**Rationale**: 破損 ledger からの max_finding_id 復元は信頼性がなく、ベストエフォートで旧 ID と衝突する可能性がある。ID 空間をリセットする方が安全。ledger_error フラグで呼び出し側が異常を検知できるため、必要に応じて手動介入も可能。

**Alternatives considered**:
- ベストエフォートで旧 ID から復元 → 不確実で実装が複雑
- re-review を中止する → fix loop が中断するため望ましくない
