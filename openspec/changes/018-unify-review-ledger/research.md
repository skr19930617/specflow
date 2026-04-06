# Research: spec/planレビューをimpl方式のレビュー台帳に統一する

## R1: spec/plan review コマンドの現状と変更箇所

### Decision
既存の4コマンド（spec_review, spec_fix, plan_review, plan_fix）にledger記録ロジックを追加する。impl_reviewの既存ロジックを参照テンプレートとして使用するが、コードの重複は許容する（Markdown slash commandなので共有不可）。

### Rationale
- 各コマンドはMarkdown slash commandファイルであり、共通ロジックの抽出が困難
- impl_reviewの実装が十分に安定しており、同じパターンを適用すれば動作が保証される
- ファイル名を分けることでimpl ledgerとの完全な独立性を維持

### Alternatives Considered
- 共通テンプレートの作成 → Markdown slash commandでは不可能
- 1つの統合コマンドに集約 → ワークフローの柔軟性が失われる

## R2: review-ledger ファイルの分離戦略

### Decision
phase別に独立ファイル: `review-ledger-spec.json`, `review-ledger-plan.json`, `review-ledger.json`（impl、既存）

### Rationale
- マイグレーション不要（既存のimpl ledgerに一切触れない）
- 同一JSONスキーマを使用するため、既存のledger処理ロジック（マッチングアルゴリズム、バックアップ・リカバリ等）がそのまま適用可能
- specflow-filter-diffの除外パターンに`review-ledger-*.json`を追加するだけで対応可能

### Alternatives Considered
- 1ファイルにphases構造でネスト → スキーマ変更とマイグレーションが必要
- phase別ディレクトリ → ファイル探索が複雑化

## R3: spec reviewのauto-fix方針

### Decision
spec reviewではauto-fixループなし。severity "low" のfindingのみ単発で自動適用し、ledger上でresolvedに更新（再レビューなし）。medium以上はユーザー確認で手動修正。

### Rationale
- specは仕様文書であり、自動修正による意図しない仕様変更を防ぐ
- lowの自動適用はtypo修正等の低リスクな変更に限定される
- ユーザーの明示的な設計判断

### Alternatives Considered
- 完全手動（lowも手動） → 作業効率が低下
- implと同じ完全auto-fix → 仕様の意図しない変更リスク

## R4: plan reviewのauto-fix方針

### Decision
plan reviewではimplと同じauto-fixループを有効化。divergence detection含む。

### Rationale
- planはimplに近い性質を持つ（構造化された実装ガイド）
- auto-fixによる自動修正が効果的
- ユーザーの明示的な判断

## R5: 可視化コマンドの実装方針

### Decision
新規slash command `/specflow.dashboard` をMarkdownファイルとして作成。CLI + Markdown出力。

### Rationale
- 既存のspecflowコマンド体系に統合
- specs/配下のledgerファイルをjqで集計しテーブル化
- review-dashboard.mdはgitで追跡可能

### Alternatives Considered
- bin/スクリプト → slash commandの方がワークフローに統合しやすい
- 外部ツール → 追加依存を避ける

## R6: specflow-filter-diffの変更

### Decision
除外パターンに `review-ledger-spec.json`, `review-ledger-plan.json` を追加。

### Rationale
- 既に `*/review-ledger.json` は除外されている
- 新しいledgerファイルも同様にdiffから除外する必要がある

## R7: current-phase.mdの拡張

### Decision
既存のcurrent-phase.md生成ロジックをspec/plan reviewにも適用。phaseフィールドに"spec-review"/"plan-review"を設定。

### Rationale
- 全phaseで統一的な状態スナップショットを提供
- 既存のフォーマットがそのまま適用可能
