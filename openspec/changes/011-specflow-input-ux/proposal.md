<!-- Historical Migration
  Source: specs/011-specflow-input-ux/spec.md
  Migrated: 2026-04-06
  Context: Migrated from legacy specs/ structure to OpenSpec changes/ as part of issue #47
-->

# Feature Specification: specflow 起動時の入力形式改善

**Feature Branch**: `011-specflow-input-ux`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "毎回ボタンでurlを入力ボタンにotherで入力を求めるのが違和感。ここはボタンではなくissueのリンクを入力させることを求めるか仕様をその場で入力することをtextで指示して受け取った内容から後続の処理に繋げたい"

## User Scenarios & Testing

### User Story 1 - issue URL をテキストで直接入力する (Priority: P1)

ユーザーが `/specflow` を引数なしで実行した場合、ボタン選択ではなくフリーテキスト入力で GitHub issue URL またはインライン仕様記述を求める。ユーザーは URL を貼り付けるか、その場で仕様を書いて送信する。

**Why this priority**: 現状の最大の不満点であるボタン UI の違和感を直接解消する。最も頻繁に遭遇するフローであり、改善効果が最も大きい。

**Independent Test**: `/specflow` を引数なしで実行し、テキスト入力プロンプトが表示されること、URL を入力すると issue 取得に進むことを確認する。

**Acceptance Scenarios**:

1. **Given** ユーザーが `/specflow` を引数なしで実行した, **When** テキスト入力プロンプトが表示される, **Then** ボタン選択 UI ではなくフリーテキスト入力欄が表示される
2. **Given** テキスト入力プロンプトが表示された, **When** ユーザーが GitHub issue URL を入力する, **Then** issue 取得処理（Step 2）に進む
3. **Given** テキスト入力プロンプトが表示された, **When** ユーザーがインライン仕様テキストを入力する, **Then** そのテキストを feature description として spec 作成処理（Step 3）に進む

---

### User Story 2 - 引数付きで /specflow を実行する (Priority: P1)

ユーザーが `/specflow <issue-url>` のように引数に URL を指定した場合、入力プロンプトを表示せずに直接 issue 取得に進む。現行の動作と同じだが、ボタン UI は経由しない。

**Why this priority**: 引数指定時のスムーズな動作は既存ワークフローとの互換性に必須。

**Independent Test**: `/specflow https://github.com/owner/repo/issues/1` を実行し、入力プロンプトなしで issue 取得に進むことを確認する。

**Acceptance Scenarios**:

1. **Given** ユーザーが `/specflow <valid-issue-url>` を実行した, **When** URL が GitHub issue URL パターンに一致する, **Then** テキスト入力プロンプトを表示せずに issue 取得に進む
2. **Given** ユーザーが `/specflow <text>` を実行した, **When** テキストが issue URL パターンに一致しない, **Then** そのテキストをインライン仕様記述として扱い spec 作成に進む

---

### User Story 3 - インライン仕様記述から spec を作成する (Priority: P2)

ユーザーが issue URL ではなく自然言語の仕様説明を入力した場合、issue 取得をスキップして直接 spec 作成処理に進む。issue のメタデータ（番号、ラベル等）は持たないが、spec 自体は通常と同じ品質で作成される。

**Why this priority**: issue なしで素早く spec を書き始めたいケースに対応する。URL 入力より頻度は低いが、ワークフローの柔軟性を大きく向上させる。

**Independent Test**: `/specflow` 実行後にテキストプロンプトで「ユーザー認証機能を追加する」と入力し、issue 取得をスキップして spec 作成に進むことを確認する。

**Acceptance Scenarios**:

1. **Given** ユーザーがインライン仕様テキストを入力した, **When** テキストが URL パターンに一致しない, **Then** issue 取得（Step 2）をスキップし、テキストを feature description として Step 3（spec 作成）に進む
2. **Given** インライン仕様テキストから spec を作成した, **When** spec が生成される, **Then** spec の品質は issue 経由の場合と同等である

---

### Edge Cases

- ユーザーが空文字を入力した場合 → 再度入力を求める
- URL に見えるが GitHub issue URL ではないテキストを入力した場合 → インライン仕様記述として扱う
- issue URL を入力したが issue が存在しない/アクセス権がない場合 → エラーメッセージを表示し再入力を求める

## Requirements

### Functional Requirements

- **FR-001**: `/specflow` を引数なしで実行した場合、ボタン UI ではなくテキスト案内メッセージを表示し、ユーザーの次のメッセージ入力を待たなければならない
- **FR-002**: 入力プロンプトには「GitHub issue URL を入力するか、仕様をテキストで記述してください」という趣旨の案内を表示しなければならない
- **FR-003**: 入力テキストが GitHub issue URL パターン（`https://<host>/<owner>/<repo>/issues/<number>`）に一致する場合、issue 取得処理に進まなければならない
- **FR-004**: 入力テキストが URL パターンに一致しない場合、そのテキストをインライン仕様記述として spec 作成処理に渡さなければならない
- **FR-005**: `/specflow <issue-url>` のように引数に URL を指定した場合、入力プロンプトを表示せずに直接 issue 取得に進まなければならない
- **FR-006**: `/specflow <text>` のように引数に URL 以外のテキストを指定した場合、入力プロンプトを表示せずにインライン仕様記述として扱わなければならない
- **FR-007**: 空入力に対しては再度入力を求めなければならない
- **FR-008**: インライン仕様記述から spec を作成する場合、issue メタデータ（番号、ラベル等）なしで spec 作成処理を開始しなければならない

### Key Entities

- **入力テキスト**: ユーザーが提供する文字列。issue URL またはインライン仕様記述のいずれか
- **入力分類結果**: 入力テキストを「issue URL」「インライン仕様記述」「空入力」のいずれかに分類した結果

## Success Criteria

### Measurable Outcomes

- **SC-001**: `/specflow` 起動時にボタン選択 UI が表示されないこと（テキスト案内メッセージのみ表示）
- **SC-002**: issue URL を入力した場合、現行フローと同じ結果（issue 取得 → spec 作成 → clarify → review）が得られること
- **SC-003**: インライン仕様記述を入力した場合、issue 取得をスキップして spec 作成以降のフローが完了すること
- **SC-004**: 引数付き実行（`/specflow <url>`）で入力プロンプトなしに処理が進むこと
- **SC-005**: ユーザーが入力から spec 作成開始までに要するステップ数が、現行の 3 ステップ（コマンド入力 → ボタン表示 → Other 入力）から 2 ステップ以下（コマンド入力 → テキスト入力）に削減されること

## Clarifications

### Session 2026-04-03

- Q: AskUserQuestion のボタン必須制約への対応方法は？ → A: テキスト案内方式 — AskUserQuestion を使わず、テキストで「GitHub issue URL を入力するか、仕様をテキストで記述してください」と案内し、ユーザーの次のメッセージを待つ
- Q: インライン仕様記述時の feature ディレクトリ番号の決定方法は？ → A: specflow の自動連番ロジックをそのまま使用（issue 番号との紐付きなし）

## Assumptions

- AskUserQuestion は使用せず、テキスト案内でユーザーの次メッセージを待つ方式を採用する
- インライン仕様記述の場合、issue 番号は使用できないため、specflow の自動連番ロジックで feature ディレクトリ名を決定する
- 既存の `/specflow` コマンドファイル（`global/specflow.md`）の修正が主な変更対象となる
