# Feature Specification: ローカルにpromptを入れない — Prompt のグローバルインストール

**Feature Branch**: `015-global-prompt-install`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: GitHub Issue #25 — globalインストールdirにcodex向けpromptを入れたらいいと思う。txtも読みにくいのでmkdownで問題なければそうしてほしい

## Clarifications

### Session 2026-04-05

- Q: グローバル prompt ファイルの配置先は？ → A: リポジトリの `global/` ディレクトリ（ソース管理用）。`specflow-install` で `~/.config/specflow/global/` にコピーされる
- Q: ランタイムでの prompt 読み込み元は？ → A: `~/.config/specflow/global/review_*_prompt.md`（絶対パス）。スラッシュコマンドは `~/.claude/commands/` にインストールされるため、ユーザープロジェクトからの相対パスは使えない。`specflow-install` が `global/` を `~/.config/specflow/global/` にコピーするので、ここを参照する
- Q: Markdown 形式は確定か？ → A: 確定。Codex MCP は prompt を文字列として受け取るため、`.md` でも `.txt` でも動作に差はない。可読性向上のため `.md` を採用する
- Q: `/specflow.fix` の prompt 切替条件は？ → A: `review-ledger.json` の存在で判定。なし=初回 prompt、あり=再レビュー prompt
- Q: 既存プロジェクトの `.specflow/review_*_prompt.txt` は削除するか？ → A: 自動削除しない。レビューコマンドは常に `global/` を参照するため無視される

## User Scenarios & Testing

### User Story 1 - Prompt ファイルをグローバルディレクトリから読み込む (Priority: P1)

specflow のユーザーが `/specflow.spec_review`、`/specflow.plan_review`、`/specflow.impl_review` などのレビューコマンドを実行する際、Codex 向けの review prompt がプロジェクトローカルの `.specflow/` ではなく、specflow のグローバルインストールディレクトリから読み込まれる。ユーザーはプロジェクトごとに prompt ファイルを管理する必要がなくなる。

**Why this priority**: prompt ファイルの読み込み元変更が本 issue の核心であり、これが動かなければ他の変更は意味をなさない。

**Independent Test**: specflow のレビューコマンドを実行し、グローバルディレクトリから prompt が正しく読み込まれることを確認する。

**Acceptance Scenarios**:

1. **Given** specflow がインストール済みで prompt がグローバルディレクトリに存在する, **When** ユーザーが `/specflow.spec_review` を実行する, **Then** グローバルディレクトリの prompt ファイルが使用されレビューが正常に完了する
2. **Given** specflow がインストール済み, **When** グローバルディレクトリに prompt ファイルが存在しない, **Then** エラーメッセージが表示され、ユーザーに対処方法が案内される
3. **Given** specflow がインストール済み, **When** `/specflow.plan_review` または `/specflow.impl_review` を実行する, **Then** 対応するグローバル prompt が使用される

---

### User Story 2 - Prompt ファイルの Markdown 化 (Priority: P1)

現在 `.txt` 形式で管理されている review prompt ファイルが `.md`（Markdown）形式に変換される。これによりファイルの可読性が向上し、構造化された prompt の記述が容易になる。

**Why this priority**: Issue で明示的に要求されている改善であり、P1 の読み込み元変更と同時に対応すべき。

**Independent Test**: グローバルディレクトリの `.md` ファイルが正しく読み込まれ、レビューが正常に実行されることを確認する。

**Acceptance Scenarios**:

1. **Given** prompt ファイルが `.md` 形式でグローバルディレクトリに存在する, **When** レビューコマンドが実行される, **Then** `.md` ファイルの内容が正しく読み込まれ Codex に渡される
2. **Given** 既存の `.txt` prompt の内容, **When** `.md` 形式に変換する, **Then** prompt の意味・指示内容は変わらず、Markdown の構造化（見出し、リスト等）により可読性が向上する

---

### User Story 3 - プロジェクトローカルの `.specflow/` から prompt ファイルを除去 (Priority: P2)

prompt ファイルがグローバルに移動した後、プロジェクトローカルの `.specflow/` ディレクトリから `review_*_prompt.txt` ファイルが不要になる。新規プロジェクト初期化時にこれらのファイルが作成されなくなる。

**Why this priority**: グローバル化が完了した後のクリーンアップであり、機能的には P1 が先に完了している必要がある。

**Independent Test**: 新規プロジェクトを初期化した際に `.specflow/` に prompt ファイルが含まれないことを確認する。

**Acceptance Scenarios**:

1. **Given** specflow リポジトリから `review_*_prompt.txt` が除去済み, **When** 新規プロジェクトで specflow を初期化する, **Then** `.specflow/` に `review_*_prompt.txt` ファイルが作成されない
2. **Given** 既存プロジェクトに `.specflow/review_*_prompt.txt` が残っている, **When** レビューコマンドを実行する, **Then** ローカルファイルは無視され、グローバルの prompt が使用される

---

### Edge Cases

- グローバルインストールディレクトリが見つからない場合はどうなるか？ → エラーメッセージで specflow の再インストールを案内する
- prompt ファイルの一部だけがグローバルディレクトリに存在する場合は？ → 不足ファイルについて個別にエラーを表示する
- specflow のバージョンアップで prompt の内容が変わった場合は？ → グローバルディレクトリのファイルはインストール時に更新される

## Requirements

### コマンド → Prompt マッピング

| コマンド | 使用する Prompt ファイル（`global/` 内） |
|----------|----------------------------------------|
| `/specflow.spec_review` | `review_spec_prompt.md` |
| `/specflow.spec_fix` | `review_spec_prompt.md` |
| `/specflow.plan_review` | `review_plan_prompt.md` |
| `/specflow.plan_fix` | `review_plan_prompt.md` |
| `/specflow.impl_review` | `review_impl_prompt.md` |
| `/specflow.fix` (ledger なし) | `review_impl_prompt.md` |
| `/specflow.fix` (ledger あり) | `review_impl_rereview_prompt.md` |

**`/specflow.fix` の prompt 切替条件**: `FEATURE_DIR/review-ledger.json` の存在と内容で判定する。ファイルが存在しない場合は初回レビュー（`review_impl_prompt.md`）を使用。ファイルが存在し JSON が有効な場合は再レビュー（`review_impl_rereview_prompt.md`）を使用。ファイルが破損している場合も再レビュー prompt を空の findings で使用する。

### Functional Requirements

- **FR-001**: レビューコマンド（spec_review, plan_review, impl_review, spec_fix, plan_fix, fix）は、prompt ファイルを `~/.config/specflow/global/` から読み込まなければならない
- **FR-002**: prompt ファイルの拡張子は `.txt` から `.md` に変更されなければならない
- **FR-003**: specflow のスラッシュコマンドファイル（`global/specflow.*.md`）内の prompt 参照パスを `.specflow/review_*_prompt.txt` から `~/.config/specflow/global/review_*_prompt.md` に更新しなければならない
- **FR-004**: `global/` に必要な prompt ファイルが存在しない場合、明確なエラーメッセージを表示しなければならない
- **FR-005**: 既存の prompt 内容は `.md` 形式に変換する。Codex MCP は prompt を文字列として受け取るため形式の違いは動作に影響しない。指示内容の意味は保持されなければならない
- **FR-006**: specflow リポジトリ内の `.specflow/` ディレクトリから `review_*_prompt.txt` ファイルを除去しなければならない（specflow 本体のリポジトリ変更）。ユーザープロジェクト側の既存 `.specflow/review_*_prompt.txt` は自動削除しない — レビューコマンドは常に `global/` を参照するため、ローカルファイルは単に無視される

### Key Entities

- **Review Prompt**: Codex に渡されるレビュー指示ファイル。spec / plan / impl / impl_rereview の 4 種類が存在する
- **グローバルディレクトリ**: ソースは specflow リポジトリの `global/`。`specflow-install` で `~/.config/specflow/global/` にコピーされる。ランタイムではスラッシュコマンドが `~/.config/specflow/global/review_*_prompt.md` を絶対パスで参照する
- **スラッシュコマンドファイル**: `global/specflow.*.md` に配置された Claude Code コマンド定義ファイル

## Success Criteria

### Measurable Outcomes

- **SC-001**: すべてのレビューコマンド（6 コマンド）がグローバルディレクトリの `.md` prompt を使用してレビューを正常完了できる
- **SC-002**: prompt ファイルの可読性が向上する（Markdown の見出し・リスト構造が適用されている）
- **SC-003**: specflow リポジトリ本体の `.specflow/` に `review_*_prompt.txt` が存在しない。ユーザープロジェクト側の既存ファイルは残っていても動作に影響しない
- **SC-004**: グローバル prompt が見つからない場合、ユーザーが対処方法を理解できるエラーメッセージが表示される

## Assumptions

- `specflow-install` がリポジトリの `global/` を `~/.config/specflow/global/` にコピーする。ランタイムではこの絶対パスから prompt を読み込む
- Claude Code の Read ツールは `~` をホームディレクトリに展開して処理するため、コマンドファイル内で `~/.config/specflow/global/...` と記述すれば正しくファイルを読み込める
- Codex MCP サーバーは prompt を文字列として受け取るため、`.md` 形式でも `.txt` 形式でも動作に差はない（確認済み決定事項）
- ユーザープロジェクト側の既存 `.specflow/review_*_prompt.txt` は自動削除しない。レビューコマンドは常に `global/` を参照するため、既存ファイルは無視される（マイグレーション不要）
