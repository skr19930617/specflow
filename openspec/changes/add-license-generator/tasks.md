# Tasks: specflow.license コマンド

## Phase 1: コマンドファイル作成

### Task 1: コマンドの基本構造を作成 ✅
- **ファイル**: `global/commands/specflow.license.md`
- **内容**: YAML frontmatter、User Input セクション、Prerequisites（specflow-analyze と gh の存在確認）
- **優先度**: P0
- **依存**: なし

### Task 2: Step 1 — プロジェクト解析 ✅
- **内容**: `specflow-analyze .` を Bash で実行し、JSON 出力を `ANALYZE_RESULT` に格納。エラー時は STOP。解析結果のサマリーを表示（Languages, Frameworks, License）
- **優先度**: P0
- **依存**: Task 1

### Task 3: Step 2 — 既存ライセンスチェック ✅
- **内容**:
  - `ANALYZE_RESULT.license` が非 null → AskUserQuestion で上書き確認（「上書きする」/「キャンセル」）。キャンセル時はコマンド終了
  - マニフェスト（package.json / Cargo.toml / pyproject.toml）の既存 license フィールドを Read で確認し、存在すれば参考情報として表示
- **優先度**: P0
- **依存**: Task 2

### Task 4: Step 3 — ライセンス説明テーブル表示 ✅
- **内容**: 7種類のライセンスを UI ラベル・説明・主な特徴のテーブルで表示
- **優先度**: P0
- **依存**: Task 3

### Task 5: Step 4 — おすすめ提示とライセンス選択（2段階） ✅
- **内容**:
  - おすすめロジック（proposal.md の優先度テーブル）に基づき推奨ライセンスを理由とともに提示
  - **Stage 1**: AskUserQuestion でカテゴリ選択（「寛容系ライセンス」/「コピーレフト系ライセンス」/「パブリックドメイン」）。推奨カテゴリに (Recommended) を付与
  - **Stage 2**: 選択されたカテゴリ内の個別ライセンスを AskUserQuestion のボタンで表示:
    - 寛容系: MIT / Apache 2.0 / BSD 2-Clause / ISC（4つ）
    - コピーレフト系: GPL 3.0 / AGPL 3.0（2つ）
    - パブリックドメイン: Unlicense（1つ、確認のみ）
  - 推奨ライセンスに (Recommended) を付与。Rust の場合は MIT と Apache 2.0 の両方に推奨理由を表示
- **優先度**: P0
- **依存**: Task 4

### Task 6: Step 5 — 著者名・年の取得 ✅
- **内容**:
  - `git config user.name` を Bash で取得
  - 空の場合は AskUserQuestion（オプションなし、フリーテキスト）で入力を求める。質問テキストに `例: git config user.name "Your Name" で設定できます` を含める
  - 空入力は最大3回リトライ。その後は `<AUTHOR>` プレースホルダーを使用し、`"⚠ 著者名が未設定のため <AUTHOR> プレースホルダーを使用しました。LICENSE ファイル内の <AUTHOR> を手動で置換してください"` と表示する
  - キャンセル/dismiss 時も `<AUTHOR>` プレースホルダーを使用し同じ警告メッセージを表示する
  - 現在の年は `date +%Y` で取得
- **優先度**: P0
- **依存**: Task 5

### Task 7: Step 6 — ライセンス全文取得と置換 ✅
- **内容**:
  - `gh api /licenses/{GitHub API ID} --jq '.body'` でライセンス全文を取得
  - API 失敗時はエラー表示 + リトライ案内
  - `body` に `[year]` / `[fullname]` が含まれる場合のみ置換
- **優先度**: P0
- **依存**: Task 6

### Task 8: Step 7 — LICENSE ファイル生成 ✅
- **内容**: Write ツールで `LICENSE` ファイルを生成。生成完了を報告
- **優先度**: P0
- **依存**: Task 7

## Phase 2: マニフェスト更新

### Task 9: Step 8 — package.json 更新 ✅
- **内容**:
  - `package.json` を Read。存在しなければスキップ
  - 既存 `"license"` フィールドを確認
  - 同一 SPDX → スキップ。異なる → AskUserQuestion で確認
  - Edit で `"license": "<SPDX-ID>"` を設定
- **優先度**: P1
- **依存**: Task 8
- **並列可能**: Task 10, Task 11 と並列不可（AskUserQuestion が逐次のため）

### Task 10: Step 8 — Cargo.toml 更新 ✅
- **内容**:
  - `Cargo.toml` を Read。存在しなければスキップ
  - `[package]` テーブルが存在しなければスキップ
  - 既存 `license` フィールドを確認。同一 → スキップ。異なる → AskUserQuestion で確認
  - Edit で `[package]` 内の `license = "<SPDX-ID>"` を設定
- **優先度**: P1
- **依存**: Task 8

### Task 11: Step 8 — pyproject.toml 更新 ✅
- **内容**:
  - `pyproject.toml` を Read。存在しなければスキップ
  - `[project]` テーブルが存在しなければスキップ
  - 既存 `license` フィールドを確認:
    - テーブル形式（`{text = "..."}` 等）→ スキップ + 警告表示
    - 文字列形式で同一 → スキップ
    - 文字列形式で異なる → AskUserQuestion で確認
  - Edit で `[project]` 内の `license = "<SPDX-ID>"` を設定
- **優先度**: P1
- **依存**: Task 8

## Phase 3: 仕上げ

### Task 12: Step 9 — 結果報告 ✅
- **内容**: 生成した LICENSE ファイルのパス、選択されたライセンス、更新したマニフェストの一覧を報告
- **優先度**: P1
- **依存**: Task 9, 10, 11

### Task 13: specflow-install 対応確認 ✅
- **内容**: `bin/specflow-install` が `global/commands/specflow.license.md` を `~/.claude/commands/` にコピーする既存ロジックでカバーされることを確認（`specflow.*.md` のグロブパターン）
- **優先度**: P2
- **依存**: Task 1
