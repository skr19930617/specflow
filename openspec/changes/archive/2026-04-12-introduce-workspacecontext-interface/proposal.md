## Why

Workspace metadata（プロジェクトルート、ブランチ名、worktree パスなど）は local mode では必要だが、core runtime が特定の VCS に依存して取得すべきではない。現在、これらの解決は CLI ラッパー経由で行われているが、明示的な interface 境界がないため、core と local surface の責務が曖昧になっている。WorkspaceContext interface を導入し、VCS-neutral な抽象として定義することで、core runtime は VCS の存在を知らずに workspace metadata を利用でき、external runtime が独自の実装を差し替えられる拡張ポイントを確保する。

## What Changes

- `WorkspaceContext` interface を VCS-neutral な抽象として新規追加する
- local mode 用の git-backed implementation (`LocalWorkspaceContext`) を追加する
- core runtime が VCS CLI を直接呼ばず、注入された WorkspaceContext 経由で metadata と diff を取得するよう変更する
- CLI エントリポイントで `LocalWorkspaceContext` を生成し、ArtifactStore と同じ DI パターンで core に注入する
- run start 時の workspace metadata 取得を WorkspaceContext 経由に統一する
- `specflow-filter-diff` の diff ロジックを WorkspaceContext 経由に移行する

## Contract Requirements

### Design Philosophy

WorkspaceContext は **VCS-neutral な workspace 抽象** である。interface contract にはいかなる VCS 固有のセマンティクス（git コマンド、git pathspec、特定の VCS ツール）も含めない。VCS 固有のロジックは全て concrete implementation（例: LocalWorkspaceContext）に閉じ込める。本 change で提供する唯一の実装は git-backed だが、API-backed やファイルシステムベースなど、任意の実装を差し替え可能な設計とする。

### Interface Contract（VCS-neutral）

**Metadata メソッド:**
- `projectRoot(): string` — プロジェクトルートの絶対パス。必須。解決不能時は例外
- `branchName(): string | null` — 現在のブランチ/バージョン識別子。特定できない場合は `null`
- `projectIdentity(): string` — プロジェクトの一意識別子。必須。解決不能時は例外。形式は実装依存だが、同一プロジェクトに対して常に同じ値を返すこと
- `projectDisplayName(): string` — run metadata の `repo_name` フィールドに書き込まれる人間可読な表示名。必須。既存の `repo_name` との後方互換性を保つために、LocalWorkspaceContext では `owner/repo` 形式を返す
- `worktreePath(): string` — 現在の作業ツリーの絶対パス。必須

**Diff メソッド:**
- `filteredDiff(excludeGlobs: string[]): { diff: string; summary: DiffSummary | "empty" }` — 作業ツリーの変更を、除外グロブパターンを適用して unified diff テキストとサマリで返す
- **対象となる変更**: 作業ツリー上の変更済みファイル（実装固有のベースラインとの差分）。純粋なリネーム（内容変更なし、100% 一致）は除外する。untracked ファイルは対象外。deleted ファイルは diff 対象外だが summary の excluded に記録する
- **ベースラインの定義**: 実装依存。interface contract はベースラインの具体的な参照先（HEAD、index、特定のコミット等）を規定しない。各実装が適切なベースラインを選択し、そのセマンティクスを実装ドキュメントに明記する
- `excludeGlobs` はグロブ形式の除外パターン（例: `*/review-ledger.json`）。実装が内部形式に変換する
- 変更がない場合は `summary: "empty"`, `diff: ""` を返す
- `DiffSummary`: `{ excluded: string[], warnings: string[], included_count: number, excluded_count: number, total_lines: number }`

**共通ルール:**
- 必須メソッドが解決不能な場合は例外を throw する（silent fallback しない）
- コンストラクタ時にワークスペースの有効性を検証し、無効な場合は明確なエラーメッセージで即座に失敗する

### LocalWorkspaceContext 実装仕様（git-specific — interface contract 外）

本 change で提供する git-backed implementation:

- `projectRoot()`: `git rev-parse --show-toplevel` で解決
- `branchName()`: `git branch --show-current` で解決。detached HEAD 時は `null`
- `projectIdentity()`: remote origin URL から `owner/repo` 形式で抽出。origin remote がない場合はプロジェクトルートのディレクトリ名をフォールバックとして使用（例: `local/my-project`）。常に非空の文字列を返す
- `projectDisplayName()`: 既存の run metadata `repo_name` フィールドとの後方互換を保つ。origin がある場合は `owner/repo`、ない場合はフォールバック値と同一
- `worktreePath()`: `git rev-parse --show-toplevel` で解決（worktree の場合は worktree のルート）
- `filteredDiff()`:
  - ベースライン: index（staging area）。`git diff`（引数なし）相当で、作業ツリー vs index の差分を返す。既存の `specflow-filter-diff` と同一のセマンティクス
  1. `git diff --name-status -M100` + pathspec で対象ファイルを特定（リネーム検出あり、100% 一致のみ）
  2. `excludeGlobs` を git pathspec 形式 `:(exclude)<pattern>` に変換し pathspec として適用
  3. 対象ファイルのみに対して `git diff --` で unified diff を取得
- non-git ディレクトリではコンストラクタ時にエラー

### 注入パターン
- CLI エントリポイントで `LocalWorkspaceContext` をインスタンス化し、関数引数として core に渡す（ArtifactStore と同じ DI パターン）
- core runtime は `WorkspaceContext` interface のみに依存し、`LocalWorkspaceContext` を直接 import しない
- external runtime は独自の WorkspaceContext 実装（API-backed, file-system-only 等）を差し替え可能

## Capabilities

### New Capabilities
- `workspace-context`: WorkspaceContext interface の定義と local git-backed implementation。VCS-neutral な workspace 抽象として、プロジェクトメタデータ解決および filtered diff 取得を提供する。

### Modified Capabilities
- `workflow-run-state`: run start 時の workspace metadata 取得を、直接的な metadata 注入から WorkspaceContext interface 経由に変更する。
- `review-orchestration`: diff 取得を WorkspaceContext 経由に変更する（specflow-filter-diff の抽象化）。

## Acceptance Criteria

1. **Local parity**: run start で記録される metadata フィールド（repo_name, branch_name, repo_path, worktree_path）が既存と同一の値を返す
2. **Review diff parity**: review-orchestration が受け取る diff 出力（unified diff テキスト + DiffSummary）が既存の specflow-filter-diff 出力と完全互換
3. **Core isolation**: `src/lib/` 配下の core モジュールが VCS コマンドを直接 import・実行しない。WorkspaceContext interface のみに依存する
4. **Injectability**: LocalWorkspaceContext 以外の WorkspaceContext 実装を CLI エントリポイントで差し替え可能。core に変更なしで動作する
5. **Failure explicitness**: 無効なワークスペースでの実行時に、明確なエラーメッセージで即座に失敗する
6. **No CLI breaking change**: 既存の CLI コマンドの引数・出力・終了コードに変更なし

## Impact

- `src/lib/` 配下に新しい interface + implementation ファイルを追加
- `specflow-run start` の metadata 注入パスを WorkspaceContext 経由に変更
- `specflow-filter-diff` の diff ロジックを LocalWorkspaceContext に移行
- review-runtime の diffFilter() が WorkspaceContext.filteredDiff() を呼び出すよう変更
- 既存の CLI 動作に breaking change なし
