# Feature Specification: レガシーコードのリファクタリング

**Feature Branch**: `009-legacy-cleanup`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "不要なスクリプトを削除してドキュメント群とinstallスクリプト群の更新"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 不要なスクリプトの削除 (Priority: P1)

プロジェクトメンテナーが specflow リポジトリをメンテナンスする際、現在使われていないレガシースクリプトが存在していると、どのファイルが有効でどのファイルが廃止済みかの判断に時間がかかる。不要なスクリプトを削除することで、リポジトリの見通しを良くし、メンテナンスコストを下げる。

**Why this priority**: 不要なコードの存在はバグの温床であり、新規コントリビューターの混乱を招く。まず削除して現行コードベースを正確にすることが最優先。

**Independent Test**: リポジトリからレガシースクリプトを削除した後、既存のワークフロー（`specflow-install`, `specflow-init`, `/specflow` コマンド群）がすべて正常に動作することを確認する。

**Acceptance Scenarios**:

1. **Given** リポジトリに不要なスクリプトが存在する状態, **When** レガシーファイルを削除する, **Then** 既存の specflow ワークフロー（install, init, 全スラッシュコマンド）がエラーなく動作する
2. **Given** レガシースクリプトが削除済みの状態, **When** 新規ユーザーがリポジトリをクローンする, **Then** 現行で使われているファイルのみが存在し、廃止済みファイルは含まれない

---

### User Story 2 - ドキュメントの更新 (Priority: P2)

ユーザーが specflow を新規導入する際、README やその他のドキュメントが最新のファイル構成・コマンド体系を正確に反映していることで、迷わずセットアップできる。レガシースクリプト削除後のファイル構成変更をドキュメントに反映する。

**Why this priority**: スクリプト削除後にドキュメントが旧構成を参照したままだと、ユーザーが存在しないファイルを探して混乱する。削除の直後に更新が必要。

**Independent Test**: README.md およびその他のドキュメントに記載されているファイルパス・コマンド名がすべて実在するファイル・コマンドと一致することを確認する。

**Acceptance Scenarios**:

1. **Given** 不要スクリプト削除後のリポジトリ状態, **When** README.md のファイル構成セクションを確認する, **Then** 記載されているすべてのファイルパスが実際に存在する
2. **Given** ドキュメント更新後の状態, **When** ドキュメントに記載されたセットアップ手順を最初から実行する, **Then** すべての手順がエラーなく完了する

---

### User Story 3 - install スクリプトの更新 (Priority: P3)

プロジェクトメンテナーが `specflow-install` を実行した際、削除済みスクリプトへの参照が残っていると install が失敗したり不整合が発生する。install スクリプト群を現行のファイル構成に合わせて更新する。

**Why this priority**: install スクリプトが壊れるとユーザーは specflow を導入できなくなる。ただし、先にどのファイルを削除するか（P1）とドキュメント上の構成（P2）を確定させてから修正するのが効率的。

**Independent Test**: クリーンな環境で `specflow-install` を実行し、すべてのファイルが正しい場所にコピー・リンクされることを確認する。

**Acceptance Scenarios**:

1. **Given** レガシースクリプトが削除済みの状態, **When** `specflow-install` を実行する, **Then** 全ファイルが正しくインストールされ、エラーや警告が出ない
2. **Given** install 完了後の状態, **When** `specflow-init` を新規プロジェクトで実行する, **Then** `.specflow/`, `.mcp.json`, `CLAUDE.md` が正しくコピーされる

---

### Edge Cases

- 不要スクリプトの削除時に、他のスクリプトから参照されているファイルを誤って削除した場合はどうなるか？
- `specflow-install` の再実行時に、古いバージョンでインストールされたシンボリックリンク（例: `~/bin/specflow` — 削除済みの旧 CLI）が残っている場合 → `specflow-install` が `~/bin/specflow-*` のうち、現在 `bin/` に実体がないリンクを検出して削除または警告する
- ユーザーがカスタマイズしたファイル（CLAUDE.md, .mcp.json）は `specflow-init` で上書きしない（既存動作: ファイルが存在する場合はスキップする）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: リポジトリ全体（bin/, global/, template/ を含む全ディレクトリ）から不要なファイルを特定し、一括削除しなければならない。**判定基準**: 以下のすべてを満たすファイルを「不要」とする: (a) 現行の bin スクリプト（specflow-install, specflow-init, specflow-fetch-issue）から参照されていない、(b) 現行の global スラッシュコマンド（specflow*.md）から参照されていない、(c) template/ のコピー対象として specflow-init に使われていない。**確認方法**: grep でファイル名の参照を全ファイルから検索し、参照元がゼロであることを確認する
- **FR-002**: 削除対象ファイルの一覧をコミット前にリスト化し、各ファイルが不要である根拠（参照元ゼロ）を示さなければならない
- **FR-003**: README.md のファイル構成セクションを、削除後の実際のディレクトリ構造と一致させなければならない
- **FR-004**: README.md のセットアップ手順が、現行のコマンド・ファイルパスを正しく参照しなければならない
- **FR-005**: `specflow-install` スクリプトが、削除済みファイルを参照せず、現行ファイルのみを処理しなければならない
- **FR-006**: `specflow-init` スクリプトが、削除済みファイルを参照せず、現行テンプレートのみをコピーしなければならない。初期化完了時の表示メッセージ（作成されたファイル一覧）が、実際にコピーされたファイルと一致しなければならない
- **FR-007**: 既存の specflow ワークフロー（全スラッシュコマンド）が削除・更新後も正常に動作しなければならない
- **FR-008**: 既存環境への `specflow-install` 再実行時、古いバージョンのシンボリックリンク（`~/bin/` 配下の、現在 `bin/` に存在しないスクリプトへのリンク）を検出し、削除または警告しなければならない
- **FR-009**: `specflow-init` は既存の `CLAUDE.md` および `.mcp.json` を上書きしてはならない（既存動作の維持を明文化）

### 更新対象ファイル一覧

以下のファイルが本 issue の更新対象スコープである:

**ドキュメント:**
- `README.md` — ファイル構成セクション、セットアップ手順、コマンド一覧
- `template/CLAUDE.md` — テンプレート版（必要に応じて）

**install スクリプト:**
- `bin/specflow-install` — シンボリックリンク作成、コマンドコピー、権限マージ
- `bin/specflow-init` — テンプレートコピー、完了メッセージ表示

**テンプレート:**
- `template/.specflow/` 配下の全ファイル — init でコピーされるファイル群
- `template/.mcp.json` — MCP サーバー設定テンプレート

**スラッシュコマンド（参照のみ）:**
- `global/specflow*.md` — 削除したファイルを参照していないか確認

### Key Entities

- **bin スクリプト**: `bin/` ディレクトリ配下の実行可能スクリプト群（specflow-install, specflow-init, specflow-fetch-issue）
- **global コマンド**: `global/` ディレクトリ配下のスラッシュコマンド定義ファイル群（specflow*.md, claude-settings.json）
- **template ファイル**: `template/` ディレクトリ配下のプロジェクト初期化テンプレート群
- **ドキュメント**: README.md, template/CLAUDE.md

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: リポジトリ内に未使用・廃止済みのスクリプトファイルが 0 件である
- **SC-002**: README.md に記載されたすべてのファイルパスが実在するファイルと一致する（不一致 0 件）
- **SC-003**: `specflow-install` をクリーン環境で実行して、エラー・警告が 0 件で完了する
- **SC-004**: `specflow-init` を新規ディレクトリで実行して、必要なファイルがすべて正しくコピーされる
- **SC-005**: 全スラッシュコマンド（`/specflow`, `/specflow.plan`, `/specflow.impl`, `/specflow.approve`, `/specflow.reject`, `/specflow.fix`, `/specflow.spec_fix`, `/specflow.plan_fix`, `/specflow.setup`）が正常に起動できる

## Clarifications

### Session 2026-04-03

- Q: 削除対象のスコープは bin/ のみか、全ディレクトリか？ → A: 全ディレクトリ対象（bin/, global/, template/ を含むリポジトリ全体）
- Q: 削除判定のアプローチ（ファイルごと確認 or 一括削除）？ → A: 使われていないものは一括削除でOK（スピード重視）

## Assumptions

- 現在の `bin/`, `global/`, `template/` のディレクトリ構造が正であり、この構造自体の変更は行わない
- speckit（`.specify/`）の構造は変更対象外
- ユーザーがカスタマイズした CLAUDE.md は install/init で上書きしない（既存の動作を維持）
