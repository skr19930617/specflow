## Why

specflow の core は特定の actor（人間 / AI）や surface（CLI / Slack / Web UI）に依存すべきではない。
現状、workflow-run-state や review-orchestration は暗黙的に「ローカル CLI で人間が操作する」ことを前提としており、agent-context-template のみが surface 分離を context rendering に限定して実現している。
actor と surface を横断的な抽象モデルとして定義することで、人間・AI・自動化を同じ workflow semantics で扱える基盤を確立する。

- Source: [GitHub Issue #94](https://github.com/skr19930617/specflow/issues/94)

## What Changes

- actor taxonomy（human / ai-agent / automation）を定義し、各 actor の workflow 操作権限・capability を明確化する
  - automation は CI/cron/webhook など非対話型トリガーを指す第三の actor 種別
- surface taxonomy（local-cli / remote-api / agent-native / batch）を定義し、actor → workflow のインタラクション媒介を整理する
- actor/surface の governing rules を定義する（下記「Actor–Surface Rules」セクション参照）
- approval / clarify / review の actor semantics を定義する（誰が何を承認・質問・レビューできるか）
- abstract operation と concrete workflow transition の対応関係を定義する（`accept_*`, `*_review_approved`, `revise_*` など）
- run-state に actor provenance の記録原則を定義する（下記「Provenance Rules」セクション参照）
- slash command は surface であり core ではないという原則を明記する
- agent-context-template の既存 surface 分離との整合方針を明記する

## Actor–Surface Rules

以下の不変条件を design/spec で保証する:

1. **Permission は actor が決定する**: workflow 操作（approve / reject / advance）の可否は actor 種別で決まる。surface は操作の可否を変更しない
2. **Surface は presentation を制御する**: surface は actor にどの操作を提示するか、どう表示するかを制御するが、core の state machine に新しい遷移を追加しない
3. **有効な actor–surface ペア**: すべての actor はすべての surface から操作可能であることを原則とする。ただし特定の組み合わせに制約がある場合は spec で明示する

| 操作 | human | ai-agent | automation |
|------|-------|----------|------------|
| propose | yes | yes | yes |
| clarify (interactive) | yes | yes | no (non-interactive) |
| approve | yes | yes (delegated) | no |
| reject | yes | no | no |
| review | yes | yes | no |
| advance (non-gated) | yes | yes | yes |

4. **Surface-neutral core**: core workflow logic は surface を意識しない。surface 固有のロジック（slash command routing、UI rendering）は adapter 層に属する

## Concrete Workflow Transition Mapping

actor/surface model は抽象 operation だけでなく、workflow-run-state が公開する concrete transition にも対応づける。permission / delegation check の分類キーは event 名だけでなく `(source phase, event)` とし、authoritative workflow machine の全 concrete event をちょうど 1 つの abstract operation または review outcome に割り当てる:

1. `accept_spec` / `accept_design` / `accept_apply` は abstract `approve` に対応し、human または delegated ai-agent のみが実行できる gated transition とする
2. `proposal_review_approved` / `design_review_approved` / `apply_review_approved` は workflow `approve` ではなく、binding な `review_approved` outcome の concrete transition とする。undelegated ai-agent の `review_approved` は advisory のままであり、これらの transition を発火させてはならない
3. `review_proposal` / `review_design` / `review_apply` は abstract `review` に対応する
4. `check_scope` / `continue_proposal` / `validate_spec` / `spec_validated` と utility branch の transition は abstract `advance`（non-gated）に対応する
5. `revise_proposal` は source phase に依存して分類する。`proposal_review` からの `revise_proposal` は `request_changes` outcome、`spec_draft` からの `revise_proposal` は non-gated `advance`
6. `clarify` には standalone の machine event はなく、clarify-capable phase 内の対話操作として扱う。`continue_proposal` や `revise_proposal` を `clarify` permission の根拠にしてはならない
7. `reject` は `proposal_draft` / `proposal_scope` / `proposal_clarify` / `proposal_review` / `spec_draft` / `spec_validate` / `spec_ready` / `design_draft` / `design_review` / `design_ready` / `apply_draft` / `apply_review` / `apply_ready` から `rejected` へ遷移する concrete event として、常に abstract `reject` に対応する

## Gated Decision Semantics

approval / reject は workflow の中で特に重要な gated decision であり、actor ごとの振る舞いを明確にする:

1. **reject**: human のみが実行可能。ai-agent と automation は reject を発行できない。reject は run を終了状態に遷移させる不可逆操作であり、人間の意思決定を必須とする
2. **approve (delegated)**: ai-agent は human から明示的に委任された場合にのみ workflow approve（gated 遷移）を実行できる。委任がない場合、ai-agent は approve を recommend（advisory）することはできるが、workflow を遷移させることはできない
3. **automation の制約**: automation は gated decision（approve / reject）を発行できない。automation が発行できるのは propose、non-gated advance、および system event（timeout / auto-advance）のみ

## Delegation Rules

ai-agent への approve 委任に関する最小不変条件:

1. **委任権者**: delegation を付与できるのは human actor のみ
2. **スコープ**: delegation は run 単位でスコープされる。あるrun での delegation は別の run に波及しない
3. **付与方法**: run 開始時の設定（run metadata）または proposal 内の明示的宣言で付与する。具体的なフォーマットは design フェーズで決定する
4. **監査可能性**: delegation の付与・行使は provenance として記録される。誰が委任し、誰が行使したかを後から追跡可能でなければならない
5. **デフォルト**: delegation が明示されていない場合、ai-agent は approve を行使できない（safe default）

## Review Decision vs Workflow Approval

review outcome と workflow approval は異なる概念であり、混同してはならない:

1. **Review outcome**: reviewer actor（human / ai-agent）が review フェーズで発行する判定。vocabulary は `review_approved` / `request_changes` / `block` の 3 種。これは review フェーズ内の判定であり、workflow の gated 遷移とは別の概念
2. **Workflow approval**: proposal や design の承認など、workflow の gated 遷移を実行する操作。Gated Decision Semantics の approve ルールに従う
3. **ai-agent reviewer の review outcome**: ai-agent reviewer は `review_approved` / `request_changes` / `block` を発行できる。ただし、これは review フェーズ内の判定であり、workflow の gated 遷移を直接トリガーしない。review outcome → workflow 遷移のマッピングは review-orchestration spec で定義する
4. **Override**: ai-agent reviewer の `block` は human による override が可能。human reviewer の判定に対する override は不可
5. **Ledger snapshot の自己完結性**: review ledger の round summary は `reviewer_actor` / `reviewer_actor_id` に加えて `approval_binding` (`binding` / `advisory` / `not_applicable`) と `delegation_active` を保持し、delegated な binding approval の場合は `delegated_by` / `delegated_by_id` も保持する。これにより `current-phase.md` を含む downstream consumer は ledger snapshot だけで advisory と binding を区別できる

## Provenance Rules

actor provenance に関する互換性・デフォルト規則:

1. **記録原則**: 各フェーズ遷移に actor 情報を記録すべきである（具体的なフィールド設計は design フェーズに委ねる）
2. **レガシー run の扱い**: provenance フィールドが存在しない既存 run は `actor: "unknown"` として扱い、既存動作を破壊しない
3. **Surface provenance**: surface 情報の永続化は OPTIONAL とする。actor は REQUIRED、surface は MAY
4. **System-generated 遷移**: timeout / auto-advance など system が生成する遷移は `actor: "automation"` として記録する

## Capabilities

### New Capabilities
- `actor-surface-model`: actor と surface の横断的抽象モデル。taxonomy 定義、governing rules、actor semantics、surface contract、および既存 spec への影響範囲を規定する

### Modified Capabilities
- `workflow-run-state`: run-state に actor provenance の記録原則を反映する
- `review-orchestration`: review handoff における actor semantics（human reviewer / AI reviewer / automation の区別）を追加し、review ledger に binding/advisory と delegation 状態を永続化する

## Impact

- `openspec/specs/actor-surface-model/spec.md` を新規作成
- `openspec/specs/workflow-run-state/spec.md` に actor provenance 要件を追加
- `openspec/specs/review-orchestration/spec.md` に actor-aware review semantics を追加
- `docs/architecture.md` に actor/surface モデルのセクションを追加し、core/adapter boundary モデルとの整合を明記する
- `agent-context-template` spec との関係: 既存の surface 分離（context rendering 用）は本モデルの surface taxonomy に包含される。agent-context-template の surface adapter パターンはそのまま維持し、本 proposal では参照のみとする（spec 変更は不要）。将来的な用語統一は別 proposal で対応する
- コード変更は本 proposal のスコープ外（spec + docs レベルの定義のみ）
