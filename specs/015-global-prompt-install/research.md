# Research: 015-global-prompt-install

## R1: specflow ファイル配布メカニズム

**Decision**: `specflow-install` がリポジトリの `template/` と `global/` を `~/.config/specflow/` にコピーする。`specflow-init` はそこからプロジェクトに `.specflow/` をコピーし、`global/*.md` を `~/.claude/commands/` にインストールする。

**Rationale**: 既存のインストールフローを理解した上で、最小限の変更で prompt をグローバル化する方法を設計する。

**Alternatives considered**: 
- npm パッケージ化 → 不要。リポジトリクローン + スクリプトで十分
- 環境変数でパスを動的指定 → 過剰。`global/` がリポジトリ内で固定

## R2: prompt 参照箇所の全数調査

**Decision**: 以下の 7 箇所で `.specflow/review_*_prompt.txt` が参照されている:

| ファイル | 参照する prompt |
|----------|----------------|
| `global/specflow.spec_review.md:47` | `review_spec_prompt.txt` |
| `global/specflow.spec_fix.md:61` | `review_spec_prompt.txt` |
| `global/specflow.plan_review.md:56` | `review_plan_prompt.txt` |
| `global/specflow.plan_fix.md:68` | `review_plan_prompt.txt` |
| `global/specflow.impl_review.md:54` | `review_impl_prompt.txt` |
| `global/specflow.fix.md:96` | `review_impl_prompt.txt` |
| `global/specflow.fix.md:110` | `review_impl_rereview_prompt.txt` |

**Rationale**: 全箇所を特定してから一括更新する

## R3: prompt の Markdown 変換方針

**Decision**: 既存の `.txt` 内容はすでに構造化されたプレーンテキスト。拡張子を `.md` に変更するだけで内容の意味は保持される。必要に応じて Markdown 見出し・リストを追加して可読性を向上させる。

**Rationale**: Codex MCP は prompt を文字列として受け取るため、形式の違いは動作に影響しない

## R4: `specflow-init` テンプレートの更新

**Decision**: `~/.config/specflow/template/.specflow/` から `review_*_prompt.txt` を除去する必要がある。`specflow-install` 実行時にリポジトリの `template/` がそのまま `~/.config/specflow/template/` にコピーされるため、リポジトリの `template/.specflow/` から除去すれば自動的に反映される。

**Rationale**: `specflow-init` は `template/.specflow/` を丸ごとコピーするため、テンプレートから除去すれば新規プロジェクトに prompt が含まれなくなる

**Alternatives considered**:
- `specflow-init` スクリプトを変更して prompt だけ除外 → テンプレートから除去する方がシンプル
