<!-- Historical Migration
  Source: specs/016-diff-filter-review/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: レビュー対象 Diff フィルタリング

**Feature Branch**: `016-diff-filter-review`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: GitHub Issue #37 — "diffが長すぎるとcodexが止まる"

## Clarifications

### Session 2026-04-05

- Q: デフォルトで自動除外すべき diff カテゴリは？ → A: 完全削除ファイルに加え、リネーム（内容変更なし）もデフォルト除外対象とする
- Q: diff が大きすぎる場合の警告は？ → A: 行数ベースで警告を表示する（フィルタリング後の diff 行数が閾値を超えた場合）
- Q: 行数警告閾値のデフォルト値は？ → A: 1000 行。config.env の `DIFF_WARN_THRESHOLD` でカスタマイズ可能

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 大規模リファクタ後のレビュー実行 (Priority: P1)

ユーザーが大規模なリファクタリング（ファイル削除、リネーム、コード移動を含む）を行った後に `/specflow.impl` でレビューを実行する。Codex に送信される diff から削除専用のファイル diff やユーザーが指定した除外パターンに該当する diff が自動的にフィルタリングされ、レビューがタイムアウトせずに完了する。

**Why this priority**: diff が長すぎて Codex がスタックする問題の直接的な解決策。レビューが完了しないとワークフロー全体がブロックされるため最優先。

**Independent Test**: 削除ファイルを含む大きな diff がある状態でレビューを実行し、フィルタリング後の diff のみが Codex に送信されることを確認する。

**Acceptance Scenarios**:

1. **Given** 実装 diff に完全削除ファイル（git の `deleted file mode` に該当するファイル）が含まれている, **When** impl review を実行する, **Then** 完全削除ファイルの diff は Codex に送信される diff から除外される
2. **Given** 実装 diff にリネームのみ（内容変更なし）のファイルが含まれている, **When** impl review を実行する, **Then** リネームのみのファイルの diff は除外される
3. **Given** `.specflow/config.env` に `DIFF_EXCLUDE_PATTERNS` が設定されている, **When** impl review を実行する, **Then** 該当パターンにマッチするファイルの diff が除外される
4. **Given** フィルタリング後の diff が空になる, **When** impl review を実行する, **Then** 「レビュー対象の変更がありません」とユーザーに通知し、レビューをスキップする
5. **Given** フィルタリング後の diff が 1000 行を超える, **When** impl review を実行する, **Then** diff が大きい旨の警告が表示され、ユーザーが続行を選択できる
6. **Given** 既存ファイルから行を削除しただけの変更（deletion-only patch、ファイル自体は残る）がある, **When** impl review を実行する, **Then** その変更はフィルタリングされずレビュー対象に含まれる

---

### User Story 2 - フィルタリング結果の可視化 (Priority: P2)

ユーザーがレビュー実行時に、どのファイルがフィルタリングで除外されたかを確認できる。除外理由とともにサマリーが表示され、意図しない除外がないか検証できる。

**Why this priority**: フィルタリングが正しく動作していることをユーザーが確認できないと、重要な変更が見落とされるリスクがある。

**Independent Test**: フィルタリングが適用される diff でレビューを実行し、除外ファイル一覧と理由が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** diff フィルタリングで 1 件以上のファイルが除外された, **When** レビュー実行前の準備が完了する, **Then** 除外されたファイル名と除外理由（削除専用/リネームのみ/パターン一致）がサマリーとして表示される
2. **Given** フィルタリングで除外されたファイルがない, **When** レビューを実行する, **Then** フィルタサマリーは表示されない（静かにスキップ）

---

### User Story 3 - 除外パターンのカスタマイズ (Priority: P3)

ユーザーがプロジェクトごとにフィルタリング除外パターンを設定できる。ロックファイル、自動生成ファイル、テスト用フィクスチャなど、プロジェクト固有のファイルを除外対象に追加できる。

**Why this priority**: プロジェクトによって不要な diff の種類が異なるため、カスタマイズ性が必要。ただし、デフォルトの削除専用フィルタだけでも多くのケースに対応できるため P3。

**Independent Test**: `config.env` に除外パターンを追加し、そのパターンに一致するファイルの diff がレビューから除外されることを確認する。

**Acceptance Scenarios**:

1. **Given** `DIFF_EXCLUDE_PATTERNS` に `"*.lock"` が含まれている, **When** `package-lock.json` を変更してレビューを実行する, **Then** `package-lock.json` の diff が除外される
2. **Given** `DIFF_EXCLUDE_PATTERNS` が未設定, **When** レビューを実行する, **Then** デフォルトフィルタ（完全削除ファイルおよびリネームのみファイルの除外）が適用される

---

### Edge Cases

- フィルタリング後に diff が空になった場合 → レビューをスキップし、ユーザーに通知する
- 全ファイルが除外対象に該当する場合 → 同上（diff が空になるケースと同じ扱い）
- バイナリファイルの diff → git diff でバイナリは既にテキスト diff として表示されないため、追加対応不要
- `config.env` のパターン記法が不正な場合 → 不正パターンをスキップし、警告を表示して残りのパターンで続行する

## Scope

本機能のスコープは「自動フィルタ（完全削除・リネームのみ）と `config.env` による設定ベースのファイル単位除外」に限定する。実行時にユーザーが対話的にレビュー対象ファイルを選択する機能は含まない。フィルタリングの粒度はファイル単位とし、hunk（差分ブロック）単位のフィルタリングはスコープ外とする。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは impl review / fix re-review 時に、完全削除ファイル（git の `deleted file mode` に該当）およびリネームのみ（内容変更なし、similarity index 100%）のファイルを自動的に除外しなければならない。既存ファイルから行を削除しただけの変更（deletion-only patch）は除外対象外とする
- **FR-002**: システムは `config.env` の `DIFF_EXCLUDE_PATTERNS` 設定に基づき、glob パターンに一致するファイルの diff を除外しなければならない
- **FR-003**: システムはフィルタリング後の diff が空の場合、レビューをスキップしユーザーに通知しなければならない
- **FR-004**: システムはフィルタリングで除外されたファイルの一覧と除外理由をレビュー実行前に表示しなければならない
- **FR-005**: システムは既存の `:(exclude)` パスフィルタ（`.specflow/`, `.specify/` 等）と新しいフィルタを共存させなければならない
- **FR-006**: システムは `DIFF_EXCLUDE_PATTERNS` の各パターンが不正な場合、そのパターンをスキップし警告を表示しなければならない
- **FR-007**: システムはフィルタリング後の diff の総行数（Codex に送信する最終 diff テキストの改行数。diff header、hunk header、context 行、追加行、削除行をすべて含む）が `DIFF_WARN_THRESHOLD`（デフォルト: 1000 行）を超えた場合、ユーザーに警告を表示し続行確認を求めなければならない
- **FR-008**: `DIFF_WARN_THRESHOLD` は `config.env` でカスタマイズ可能でなければならない

### Key Entities

- **Diff Filter Config**: プロジェクトごとのフィルタリング設定。除外パターンリストと有効/無効フラグを持つ
- **Filter Result**: フィルタリング実行結果。除外ファイル一覧、除外理由、フィルタ後の diff 内容を持つ

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 完全削除ファイルを含む diff でレビューを実行した場合、Codex に送信される diff から完全削除ファイルが 100% 除外される
- **SC-002**: フィルタリング適用後、ユーザーが除外ファイル一覧を確認してからレビューが開始される
- **SC-003**: `DIFF_EXCLUDE_PATTERNS` に設定したパターンに一致するファイルが正しく除外される
- **SC-004**: フィルタリング処理自体がレビューワークフローに追加する遅延は体感できないレベルである
- **SC-005**: フィルタリング後の diff が 1000 行を超えた場合、警告が表示されユーザーが続行/中止を選択できる

## Assumptions

- 完全削除ファイルとは、git diff の出力で `deleted file mode` ヘッダを持つファイルを指す。既存ファイルから行を削除しただけの変更（deletion-only patch）は完全削除ファイルに該当しない
- リネームのみのファイルとは、git diff で rename として検出され、かつ内容の変更がないファイルを指す（similarity index 100%）
- `DIFF_EXCLUDE_PATTERNS` の書式は git pathspec の glob パターンに準拠する。複数パターンはコロン `:` 区切りで指定する（例: `*.lock:generated/**:vendor/**`）。各パターンは repo ルート相対のファイルパスに対してマッチする。クォートは不要（config.env の shell 変数として読み込まれるため、値全体をダブルクォートで囲む）。例: `DIFF_EXCLUDE_PATTERNS="*.lock:generated/**"`
- `DIFF_EXCLUDE_PATTERNS` のマッチ対象パスは以下のとおり: 通常変更・完全削除は変更対象のファイルパス、rename は新パス（移動先）に対してマッチする。マッチングには bash の `fnmatch` 相当のグロブ展開を使用する（`*` はディレクトリ区切りを跨がない、`**` は任意深度にマッチ）
- 「不正パターン」とは、glob として構文エラーとなるパターンを指す（例: 閉じられていないブラケット `[abc`、エスケープされていない特殊文字）。空文字列のパターン（コロン区切りの結果として生じる）は無視する
- フィルタリングは impl review と fix re-review の 2 つのワークフローに適用する（spec review、plan review は diff を使用しないため対象外）
- 既存の `:(exclude)` によるインフラファイル除外は変更せず、新しいフィルタリングはその上に追加する形とする
