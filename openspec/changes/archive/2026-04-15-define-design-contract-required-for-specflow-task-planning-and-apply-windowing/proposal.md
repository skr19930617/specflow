## Why

design artifact は現在、自由記述の implementation explanation として機能しているが、task planner が bundle 境界・依存関係・apply window を安定して導出するために必要な structured information を含んでいない。concern / state / contract / boundary 情報が design に明示されていないと、task graph の bundle extraction と completion semantics が不安定になる。

今後の design は implementation explanation であるだけでなく、task planning input としても機能する必要がある。

- Source: [GitHub Issue #138](https://github.com/skr19930617/specflow/issues/138)

## What Changes

- design artifact に最低限含めるべき planning-oriented information（Concerns, State model, Contract boundaries, Integration points, Implementation ordering hints, Completion semantics）を **MUST** セクションとして定義する
- 全 MUST heading は常に存在必須。該当しないセクションには "N/A" を記載して満たす（heading 省略は不可）
- design 生成の agent 指示 template に planning-relevant structure を要求する項目を追加する
- bundle extraction と apply windowing の観点から design quality gate（"task-plannable" quality）を明文化する:
  - **構造的検証**: 必須 heading の存在 + 各セクションが非空（最低 1 行以上の内容）であることを検証
  - **内容品質**: review agent に委ねる（構造検証の対象外）
- design review criteria に "task-plannable" quality を追加する。gate fail 時は既存の design review フロー（review agent が request_changes → 著者修正 → 再 review）を再利用する
- **後方互換性**: design.md がまだ存在しない change にのみ新基準を適用。既に design.md が存在する change は旧基準のまま（migration 不要）

## Capabilities

### New Capabilities
- `design-planning-contract`: design artifact が task planner の入力として機能するために必要な planning-oriented sections（concerns, state/lifecycle, contracts/interfaces, persistence/ownership, integration points, ordering/dependency notes, completion conditions）の要件を定義する

### Modified Capabilities
- `review-orchestration`: design review の判定基準に "task-plannable" quality gate を追加し、planning-relevant structure が不足している design を検出する
- `contract-driven-distribution`: design 生成に使用する prompt/template contract に planning-oriented sections を要求する指示を追加する

## Impact

- `openspec/changes/` 下の design.md 生成フローが変更される
- design review agent の判定ロジックに新しい quality gate が追加される
- 既存の prompt/template contract（design 生成指示）に新しいセクション要求が追加される
- task-planner spec の `generateTaskGraph` は変更なし — task planner が planning sections を consume する対応は別 change で扱う（non-goal: task planner runtime の実装・変更は対象外）
