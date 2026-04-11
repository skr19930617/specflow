## Why

現在の `CLAUDE.md` template は Contract Discipline と specflow Integration を含む project guideline として機能しているが、agent に与える context の層が明確に分離されていない。global invariants、project profile、phase-specific contract、runtime task instance、evidence context が同一ファイルに混在しており、surface や agent 実装に依存した wording が入り込みやすい。specflow の方向性（workflow semantics を core に寄せる、contract を明示する、core/adapter/local surface の境界を定義する）に合わせ、agent context も同じ原則で整理する。

Source: https://github.com/skr19930617/specflow/issues/104

## What Changes

- Surface-neutral な context layering model を core に定義し、各 layer の ownership・参照方法・override 規則を明文化する
- 初期 surface adapter として Claude 向け CLAUDE.md renderer を実装する（core model と adapter の境界を明確にする）
- `setup` コマンドの責務を「CLAUDE.md の対話的な穴埋め」から「repository profile の構造化解析・生成」に拡張する
- Setup のシナリオ別挙動を定義する（初回生成、再実行/更新、検出失敗、手動編集済み profile の扱い）
- Generated profile を `.specflow/profile.json` に保存し、context template から参照する構造にする
- Profile の構造検証（schema validation）を追加する
- 配布は既存の `specflow-init` フローを利用し、rendering pipeline への変更は最小限にとどめる
- 既存 repo の移行方針を定義する（既存 CLAUDE.md カスタマイズの保全、profile schema versioning）

### Context Layering Model

各 layer の責務:

| Layer | Ownership | 保存先 | 変更頻度 | 編集可否 |
|-------|-----------|--------|----------|----------|
| 1. Global Invariants | specflow core | template 内に埋め込み | release 単位 | 編集不可（immutable content: specflow release でのみ変更） |
| 2. Project Profile | `setup` が生成 | `.specflow/profile.json` | repo 構成変更時 | 手動編集可（再実行で merge） |
| 3. Phase/Workflow Contract | command prompt が注入 | command body 内 | workflow 変更時 | 編集不可（immutable source: command contract でのみ変更） |
| 4. Runtime Task Instance | workflow runtime が注入 | run-state / 一時ファイル | task ごと | N/A（揮発性） |
| 5. Evidence Context | review/apply runtime が注入 | run-state / 一時ファイル | step ごと | N/A（揮発性） |

**Layer 間の関係と衝突解決:**

- Layer 1-2 は永続化され、template / profile として管理される
- Layer 3 は command prompt に埋め込まれ、phase ごとに差し替わる
- Layer 4-5 は runtime injection で、永続化されない
- 各 layer は独立した名前空間を持ち、原則として衝突しない設計とする
  - Layer 1 は不変ルール（Contract Discipline 等）を定義し、他 layer がこれを上書きすることはない
  - Layer 2 はプロジェクト固有のファクト（言語、ツール、コマンド等）を保持する
  - Layer 3 は phase 固有のワークフロー制約を注入する
  - Layer 4-5 は task/step 固有のデータを追加する（上書きではなく追加）
- 万一同一キーで衝突した場合の優先順位: Layer 1 > Layer 3 > Layer 2 > Layer 4 > Layer 5（不変ルールと workflow 制約が profile やランタイムデータより優先）

### Setup シナリオ別挙動

| シナリオ | 挙動 |
|----------|------|
| 初回生成（`.specflow/profile.json` なし） | repo 解析 → ユーザー確認 → profile 生成 → schema validation |
| 再実行（既存 profile あり） | repo 再解析 → 既存 profile と解析結果の field-level diff → 差分があればユーザーに提示・選択を求める → profile 更新。手動編集と repo 変更を区別しない（provenance metadata は持たない）。差分がなければ "No changes detected" で終了 |
| 検出失敗（required 項目） | 該当 required 項目をユーザーに提示し対話的に入力を求める。ユーザーが入力するまで setup はブロック（部分 profile を書き出さない）。全 required 項目が埋まるまで profile.json は生成されない |
| 検出失敗（optional 項目） | 該当項目を `null` で出力、silent guess しない → ユーザーに手動入力の機会を提供するが、スキップ可能 |
| schema validation 失敗 | エラー詳細を表示 → ユーザーに修正を促す → 再 validation |

### Profile Schema Contract

初期スコープは単一ルート repo に限定する（monorepo/multi-workspace は non-goal）。

### Profile File Ownership

- `.specflow/profile.json` はリポジトリにコミットする共有成果物（derived ではなく shared state）
- チームメンバーは同一の profile を共有し、`setup` で生成後にコミットする
- `.specflow/profile.json` が git merge conflict を起こした場合、通常の JSON merge で解決する（field-level で衝突を解決）
- `.gitignore` に含めない（`specflow-init` が生成する `.gitignore` には `.specflow/profile.json` を含めない）

### Supported Repository Scope

- 初期スコープ: 単一言語・単一ルート repo のみ（リポジトリルートに主要なプロジェクト定義ファイルが1つ存在し、主要言語・ツールチェーンが1つの構成）
- Monorepo、multi-workspace、polyglot（複数言語併用）repo は明示的に non-goal（将来拡張で workspace 配列や multi-toolchain 対応を導入する想定だが、この提案の scope 外）
- `languages` は配列型だが初期スコープでは要素数1を想定。将来の polyglot 対応に向けた拡張ポイントとして配列を採用する
- プロジェクトルートの手動指定は初期スコープ外（検出に依存）

**エコシステム検出ルール:**

Setup はリポジトリルートのファイルを以下の順序でスキャンし、最初にマッチしたエコシステムを採用する。同一エコシステム内の補助ファイル（lockfile 等）は conflict とみなさない。

| Priority | Primary indicator | Supplementary files (conflict しない) | Language | Toolchain |
|----------|-------------------|--------------------------------------|----------|-----------|
| 1 | `package.json` | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `tsconfig.json` | typescript / javascript | npm / pnpm / yarn / bun（lockfile で決定） |
| 2 | `Cargo.toml` (no `[workspace]`) | `Cargo.lock` | rust | cargo |
| 3 | `go.mod` | `go.sum` | go | go |
| 4 | `pyproject.toml` | `uv.lock`, `poetry.lock`, `requirements.txt`, `setup.py`, `setup.cfg` | python | uv / poetry / pip（lockfile/tool section で決定） |

**Conflict detection:**
- Primary indicator が2つ以上マッチした場合（例: `package.json` と `go.mod` が共存）→ out-of-scope、setup を中断（error）
- Primary indicator 内に workspace 定義が含まれる場合（`pnpm-workspace.yaml`, `Cargo.toml` の `[workspace]`, `lerna.json` 等）→ out-of-scope、setup を中断（error）
- Primary indicator が0個の場合 → out-of-scope、setup を中断（error）
- 同一エコシステム内で toolchain が曖昧な場合（例: `package-lock.json` と `pnpm-lock.yaml` が共存）→ ユーザーに toolchain を対話的に選択させる（recoverable）

Out-of-scope 検出時のメッセージ: "このリポジトリ構成は現在のバージョンではサポートされていません。単一言語・単一ルートのリポジトリで `setup` を実行してください。"

### Profile Schema Shape

```jsonc
{
  // --- Required fields (setup blocks until all are provided) ---
  "schemaVersion": "1",              // string, required — monotonic integer string
  "languages": ["typescript"],       // string[], required, exactly 1 item in v1
  "toolchain": "npm",               // string, required — package manager or build system

  // --- Optional fields (always present, null = undetected) ---
  // commands: object, always present. Each child is string | null.
  // If no commands are detected at all, the object still exists with all children null.
  // The object itself is NEVER null — only its children can be null.
  "commands": {
    "build": "npm run build",        // string | null
    "test": "npm test",              // string | null
    "lint": "npm run lint",          // string | null
    "format": "npm run format"       // string | null
  },
  // directories: object, always present. Each child is string[] | null.
  // Same rule: the object itself is NEVER null — only its children can be null.
  "directories": {
    "source": ["src/"],              // string[] | null
    "test": ["tests/"],              // string[] | null
    "generated": ["dist/"]           // string[] | null
  },
  "forbiddenEditZones": null,        // string[] | null — glob patterns
  "contractSensitiveModules": null,  // string[] | null — paths or patterns
  "codingConventions": null,         // string[] | null — free-text rules
  "verificationExpectations": null   // string[] | null — free-text
}
```

**`toolchain` field:**
- プロジェクトの主要 package manager または build system を表す（旧名 `packageManager`、エコシステム中立な名前に変更）
- 許容値と検出ルール:
  - JavaScript/TypeScript: `"npm"`, `"pnpm"`, `"yarn"`, `"bun"` — lock file で検出
  - Rust: `"cargo"` — `Cargo.toml` で検出
  - Go: `"go"` — `go.mod` で検出
  - Python: `"pip"`, `"poetry"`, `"uv"` — `requirements.txt`, `pyproject.toml`, `uv.lock` で検出
  - 上記以外: ユーザーに自由入力を求める（enum 制約なし、detection hint のみ）

**Nullability rules:**
- **Top-level required fields** (`schemaVersion`, `languages`, `toolchain`): never null, never omitted
- **Top-level optional object fields** (`commands`, `directories`): always present as an object, never null. Their child fields can individually be null
- **Top-level optional array fields** (`forbiddenEditZones`, `contractSensitiveModules`, `codingConventions`, `verificationExpectations`): present with value `null` if undetected, `[]` if explicitly empty ("none applicable")
- **Nested child fields within `commands`**: `string | null` — null if that specific command was not detected
- **Nested child fields within `directories`**: `string[] | null` — null if that specific directory type was not detected
- キー自体は省略しない（全フィールドが常に存在する）。validation は全キーの存在と型を検査する
- `schemaVersion` は monotonic integer string（"1", "2", ...）。非互換変更でのみインクリメントする
- **Schema closure:** `commands` と `directories` は closed object（`additionalProperties: false`）。定義された子キーのみを許容し、未知のキーは validation error とする。将来のキー追加は `schemaVersion` のインクリメントで行う。rerun diffing と rendering は定義済みキーのみを対象とし、未知キーは無視しない（エラーとして報告する）

**Diff granularity（再実行時の比較単位）:**
- `commands`: 子キー単位で比較（`commands.build`, `commands.test` 等を個別に diff）
- `directories`: 子キー単位で比較（`directories.source` 等を個別に diff）
- 配列フィールド（`forbiddenEditZones` 等）: ソート正規化後に配列全体を比較。要素の追加/削除を diff として表示
- 全ての差分はフラット化して一覧表示し、個別にユーザーが accept/reject を選択する

Profile 項目の分類:
- **Required**: `schemaVersion`, `languages`（exactly 1 in v1）、`toolchain` — 検出失敗時は setup がブロックし、ユーザーに対話的入力を要求。全 required 項目が確定するまで profile.json は書き出されない
- **Optional**: 上記 schema の残り全フィールド — 検出失敗時は `null` で記録（object 型フィールドは子を全て null にする）、スキップ可能

### Profile Rerun: Deterministic Diff-and-Resolve

Setup の再実行は provenance metadata を持たず、手動編集と repo 変更を区別しない。全ての再実行は単一の deterministic diff-and-resolve フローで処理する:

- **Field-level diff ルール:**
  - 既存値 = 解析結果 → 変更なし
  - 既存値 ≠ 解析結果 かつ 既存値 ≠ null → 衝突として diff 表示し、ユーザーに選択を求める（解析結果を採用 / 既存値を維持）
  - 既存値 = null かつ 解析結果 ≠ null → 解析結果を提案、ユーザー確認で採用
  - 既存値 ≠ null かつ 解析結果 = null → 既存値を維持（検出できなくなっただけで削除しない）
- 全ての差分解決後に schema validation を実行し、合格した場合のみ profile.json を書き出す

### CLAUDE.md Managed/Unmanaged Boundary

Claude adapter は CLAUDE.md 内のセクションを managed/unmanaged で区別するために、明示的なマーカーコメントを使用する:

```markdown
<!-- specflow:managed:start -->
## Contract Discipline
...
## Project Profile
...
<!-- specflow:managed:end -->

## MANUAL ADDITIONS
(unmanaged — adapter は一切変更しない)
```

- **Managed 領域** (`<!-- specflow:managed:start -->` 〜 `<!-- specflow:managed:end -->`): adapter が profile から render し、毎回上書きする。ユーザーはこの領域を手動編集すべきでない
- **Unmanaged 領域**: マーカー外の全てのコンテンツ。adapter は一切変更しない
- **マーカーが見つからない場合（legacy CLAUDE.md migration）:**
  - マーカーなしの CLAUDE.md は legacy とみなす。Adapter は既存コンテンツの内容を一切解析・削除しない（heading ベースの heuristic 検出は行わない — 誤検出リスクが高いため）
  - 既存ファイル全体を `<!-- specflow:managed:end -->` の後ろに unmanaged コンテンツとして保全する
  - 新しい managed block をファイル先頭に挿入する
  - Warning を表示: "Legacy CLAUDE.md を検出しました。managed block を先頭に挿入しました。既存コンテンツに重複する記述がある場合は手動で削除してください。"
  - ユーザー確認を必須とする（diff を表示し、accept/reject を求める）
  - この方式により、legacy generated セクションと手動セクションの区別問題を完全に回避する。重複の手動整理はユーザー責任とする
- Heading の重複・並び替えへの対処: adapter はマーカーベースで parse するため、heading 構造には依存しない。managed 領域内の heading は adapter が完全に制御する

### Renderer Lifecycle

Profile 変更から surface output（CLAUDE.md）への反映フロー:

- `setup` コマンドは profile 生成/更新後に Claude adapter の render を自動実行し、CLAUDE.md を再生成する
- `specflow-init --update` は template 更新後に既存 profile があれば render を自動実行する
- Profile を手動編集した場合、次回の `setup` 実行時に render が再実行される（手動 render コマンドは初期スコープ外）
- **Profile validation contract（全読み取り元共通）:** `.specflow/profile.json` を読み取る全てのエントリポイント（`setup`, `specflow-init --update`, renderer, その他将来のツール）は、読み取り時に schema validation を実行する。validation 失敗時は処理を中断し、エラーを表示して `setup` の再実行を促す。invalid な profile から CLAUDE.md を生成することはない
- **Version mismatch の挙動:**
  - Render 時に adapter は profile の `schemaVersion` と template の期待する version を比較する
  - Version が一致 → 正常に render を実行
  - Profile version < template 期待 version → render を停止し、エラーを表示。`setup` コマンドの再実行を促す（`setup` が schema migration を担当）
  - Profile version > template 期待 version → render を停止し、エラーを表示。`specflow-init --update` で template を更新するよう促す
  - CLAUDE.md は version mismatch 時に一切変更しない（破損防止）
- **Migration 責務の所在:**
  - `setup` コマンドが profile schema migration を所有する。古い profile を検出した場合、新しい schema に変換してからユーザーに確認を求める
  - `specflow-init --update` が template 更新を所有する。template 側の version を最新に上げる
  - Profile migration と template 更新は独立して実行可能だが、render は両方が整合した状態でのみ実行される

### Surface Architecture

```
┌─────────────────────────────────────┐
│  Core (surface-neutral)             │
│  ├── context-layering-model         │
│  ├── profile-schema                 │
│  └── setup-analyzer                 │
├─────────────────────────────────────┤
│  Adapter (surface-specific)         │
│  └── claude-renderer                │
│      ├── CLAUDE.md template         │
│      └── profile → markdown mapper  │
└─────────────────────────────────────┘
```

- Core: context layering model、profile schema、setup 解析ロジック（surface に依存しない）
- Adapter: surface ごとの renderer（初期実装は Claude 向け CLAUDE.md renderer のみ）
- 将来の surface 追加（Cursor .cursorrules 等）は新しい adapter を追加するだけで対応可能

### Migration Strategy

- 既存の `CLAUDE.md` に手動追記（`## MANUAL ADDITIONS` 等）がある場合、setup は手動セクションを保全する
- 既存の `specflow-init` 導入済み repo に対しては `setup` を実行して profile を生成する（CLAUDE.md の既存構造は adapter が移行）
- `.specflow/profile.json` に `schemaVersion` フィールドを持ち、将来の schema 変更時に migration path を提供する
- 初回移行は `specflow-init --update` 相当のフローで context template を更新し、`setup` で profile を生成する

## Capabilities

### New Capabilities
- `agent-context-template`: Surface-neutral な context layering model の仕様。5 層の layer 定義（global invariants / project profile / phase contract / runtime task / evidence）、各 layer の ownership・参照方法・override 規則、surface adapter architecture（core/adapter 境界）を定める。初期 adapter として Claude 向け CLAUDE.md renderer を含む。

### Modified Capabilities
- `project-bootstrap-installation`: `setup` コマンドの入出力責務が拡張される。対話的な CLAUDE.md 穴埋めから、repository profile（`.specflow/profile.json`）の構造化解析・生成へ責務を変更。シナリオ別挙動（初回/再実行/検出失敗/手動編集済み）を定義。profile の schema validation が追加される。CLAUDE.md template は Claude adapter が profile を参照して render する形に更新される。配布は既存の init フローを利用。既存 repo の移行方針を含む。

## Impact

- `src/contracts/command-bodies.ts` — `specflow.setup` のコマンド定義を拡張（profile 解析・生成ステップ、シナリオ別分岐）
- `src/contracts/templates.ts` — 新しい template contract の追加（context template、profile schema）
- `assets/template/CLAUDE.md` — Claude adapter の template に変更（context layer 分離、profile 参照 slot の導入）
- `src/lib/` — repository profile 解析ロジック、schema validation、Claude renderer の追加
- `.specflow/profile.json` — 新規ファイル（generated output、schemaVersion 付き）
- 既存の `specflow-init` による CLAUDE.md 配置フローへの影響（template 更新に伴う）
- 既存 CLAUDE.md カスタマイズの保全（手動セクション維持）

