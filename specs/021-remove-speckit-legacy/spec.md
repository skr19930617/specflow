# Feature Specification: speckit時代のレガシー排除

**Feature Branch**: `021-remove-speckit-legacy`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: GitHub Issue #50 — readmeやinstallスクリプトなど全て更新してspeckitの残骸を全て排除する。migrationも排除する。

## Clarifications

### Session 2026-04-06

- Q: speckit.* スラッシュコマンド名をどう扱うか？ → A: specflow.* に統合（重複するものは specflow.* 側に吸収して speckit.* を削除、重複しないものは specflow.* にリネーム）
- Q: マイグレーション関連ファイルの削除範囲は？ → A: 全マイグレーション関連削除（bin/specflow-migrate-*、specs/020-openspec-migration/、openspec/changes/020-openspec-migration/ を全て削除）
- Q: CLAUDE.md の Active Technologies セクションの整理方法は？ → A: 全履歴エントリ削除（feature ごとの履歴エントリを全て削除し、現在の技術スタックのみ簡潔に記載する）
- Q: .specify/ ディレクトリの扱いは？ → A: .specify/ 内の speckit 参照も更新対象に含める（ディレクトリ名自体は維持するが、内部のスクリプト・設定内の「speckit」参照は可能な限り更新する）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 新規ユーザーがプロジェクトをセットアップする (Priority: P1)

新しいユーザーがREADMEを読んでプロジェクトをセットアップする際、「speckit」への言及が一切なく、現在のブランド名・コマンド名・ディレクトリ構造のみが案内される。ユーザーは混乱することなく、正しい手順でインストール・初期化できる。

**Why this priority**: 新規ユーザーの第一印象を決定し、古い名前への混乱を防ぐ最も重要なシナリオ。

**Independent Test**: READMEおよびインストールスクリプトを読み、「speckit」という文字列が一箇所も存在しないことを確認する。記載されたセットアップ手順に従って正常にインストールできる。

**Acceptance Scenarios**:

1. **Given** プロジェクトのREADMEを開いた状態, **When** 全文を検索する, **Then** 「speckit」という文字列が見つからない
2. **Given** READMEに記載されたインストール手順, **When** 手順に従って実行する, **Then** エラーなくセットアップが完了する
3. **Given** プロジェクトのドキュメント群, **When** 「speckit」をプロジェクト全体で検索する, **Then** ドキュメント内に一切ヒットしない

---

### User Story 2 - 既存ユーザーがmigrationなしで運用する (Priority: P1)

以前のspeckit→specflow移行用のマイグレーションスクリプトや関連ファイルが完全に除去され、プロジェクト内に不要な移行ツールが残っていない。マイグレーション関連のspecディレクトリ（specs/020-openspec-migration/、openspec/changes/020-openspec-migration/）も削除される。

**Why this priority**: 不要なマイグレーションコードの残存はメンテナンスコストと混乱の原因になる。

**Independent Test**: マイグレーション関連のスクリプト・ファイル・ディレクトリがプロジェクト内に存在しないことを確認する。

**Acceptance Scenarios**:

1. **Given** プロジェクトリポジトリ, **When** マイグレーション関連ファイルを検索する, **Then** マイグレーション専用のスクリプト・ドキュメント・ディレクトリが見つからない
2. **Given** プロジェクトのbin/ディレクトリ, **When** ファイル一覧を確認する, **Then** マイグレーション用スクリプト（specflow-migrate-*）が存在しない
3. **Given** specs/ および openspec/changes/ ディレクトリ, **When** 020-openspec-migration を検索する, **Then** 該当ディレクトリが存在しない

---

### User Story 3 - 開発者がコードベースを理解する (Priority: P2)

プロジェクトに貢献しようとする開発者が、コードベース内のコメント、設定ファイル、スラッシュコマンド定義などで旧名称「speckit」への参照を見つけることなく、現在のアーキテクチャを正しく理解できる。スラッシュコマンドも統一された名称体系で提供される。

**Why this priority**: コントリビューター体験の向上と、レガシー参照による混乱防止。

**Independent Test**: ソースコード、設定ファイル、コマンド定義を全文検索し、レガシー名称への参照がないことを確認する。

**Acceptance Scenarios**:

1. **Given** プロジェクトのソースコード, **When** 「speckit」をgrep検索する, **Then** 外部依存で変更不可能な参照以外でヒットしない
2. **Given** CLAUDE.mdの設定, **When** Active Technologiesセクションを確認する, **Then** feature別の履歴エントリがなく、現在の技術スタックのみ簡潔に記載されている
3. **Given** スラッシュコマンド一覧, **When** コマンド名を確認する, **Then** 旧speckit.*コマンドが新名称にリネームされている

---

### Edge Cases

- `.specify/` ディレクトリ名自体は維持するが、内部の speckit 参照は更新対象。ただし、npm パッケージ名やバイナリ名など外部依存で変更不可能な参照は例外として残す
- Git履歴やコミットメッセージ内の「speckit」参照は変更対象外（履歴の改変は行わない）
- speckit.plan と speckit.implement は specflow.plan / specflow.impl に吸収するため、内容の統合が必要
- スラッシュコマンドのリネーム時、specflow 内部で speckit.* を呼び出している箇所も全て更新する必要がある
- 他のブランチやPRで進行中の作業との競合が発生する可能性がある

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: README.mdから「speckit」への全参照を削除または現在の名称に置き換えなければならない
- **FR-002**: インストールスクリプト（`bin/specflow-init` 等）から「speckit」への参照を削除しなければならない
- **FR-003**: マイグレーションスクリプト（`bin/specflow-migrate-*` 等）を完全に削除しなければならない
- **FR-004**: CLAUDE.mdのActive Technologiesセクションからfeature別の履歴エントリを全て削除し、現在の技術スタックのみ簡潔に記載しなければならない
- **FR-005**: グローバルコマンドファイル（`global/*.md`）内の「speckit」参照を現在の名称に更新しなければならない
- **FR-006**: テンプレートファイル（`template/`）内の「speckit」参照を現在の名称に更新しなければならない
- **FR-007**: マイグレーション関連のファイル・ディレクトリ（bin/specflow-migrate-*、specs/020-openspec-migration/、openspec/changes/020-openspec-migration/）を全て削除しなければならない
- **FR-008**: speckit.* スラッシュコマンドを以下のマッピングに従って specflow.* に統合しなければならない:

  | 現行 (speckit.*) | アクション | 移行先 |
  |-------------------|-----------|--------|
  | speckit.specify | リネーム | specflow.specify |
  | speckit.clarify | リネーム | specflow.clarify |
  | speckit.plan | 削除（specflow.plan に吸収） | specflow.plan |
  | speckit.tasks | リネーム | specflow.tasks |
  | speckit.implement | 削除（specflow.impl に吸収） | specflow.impl |
  | speckit.analyze | リネーム | specflow.analyze |
  | speckit.checklist | リネーム | specflow.checklist |
  | speckit.constitution | リネーム | specflow.constitution |
  | speckit.taskstoissues | リネーム | specflow.taskstoissues |

  - 「リネーム」: .claude/commands/speckit.X.md → .claude/commands/specflow.X.md にリネームし、ファイル内容の speckit 参照も更新
  - 「削除（吸収）」: speckit.X.md の内容を対応する global/specflow.*.md に統合し、speckit.X.md を削除
  - 全ての specflow.* コマンドファイル（global/*.md）内で speckit.* を呼び出している箇所を新名称に更新

- **FR-009**: .specify/ ディレクトリ内のスクリプト・設定ファイルに含まれる「speckit」参照を可能な限り更新しなければならない（ディレクトリ名 `.specify/` 自体は維持する）
- **FR-010**: specs/ 配下の過去 feature の履歴ファイル（review-ledger*.json、approval-summary.md、current-phase.md 等）に含まれる「speckit」参照を更新しなければならない
- **FR-011**: openspec/changes/ 配下の過去の change records に含まれる「speckit」参照を更新しなければならない
- **FR-012**: 維持対象ドキュメント（openspec/README.md 等）から legacy migration への参照を削除しなければならない
- **FR-013**: 削除・変更後、既存のspecflowワークフロー（`/specflow` → `/specflow.plan` → `/specflow.impl` → `/specflow.approve`）が正常に動作しなければならない

### Key Entities

- **ドキュメントファイル**: README.md、CLAUDE.md — ユーザー向けの案内・設定情報
- **スクリプトファイル**: bin/ 配下のシェルスクリプト — インストール・マイグレーション機能
- **コマンド定義**: global/*.md、.claude/commands/*.md — specflowスラッシュコマンドの定義
- **テンプレート**: template/ — プロジェクト初期化時のテンプレート群
- **マイグレーション関連**: specs/020-*、openspec/changes/020-*、bin/specflow-migrate-* — 削除対象

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: プロジェクト全体で「speckit」のgrep検索結果が0件になる。除外対象: (1) 外部依存で変更不可能な参照（npm パッケージ名等）、(2) 本 feature 自身の spec/review artifacts（specs/021-remove-speckit-legacy/ 配下 — この spec 自体が speckit を参照するため）。検証対象は specs/（021 を除く）、openspec/、global/、.claude/commands/、template/、bin/、.specify/、README.md、CLAUDE.md を含む全ファイル。過去の feature 履歴ファイル（review-ledger*.json、approval-summary.md、current-phase.md 等）も検証対象に含む
- **SC-002**: マイグレーション関連のスクリプト・ディレクトリがプロジェクトから完全に除去されている
- **SC-003**: READMEに記載された手順でプロジェクトの初期化が正常に完了する
- **SC-004**: 全スラッシュコマンドがリネーム後の名称で正常に動作する
- **SC-005**: CLAUDE.md の Active Technologies セクションに現在の技術スタックのみが簡潔に記載されている

## Assumptions

- `.specify/` ディレクトリ名自体は維持する（specflow の `.specify/scripts/bash/` 等のパス依存があるため）が、内部ファイルの speckit 参照は更新対象
- Git履歴（コミットメッセージ、過去のdiff）内の「speckit」参照は変更しない
- npm パッケージ名（`specy`）やバイナリ名など、外部依存で変更不可能な参照は例外として許容する

## Scope Boundaries

### In Scope
- README.md の更新
- CLAUDE.md の更新（Active Technologies の履歴エントリ全削除・現行スタック記載）
- bin/ 配下のマイグレーションスクリプト削除
- global/*.md コマンドファイルの更新（speckit 参照を新名称に）
- .claude/commands/speckit.*.md → specflow.*.md へのリネーム・統合・内容更新
- template/ 配下のファイル更新
- .specify/ 内のスクリプト・設定ファイルの speckit 参照更新
- specs/ 配下の過去 feature の履歴ファイル（review-ledger, approval-summary, current-phase 等）の speckit 参照更新
- openspec/changes/ 配下の過去 change records の speckit 参照更新
- 維持対象ドキュメント（openspec/README.md 等）からの legacy migration 参照削除
- specs/020-openspec-migration/ ディレクトリ削除
- openspec/changes/020-openspec-migration/ ディレクトリ削除

### Out of Scope
- `.specify/` ディレクトリ名自体のリネーム
- Git履歴の改変
- 他リポジトリのドキュメント更新
- specflowの機能変更・新機能追加
- npm パッケージ名（`specy`）等の外部依存名の変更
