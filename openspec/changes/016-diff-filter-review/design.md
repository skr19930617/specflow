<!-- Historical Migration
  Source: specs/016-diff-filter-review/plan.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Implementation Plan: レビュー対象 Diff フィルタリング

**Branch**: `016-diff-filter-review` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-diff-filter-review/spec.md`

## Summary

Codex レビュー時に diff が長すぎてスタックする問題を解決する。`specflow.impl_review.md` と `specflow.fix.md` の diff 生成ロジックにフィルタリング層を追加し、完全削除ファイル・リネームのみファイルをデフォルト除外、`config.env` の `DIFF_EXCLUDE_PATTERNS` によるカスタム除外、行数警告閾値 `DIFF_WARN_THRESHOLD` を実装する。

## Technical Context

**Language/Version**: Bash (POSIX + bashisms), Markdown (Claude Code slash commands)
**Primary Dependencies**: Claude Code CLI, Codex CLI (MCP server), git, specflow slash commands
**Storage**: File-based — `config.env`, `review-ledger.json`, slash command `.md` files
**Testing**: 手動テスト（git リポジトリでの diff フィルタリング動作確認）
**Target Platform**: macOS / Linux (CLI)
**Project Type**: CLI tool (slash command system)
**Performance Goals**: フィルタリング処理が体感できないレベル（< 1 秒）
**Constraints**: 既存の `:(exclude)` パスフィルタと共存、`.specflow/` 内のファイルは読み取り専用
**Scale/Scope**: 2 つの slash command ファイル（`specflow.impl_review.md`, `specflow.fix.md`）への変更 + 1 つの新規 Bash スクリプト

## Constitution Check

Constitution はテンプレートのみのため、gate check はスキップ。

## Project Structure

### Documentation (this feature)

```text
specs/016-diff-filter-review/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
bin/
└── specflow-filter-diff     # 新規: diff フィルタリングスクリプト

global/
├── specflow.impl_review.md  # 変更: フィルタリングロジック追加
└── specflow.fix.md          # 変更: フィルタリングロジック追加

template/.specflow/
└── config.env               # 変更: DIFF_EXCLUDE_PATTERNS, DIFF_WARN_THRESHOLD の初期値追加
```

**Structure Decision**: 既存の `bin/` ディレクトリに Bash スクリプトを追加し、既存の `global/` slash command ファイルを修正する。フィルタリングロジックは再利用可能な独立スクリプト `specflow-filter-diff` に切り出す。

## Implementation Approach

### アーキテクチャ

```
既存フロー:
  git diff → (raw diff) → Codex MCP prompt

新フロー:
  git diff → specflow-filter-diff → (filtered diff) → 行数チェック → Codex MCP prompt
                ↓
          フィルタサマリー表示
```

### Phase 1: `specflow-filter-diff` スクリプト（P1 + P2）

新規 Bash スクリプト `bin/specflow-filter-diff` を作成:

**入力**: 
- 引数: 既存の `:(exclude)` pathspec をそのまま引数として受け取る（例: `specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify' ...`）。スクリプト内部で `git diff` を実行する際にこれらの pathspec をそのまま転送する
- 環境変数: `DIFF_EXCLUDE_PATTERNS`（オプション、コロン区切り glob パターン）

**処理**:
1. `git diff --name-status -M100 <受け取った pathspec>` でファイル一覧と変更タイプを取得（`-M100` でリネーム検出の similarity threshold を 100% に設定）
2. 各ファイルをフィルタリング:
   - `D`（deleted）ステータス → 除外（完全削除ファイル）
   - `R100`（rename, similarity 100%）ステータス → 除外（リネームのみ）
   - `DIFF_EXCLUDE_PATTERNS` のパターンマッチ → 除外（FR-002）
3. **不正パターン処理（FR-006）**: `DIFF_EXCLUDE_PATTERNS` の各パターンを事前検証する。bash の `[[ "test" == $pattern ]]` を eval して構文エラーが出るパターン（閉じていないブラケット等）はスキップし、警告を stderr に出力する。空文字列パターンは無視する。有効なパターンのみでマッチングを実行する
4. 除外されたファイルのサマリーを stderr に JSON 出力
5. フィルタリング後のファイルリストで `git diff <受け取った pathspec> -- <included files>` を再実行し、フィルタ後の diff を stdout に出力

**出力**:
- stdout: フィルタリング後の diff テキスト
- stderr: 除外サマリー（JSON 形式、最終行に 1 行で出力）。FR-006 の不正パターン警告は JSON の `warnings` 配列に内包する（テキスト警告を JSON とは別に stderr に出さない）。呼び出し側は stderr の最終行を `tail -1` で取得し JSON パースする
- exit code: 0（正常）、1（エラー）

**統合契約（FR-005 共存方式）**: `specflow-filter-diff` は既存の `:(exclude)` pathspec を透過的に転送する。slash command 側では現在の `git diff -- . ':(exclude).specflow' ...` の `git diff` 部分を `specflow-filter-diff` に置き換えるだけでよい。pathspec の構成は slash command 側が担当し、スクリプトはそれを忠実に git に渡す

### Phase 2: slash command への統合（P1 + P2）

`specflow.impl_review.md` と `specflow.fix.md` の diff 生成部分を変更:

**変更前**:
```bash
git diff -- . ':(exclude).specflow' ':(exclude).specify' ...
```

**変更後**:
```
1. source config.env で DIFF_EXCLUDE_PATTERNS と DIFF_WARN_THRESHOLD を読み込み
2. specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify' ... を実行
   （既存の :(exclude) pathspec をそのまま引数として渡す）
3. stderr の JSON サマリーをパースし、除外ファイルがあればサマリー表示
4. diff が空なら「レビュー対象の変更がありません」と表示しレビューをスキップ → handoff
5. フィルタ後 diff の総行数（JSON の total_lines）が DIFF_WARN_THRESHOLD を超えている場合:
   a. 警告メッセージを表示:
      「フィルタリング後の diff が {total_lines} 行あります（閾値: {threshold} 行）。
       Codex がスタックする可能性があります。」
   b. AskUserQuestion ツールで続行確認:
      - 「続行」: そのまま Codex レビューを実行
      - 「中止」: レビューをスキップし handoff に進む
6. フィルタ後の diff を Codex MCP に渡す
```

### Phase 3: config.env テンプレート更新（P3）

`template/.specflow/config.env` に以下を追加:
```bash
# Diff filter: colon-separated glob patterns to exclude from review
# DIFF_EXCLUDE_PATTERNS=""

# Diff size warning threshold (line count)
# DIFF_WARN_THRESHOLD=1000
```

## Key Design Decisions

1. **独立スクリプト方式**: フィルタリングロジックを `specflow-filter-diff` に切り出す。`impl_review` と `fix` の両方から共通利用でき、単体テストも容易。

2. **`git diff --name-status` による判定**: `--diff-filter=D` で完全削除、`R100` でリネームのみを検出。git 自体の判定に依拠するため正確性が高い。

3. **既存フィルタとの共存**: 既存の `:(exclude)` pathspec はそのまま維持。新フィルタは git の出力を後処理する形で追加するため、干渉しない。

4. **コロン区切りパターン**: `config.env` は shell 変数なのでスペースを含むパターンとの互換性を考慮し、コロン `:` を区切り文字に採用（PATH 変数と同様の慣例）。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| フィルタリングで重要な変更を見落とす | High | 除外サマリーを必ず表示し、ユーザーが確認できるようにする |
| `git diff --name-status` と `git diff` の結果不整合 | Medium | 同一のベースコミットと pathspec を両方のコマンドに渡す |
| パターンが不正で予期しないファイルが除外される | Medium | 不正パターンはスキップし警告表示、fnmatch でマッチング |

## Complexity Tracking

複雑性の増加なし。既存パターンに沿った実装。
