<!-- Historical Migration
  Source: specs/013-specflow-prereq-guidance/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: specflow 前提条件チェック時のガイダンス改善

**Feature Branch**: `013-specflow-prereq-guidance`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: GitHub Issue #24 — specflowのチェック時に何をすればいいかわからない

## Clarifications

### Session 2026-04-05

- Q: specflow のインストール手順としてどのコマンドを案内すべきか？ → A: `npx specy init` を案内する
- Q: エラーメッセージの表示フォーマットはどうすべきか？ → A: コマンド付きステップ形式（番号付きステップでコマンド例を並べる）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - specflow 未インストール時のインストール案内 (Priority: P1)

specflow を初めて使うユーザーが `/specflow` コマンドを実行したが、specflow がローカルにインストールされていない。現状はエラーメッセージが表示されて停止するだけで、次に何をすべきか分からない。改善後は、specflow のインストール方法が具体的に表示され、ユーザーは案内に従ってインストールを完了できる。

**Why this priority**: specflow が入っていない場合が最も一般的な障害パターンであり、ここを改善することで新規ユーザーの離脱を防げる。

**Independent Test**: specflow がインストールされていない環境で `/specflow` を実行し、インストール手順が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** specflow がインストールされていない状態, **When** ユーザーが `/specflow` を実行, **Then** specflow のインストール方法（コマンド例を含む）が表示される
2. **Given** specflow がインストールされていない状態, **When** エラーメッセージが表示された, **Then** メッセージには「何をすべきか」が明確に含まれ、ユーザーは案内に従うだけでインストールを完了できる
3. **Given** specflow がインストールされていない状態, **When** ユーザーが案内に従って `npx specy init` を実行, **Then** 再度 `/specflow` を実行すると Failure State 1 は解消され、次の前提条件チェック（Failure State 2: specflow 未初期化）に進む

---

### User Story 2 - specflow 未初期化時の init コマンド案内 (Priority: P1)

ユーザーが specflow はインストール済みだが、プロジェクトで specflow の初期化（`.specflow/config.env` の作成）がまだ行われていない。現状は「config.env が見つかりません」と表示されるだけで、init コマンドの存在を知らないユーザーは何をすべきか分からない。改善後は、init コマンド（`/specflow.setup` など）の実行方法が案内される。

**Why this priority**: specflow インストール済みだが未初期化のケースも頻出するため、P1 と同等の優先度。

**Independent Test**: `.specflow/config.env` が存在しない状態で `/specflow` を実行し、初期化コマンドの案内が表示されることを確認する。

**Acceptance Scenarios**:

1. **Given** specflow はインストール済みだが `.specflow/config.env` が存在しない, **When** ユーザーが `/specflow` を実行, **Then** 初期化コマンドの実行方法が具体的に表示される
2. **Given** 初期化案内が表示された, **When** ユーザーが案内に従って初期化を実行, **Then** 再度 `/specflow` を実行すると正常に動作する

---

### User Story 3 - README のセットアップ手順更新 (Priority: P2)

新規ユーザーが README を読んでセットアップを試みるが、前提条件のインストール手順が不足している。改善後は、README に specflow のインストール方法と specflow の初期化手順が記載され、ユーザーはドキュメントを読むだけでセットアップを完了できる。

**Why this priority**: ドキュメント改善は長期的なユーザー体験向上に寄与するが、エラーメッセージ改善（P1）が先に対処すべき即時の課題である。

**Independent Test**: README のセットアップセクションを読み、記載された手順に従うだけで specflow を使い始められることを確認する。

**Acceptance Scenarios**:

1. **Given** README が更新された状態, **When** 新規ユーザーがセットアップセクションを読む, **Then** specflow のインストール方法が明記されている
2. **Given** README が更新された状態, **When** 新規ユーザーがセットアップセクションを読む, **Then** specflow の初期化手順（`/specflow.setup`）が明記されている
3. **Given** README が更新された状態, **When** ユーザーが手順通りに実行, **Then** specflow が正常に動作する状態になる

---

### Edge Cases

- specflow のインストールコマンド自体が失敗した場合（ネットワークエラー、権限不足など）→ エラーメッセージ改善のスコープ外。ただし、トラブルシューティングの参照先（README や GitHub Issues）を案内に含める
- specflow と specflow の両方が未セットアップの場合 → 既存の「最初の失敗で停止」方式により、まず specflow のインストール（`npx specy init`）のみ案内される。ユーザーが specflow をインストールした後、再度 `/specflow` を実行すると次の failure state（specflow 未初期化）が検出され `/specflow.setup` が案内される
- 古いバージョンの specflow がインストールされている場合 → 本 feature のスコープ外（バージョンチェックは別 issue で対応）

## Requirements *(mandatory)*

### Failure State → Command Mapping

これらのファイルチェックは、既存の specflow コマンド群の Prerequisites セクションで使用されている実際のランタイム検出条件である。各 specflow コマンド（`/specflow`, `/specflow.plan`, `/specflow.impl` 等）は実行開始時にこの順序でチェックを行い、最初の失敗で停止する。

| # | Failure State | Detection Condition | Recovery Command | Post-condition（コマンドが生成するもの） |
|---|--------------|---------------------|-----------------|----------------------------------------|
| 1 | specflow 未インストール | `.specify/scripts/bash/check-prerequisites.sh` が存在しない | `npx specy init` | `.specify/` ディレクトリ一式（scripts, templates 等）が生成される。specflow の初期化のみで、specflow の設定は含まない |
| 2 | specflow 未初期化 | `.specflow/config.env` が存在しない | `/specflow.setup` | `.specflow/config.env` が生成され、CLAUDE.md の Tech Stack/Commands/Code Style セクションが設定される |

**現在のエラーメッセージ（改善前）:**
- Failure State 1: `"specflow が見つかりません。specflow をインストールしてから再度実行してください。"`
- Failure State 2: `".specflow/config.env が見つかりません。先に specflow-init を実行してください。"`

### Functional Requirements

- **FR-001**: specflow が未インストールの場合（Failure State 1）、エラーメッセージに `npx specy init` の実行手順を含めること。このコマンドは `.specify/` ディレクトリを生成するが `.specflow/config.env` は生成しないため、ユーザーは次回実行時に Failure State 2 に進む
- **FR-002**: `.specflow/config.env` が存在しない場合（Failure State 2）、エラーメッセージに `/specflow.setup` の実行手順を含めること。このコマンドは `.specflow/config.env` を生成し specflow を使用可能にする
- **FR-003**: エラーメッセージはコマンド付きステップ形式（番号付きステップでコマンド例を並べる）で表示すること
- **FR-004**: 前提条件チェックは既存の「最初の失敗で停止」方式を維持すること。チェック順序は specflow（Failure State 1）→ specflow 初期化（Failure State 2）の順で、最初に失敗した項目のみ recovery command を表示して停止する。combined guidance（複数の failure state をまとめて表示）は不要
- **FR-005**: README にセットアップの前提条件セクションを追加または更新し、Failure State → Command Mapping の全手順を記載すること
- **FR-006**: 既存の前提条件チェックロジック（チェック項目・順序・停止動作）を変更しないこと。エラーメッセージの文言のみ改善すること

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: specflow 未インストール時のエラーメッセージに、インストールコマンドが含まれている
- **SC-002**: specflow 未初期化時のエラーメッセージに、初期化コマンドが含まれている
- **SC-003**: 新規ユーザーが README のセットアップ手順のみで specflow を使い始められる（手順の完全性）
- **SC-004**: 既存の前提条件チェックが正常に動作し続ける（回帰なし）

## Assumptions

- specflow のインストール方法は `npx specy init` コマンドを案内する
- specflow の初期化コマンドは `/specflow.setup` である
- エラーメッセージは日本語で表示する（既存の specflow メッセージと一貫性を保つ）
- 対象ユーザーは Claude Code CLI の基本操作を理解している
