## Context

specflow の `CLAUDE.md` template は Contract Discipline を含む project guideline として機能するが、agent context の層が分離されていない。現在の setup コマンド（`specflow.setup`）は CLAUDE.md の対話的穴埋めを行うだけで、構造化された profile データを持たない。

現在の構造:
- `assets/template/CLAUDE.md` — 静的テキスト（Contract Discipline のみ）
- `src/contracts/templates.ts` — `TemplateAssetContract` で template を宣言
- `src/contracts/command-bodies.ts` — `specflow.setup` の command body（対話ステップ 5つ）
- `src/bin/specflow-init.ts` — template 更新と `--update` フローを提供
- `src/lib/schemas.ts` — 各種 runtime schema validator（profile schema は未定義）
- `src/lib/template-files.ts` — dotfile aliasing（packaging 用）

制約:
- Contract-driven architecture に従う（新しいアーティファクトは contract として宣言）
- 既存の `specflow-init` / `specflow-install` フローを大きく変更しない
- `src/lib/schemas.ts` の既存バリデーションパターンに揃える

## Goals / Non-Goals

**Goals:**
- Surface-neutral な context layering model と adapter-facing core contract を実装可能な形で設計する
- `.specflow/profile.json` の生成・version-aware load・検証・diffing ロジックを `src/lib/` に追加する
- Claude adapter（CLAUDE.md renderer）を managed/unmanaged マーカーベースで実装し、legacy migration は caller-confirmed write にする
- `specflow.setup` command body をエコシステム検出 → profile 生成フローに書き換える
- 既存の template contract / install plan に最小限の変更で統合する

**Non-Goals:**
- Monorepo / polyglot 対応
- Claude 以外の surface adapter 実装（設計上の拡張ポイントは設ける）
- `specflow-init` / `specflow-install` の大規模リファクタ
- 非対話（non-TTY）モードの実装（v1 は対話専用）

## Decisions

### D1: Profile schema を `src/lib/schemas.ts` に追加する

**選択:** 既存の `schemas.ts` にある `validateSchemaValue()` パターンで profile validator を実装する。

**理由:** 他の runtime schema（`run-state`, `review-*-result` 等）と同じ検証パターンを使うことで、コードの一貫性を保ち、新しい依存を追加しない。JSON Schema ライブラリ（ajv 等）を導入する選択肢もあったが、既存パターンに合わせる方が保守コストが低い。

**代替案:** Zod や ajv による外部 schema validation → 新規依存が増え、既存パターンから逸脱する。

### D2: Ecosystem 検出ロジックを `src/lib/ecosystem-detector.ts` として新規追加する

**選択:** 新しいモジュール `src/lib/ecosystem-detector.ts` を作成し、proposal で定義された検出マトリクスを実装する。

**理由:** `src/contracts/command-bodies.ts` の setup body はコマンドの「何をすべきか」を記述する場所であり、検出ロジックの実装場所ではない。既存の `specflow-analyze` CLI（`src/bin/specflow-analyze.ts`）が類似の解析を行っているが、その出力形式は profile schema と一致しない。新しいモジュールとして分離し、setup command body から呼び出す形にする。

**代替案:** `specflow-analyze` を拡張する → 出力形式の互換性維持が複雑になり、既存ユーザーへの影響が大きい。

### D2a: Five-layer core contract を `src/lib/agent-context-template.ts` として新規追加する

**選択:** `src/lib/agent-context-template.ts` を surface-neutral core artifact として追加し、5 layer の canonical definition をここに集約する。この module 自体を新しい `agent-context-template` capability の実装契約とし、adapter や runtime injector はこの export surface を import して利用する。module は `AgentContextLayerId`、各 layer の ownership / persistence metadata、namespace identifier、precedence utility（Layer 1 > Layer 3 > Layer 2 > Layer 4 > Layer 5）、および adapter-facing `AgentContextTemplateInput` / `ResolvedAgentContextEnvelope` interface を export する。Claude renderer を含む各 surface adapter と runtime injector はこの interface に依存し、layer rule を独自実装しない。

v1 の layer-to-artifact mapping は次で固定する:
- Layer 1 (`global-invariants`) は `agent-context-template.ts` 内の immutable core definition として保持する
- Layer 2 (`project-profile`) は `ProfileSchema` として `.specflow/profile.json` から読み込む
- Layer 3 (`phase-contract`) は `src/contracts/command-bodies.ts` など command contract 側が `AgentContextTemplateInput.phaseContract` に供給する
- Layer 4 (`runtime-task-instance`) は run-state / 一時ファイルの payload を `AgentContextTemplateInput.runtimeTask` として供給する
- Layer 5 (`evidence-context`) は review/apply runtime の payload を `AgentContextTemplateInput.evidenceContext` として供給する
- `resolveAgentContextEnvelope()` が namespace separation と precedence rule を適用した canonical envelope を返し、surface adapter はそこから必要な layer だけを投影する
- `ResolvedAgentContextEnvelope` は常に 5 layer すべての namespace を保持する。v1 の Claude adapter が markdown 化するのは Layer 1-2 だけだが、Layer 3-5 も core contract 上は first-class input として確定し、将来 surface ごとに再定義しない

**理由:** proposal の `agent-context-template` capability を implementation artifact に落とすには、特定 surface から独立した core module が必要。これにより Layer 3-5 を v1 で CLAUDE.md に直接 serialize しなくても、namespace separation と conflict priority をこの変更で formalize できる。将来 Cursor などの新 surface を追加しても core contract を再定義せずに済む。

**代替案:** layer 定義を Claude renderer 内に埋め込む → future surface ごとに precedence / namespace rule が重複し、core capability が不完全になる。

### D3: Claude renderer を `src/lib/claude-renderer.ts` として新規追加する

**選択:** profile.json → CLAUDE.md の rendering ロジックを独立モジュールとして実装する。マーカーベースの managed/unmanaged パーサー、profile → markdown マッパー、`agent-context-template.ts` の adapter-facing interface を入力とする render planner を含む。v1 の Claude adapter は `ResolvedAgentContextEnvelope` から Layer 1-2 を markdown 化し、Layer 3-5 は同じ core contract を通じて既存の command prompt / run-state 注入経路で消費する。

**理由:** Adapter pattern の core/adapter 境界を明確にする。将来の surface adapter 追加時に renderer interface を参照できるようにする。rendering ロジックは command body に埋め込まず、reusable なモジュールとして切り出す。

### D4: Template contract に `template-claude-md-v2` を追加し、既存 `template-claude-md` を置き換える

**選択:** 新しい template contract を追加する。v2 template には managed マーカーと profile 参照 slot を含む。`specflow-init` は v2 template を使用する。

**理由:** 既存の `assets/template/CLAUDE.md` は Contract Discipline のみのフラットテキスト。マーカー付きの新しい template が必要。contract ID を変えることで、install plan の asset mapping が明確になる。

**代替案:** 既存 contract を in-place 更新する → migration 時の差分検出が曖昧になる。

### D5: Setup command body を全面書き換えする

**選択:** `src/contracts/command-bodies.ts` の `specflow.setup` エントリを、エコシステム検出 → profile 生成 → adapter rendering のフローに書き換える。

**理由:** 既存の 5 ステップ（Analyze → Tech Stack 確認 → Commands 確認 → Code Style 確認 → CLAUDE.md 更新）は CLAUDE.md 直接編集前提であり、profile 分離アーキテクチャと互換性がない。新しいフローは: Scope 判定 → Ecosystem 検出 → Profile raw load / migration / diff resolve → Schema validation → Adapter render plan → caller-confirmed write。

### D6: `.specflow/profile.json` を `.gitignore` から除外する

**選択:** `src/lib/project-gitignore.ts` の gitignore 生成ロジックを確認し、`.specflow/profile.json` が ignore されないことを保証する。既存の `.specflow/config.env` と `.specflow/runs/` は引き続き ignore する。

**理由:** Profile はチーム共有の committed artifact。config.env（ローカル設定）や runs/（揮発性）とは性質が異なる。

### D7: Profile validation を全読み取りエントリポイントに適用する

**選択:** `src/lib/schemas.ts` に追加する profile validator を、setup rerun、`specflow-init --update`、Claude renderer の全てで共有する。全 entrypoint は「その entrypoint が実際に消費する current schema object」に対して validation を実行し、invalid profile はどのエントリポイントでも処理を中断する。version 判定のための最小 `schemaVersion` sniff は validation 前に許容する。setup では raw payload 全体を current schema で即 validate するのではなく、sniff/migration 後の current object を validate 対象にする。

**理由:** Profile は複数のコマンドから読み取られる shared artifact。validation が一箇所でも欠けると、invalid な profile から CLAUDE.md が生成されるリスクがある。

### D7a: setup は version-aware loader、その他 reader は strict loader を使い分ける

**選択:** `src/lib/profile-schema.ts` は 2 つの load path を持つ。`loadProfileForSetup()` は raw JSON read → 最小 object guard → `schemaVersion` sniff → current より古ければ migrate → current schema validate の順で処理する。`readProfileStrict()` は raw JSON read → 最小 object guard → `schemaVersion` sniff → older/newer mismatch なら remediation 付きで strict-abort → current schema validate の順で処理し、`specflow-init --update`、renderer、将来の非-setup reader で共有する。validate-on-read の例外はこの `schemaVersion` sniff と setup migration 前の最小 object guard だけで、setup も migration 後の current object には必ず validation を通す。

**理由:** proposal の「全読み取り元で validation」を維持しつつ、setup にだけ migration responsibility を持たせるため。古い profile を current-schema validation 前に救済できる一方、通常 reader は version mismatch を strict abort して template/profile drift を隠さない。

**代替案:** 全 reader で自動 migration を行う → shared artifact が暗黙に書き換わり、`specflow-init --update` と renderer の責務境界が曖昧になる。

### D7b: Legacy `CLAUDE.md` migration の確認は caller が所有する

**選択:** `src/lib/claude-renderer.ts` は file write を行わず、`RenderResult` を返す pure module にする。result は `nextContent` に加えて `warning`、`diffPreview`、`writeDisposition`（`safe-write` / `confirmation-required` / `abort`）を持ち、marker-less `CLAUDE.md` では `legacy-migration` + `confirmation-required` result を返す。`specflow.setup` と `src/bin/specflow-init.ts` は renderer が返した warning / diffPreview をそのまま表示し、ユーザーが accept した場合のみ `CLAUDE.md` を書き換える。reject 時はファイルを変更しない。

**理由:** setup と `--update` はどちらも profile/template 変更後に自動 render へ進むため、confirmation を明示的に flow に組み込まないと silent rewrite が起こりうる。diff 生成は renderer に集中させつつ、実際の write decision は対話フロー側に残すのが責務分離として最も明確。

**代替案:** renderer が直接書き込む → legacy migration の warning / diff / confirmation 要件を満たせない。

### D7c: `CLAUDE.md` の write path は renderer disposition を必ず尊重する

**選択:** `specflow.setup` と `specflow-init --update` は renderer の `writeDisposition` を見て分岐する。`safe-write` のみ自動で書き込み可能、`confirmation-required` は warning + diff を表示して明示 accept/reject を得た場合のみ書き込み、`abort` は write せず終了する。reject、または confirmation を得られないケースでは file write にフォールバックしない。caller は renderer result を解釈するが、migration diff の生成規則自体は renderer 側に集中させる。

**理由:** legacy migration の確認要件は renderer 実装だけでは完結せず、実際の write path に適用されて初めて silent rewrite リスクを除去できる。setup と `--update` の両方で同じ gate を使うことで、profile 更新起点・template 更新起点のどちらでも動作が一致する。

**代替案:** setup だけ confirmation を持ち `--update` は自動書き込みする → template 更新時に手動編集済み `CLAUDE.md` を破壊するリスクが残る。

## File Change Plan

### New files

| File | Responsibility |
|------|----------------|
| `src/lib/profile-schema.ts` | Profile TypeScript 型定義、schema version 定数、version-aware / strict load path、profile 読み書きユーティリティ |
| `src/lib/agent-context-template.ts` | Five-layer core contract（layer 定義、namespace、precedence、adapter-facing interface、resolved envelope helper） |
| `src/lib/ecosystem-detector.ts` | エコシステム検出ロジック（proposal の検出マトリクス実装） |
| `src/lib/claude-renderer.ts` | Profile → CLAUDE.md render planning（マーカーベース managed/unmanaged、warning/diff/`writeDisposition` を返す） |
| `src/lib/profile-diff.ts` | Profile の field-level diff と対話的 resolve ロジック |
| `assets/template/CLAUDE.md` | v2 template（managed マーカー + profile 参照 slot）— 既存ファイルを上書き |

### Modified files

| File | Change |
|------|--------|
| `src/lib/schemas.ts` | `profile` schema validator の追加 |
| `src/contracts/templates.ts` | `template-claude-md` contract の sourcePath 更新（v2 template を参照） |
| `src/contracts/command-bodies.ts` | `specflow.setup` の全 sections を書き換え（setup-only migration、renderer warning/diff の表示、render disposition handling、legacy write confirmation を含む） |
| `src/bin/specflow-init.ts` | `--update` フローを strict profile read + renderer warning/diff の表示 + render disposition handling + legacy write confirmation に更新 |
| `src/lib/project-gitignore.ts` | `.specflow/profile.json` が ignore されないことを確認（必要に応じて除外ルール追加） |

### Unchanged files

| File | Reason |
|------|--------|
| `src/contracts/commands.ts` | setup command の contract メタデータ（id, description）は変更不要 |
| `src/contracts/install.ts` | install plan は template contract 参照で間接的に更新される |
| `src/lib/template-files.ts` | 新規 dotfile alias は不要（profile.json は template ではない） |

## Risks / Trade-offs

### [Risk] Setup command body が大きくなりすぎる
→ **Mitigation:** 検出・validation・rendering ロジックを `src/lib/` に分離し、command body はフロー制御のみを記述する。

### [Risk] 既存 CLAUDE.md カスタマイズの破損
→ **Mitigation:** Legacy migration は非破壊（マーカーなしの場合は既存全体を unmanaged として保全）。renderer は warning と diffPreview を返し、setup / `specflow-init --update` がユーザー確認を得るまで write しない。マーカー異常時は render を中断する。

### [Risk] Profile schema の将来的な拡張が困難
→ **Mitigation:** `schemaVersion` による monotonic versioning。`commands` と `directories` は closed object で拡張は version bump が必要だが、top-level の optional array フィールドは追加しやすい構造。

### [Risk] setup 用 migration path と strict reader の挙動が乖離する
→ **Mitigation:** version sniff / migrate / validate の順序を `profile-schema.ts` に集約し、setup は `loadProfileForSetup()`、その他 reader は `readProfileStrict()` を使う。古い profile の rerun と older/newer version mismatch をテストで固定する。

### [Risk] `specflow-analyze` との機能重複
→ **Mitigation:** `ecosystem-detector.ts` は profile 生成に特化した軽量モジュール。`specflow-analyze` は汎用解析ツールとして残し、setup は ecosystem-detector を使う。将来的に specflow-analyze が ecosystem-detector を内部利用する統合は可能。

### [Trade-off] 非対話モードの欠如
v1 は対話専用。CI/CD や自動化環境では setup を実行できない。ただし profile.json はコミットされる shared artifact なので、チームの誰かが一度 setup を実行すれば他のメンバーは git pull で取得できる。

## Migration Plan

1. **Core contract 追加:** `src/lib/agent-context-template.ts` で 5 layer / namespace / precedence / adapter-facing interface を定義
2. **Template 更新:** `assets/template/CLAUDE.md` を v2（managed マーカー付き）に更新
3. **Lib モジュール追加:** `profile-schema.ts`, `ecosystem-detector.ts`, `claude-renderer.ts`, `profile-diff.ts` を追加
4. **Schema validator と load path 追加:** `schemas.ts` に profile validator を追加し、`profile-schema.ts` に strict/setup loader と migration を実装
5. **Flow 更新:** `specflow.setup` と `specflow-init --update` に render planning、`writeDisposition` handling、legacy write confirmation を組み込む
6. **Gitignore 確認:** `.specflow/profile.json` が ignore されないことを確認
7. **Build & test:** 全既存テストが通ることを確認
8. **既存ユーザー移行:** `specflow-init --update` で template を更新（legacy `CLAUDE.md` なら確認付き）→ `setup` で profile を生成 / 古い profile を migration

Rollback: template contract を旧 sourcePath に戻し、lib モジュールを削除すれば完全に元に戻る。

## Open Questions

- `specflow-analyze` と `ecosystem-detector` の将来的な統合タイミング — design phase では分離を優先し、統合は別 issue で扱う
