# Research: speckit時代のレガシー排除

## Codebase Audit Results

### speckit 参照の全体像

プロジェクト全体で約 78 ファイル、300+ 箇所に「speckit」参照が存在する。

### カテゴリ別内訳

| カテゴリ | ファイル数 | 主な対象 |
|----------|-----------|---------|
| .claude/commands/speckit.*.md | 9 | コマンドファイルのリネーム/統合 |
| global/*.md | 12 | specflow コマンド内の speckit.* 呼び出し |
| .specify/ 内部 | 5 | テンプレート・スクリプト内の参照 |
| ROOT ドキュメント | 3 | README.md, CLAUDE.md, template/CLAUDE.md |
| openspec/changes/ 履歴 | 33+ | 過去の feature records |
| specs/ 履歴 | 複数 | review-ledger, approval-summary 等 |
| bin/ スクリプト | 2 | specflow-init, specflow-migrate-openspec.sh |

### 削除対象ファイル

- `bin/specflow-migrate-openspec.sh` — マイグレーションスクリプト
- `specs/020-openspec-migration/` — マイグレーション spec ディレクトリ
- `openspec/changes/020-openspec-migration/` — マイグレーション change records

### コマンド統合の設計判断

**Decision**: speckit.* → specflow.* に統合

| 現行 | アクション | 理由 |
|------|-----------|------|
| speckit.specify | リネーム → specflow.specify | 衝突なし |
| speckit.clarify | リネーム → specflow.clarify | 衝突なし |
| speckit.plan | 吸収 → specflow.plan | specflow.plan が既に speckit.plan を内部呼び出し |
| speckit.tasks | リネーム → specflow.tasks | 衝突なし |
| speckit.implement | 吸収 → specflow.impl | specflow.impl が既に speckit.implement を内部呼び出し |
| speckit.analyze | リネーム → specflow.analyze | 衝突なし |
| speckit.checklist | リネーム → specflow.checklist | 衝突なし |
| speckit.constitution | リネーム → specflow.constitution | 衝突なし |
| speckit.taskstoissues | リネーム → specflow.taskstoissues | 衝突なし |

**吸収の実装方針**: specflow.plan と specflow.impl は現在 `Read speckit.plan.md and follow its workflow` のように参照している。吸収後は、speckit.plan.md の内容を specflow.plan.md 内にインライン化するか、新名称の specflow.specify.md 等を参照するように変更する。

### .specify/ 内の更新対象

- `check-prerequisites.sh` — エラーメッセージ内の "speckit" を "specflow" に変更
- `templates/plan-template.md` — speckit.plan, speckit.tasks 等の参照を specflow.* に変更
- `templates/tasks-template.md` — 同上
- `templates/checklist-template.md` — 同上
- `init-options.json` — `speckit_version` キー名（外部依存の可能性を確認要）

### Alternatives Considered

1. **openspec.* にリネーム**: OpenSpec リポジトリ構造との整合性はあるが、specflow ブランドとの一貫性に欠ける。却下。
2. **speckit.* を維持**: issue の要件「全て排除」と矛盾。却下。
3. **段階的移行（deprecation warning）**: 過度に複雑。一括変更で十分。却下。
