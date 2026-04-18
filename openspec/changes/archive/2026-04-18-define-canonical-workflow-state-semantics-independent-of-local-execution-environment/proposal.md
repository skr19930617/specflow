## Why

specflow の core が actor や execution environment を越えて成立するためには、
`RunState` が「workflow instance の正本として何を表すのか」が意味論として固定されて
いる必要がある。現状の run-state 型は runtime-agnostic な workflow state と
local filesystem / git-backed reference implementation の execution metadata
を同じ surface に同居させており、どこまでが canonical で、どこからが adapter-private
なのかが仕様上明示されていない。この境界が曖昧な限り、server-side runtime や
alternate UI が依存できる state surface を薄く定義できない。

この change は、型分離そのものではなく **canonical workflow state が意味論として
何を指すのか** を spec レベルで固定することを目的とする。既存の
`workflow-run-state` / `runstate-adapter-extension` は type-level mechanics と
CLI contract を定めているが、「どの field が canonical か」「どの field が
adapter-private か」を規定する semantic contract が独立した capability としては
まだ存在しない。

Issue: https://github.com/skr19930617/specflow/issues/164

## What Changes

- `canonical-workflow-state` capability を新規に追加し、workflow core が保持すべき
  canonical state の意味論と、adapter execution state との境界を明文化する。
  - runtime-agnostic に保持されるべき canonical field 群とその semantic role
    (run identity / change identity / current phase / lifecycle status /
     allowed events / actor identity / source metadata / history /
     previous run linkage) を規定する。
  - adapter execution state (local filesystem path, git worktree path,
    cached summary path 等) が canonical surface に含まれない根拠と位置づけを
    規定する。
  - server / UI / alternate runtime が依存してよい state surface を
    「canonical surface」として明文化する。
  - local reference implementation に残してよい adapter-private state の
    範囲を明文化する。
- 既存の `workflow-run-state` capability には SEMANTIC REFERENCE を追加し、
  type-level partition (`CoreRunState` / `LocalRunState`) が新規 capability
  の semantic contract に準拠することを明示する。
  - 既存 field list の変更・追加・削除は行わない (non-goal)。

## Capabilities

### New Capabilities
- `canonical-workflow-state`: workflow instance の canonical state semantics を
  runtime-agnostic に定義し、adapter execution state との境界を明文化する
  semantic contract。

### Modified Capabilities
- `workflow-run-state`: 既存の `CoreRunState` / `LocalRunState` 型分離が
  `canonical-workflow-state` の semantic contract に準拠する、という
  normative reference を追加する。field 追加・削除・改名は行わない。

## Impact

- 仕様面:
  - `openspec/specs/canonical-workflow-state/spec.md` が新規に追加される。
  - `openspec/specs/workflow-run-state/spec.md` に semantic reference 節が追加される。
- 実装面:
  - この change 単独では field 移動・型改名・CLI 挙動変更を伴わない。
  - 将来の server / UI / alternate runtime 実装は新 capability を canonical
    surface のソースとして参照できる。
- Non-goals:
  - DB schema の設計。
  - server / review transport / event streaming の実装。
  - interchange / serialization format (JSON schema, protobuf 等) の規定。
  - canonical surface の stability / versioning policy (semver 等) の規定。
  - `CoreRunState` / `LocalRunState` の field 構成変更。

## Clarification Decisions

Proposal challenge (C1–C6) に対する解像度。design phase 以降はこれらを前提とする。

- **C1 semantic role 粒度**: canonical surface を構成する 9 role
  (run identity / change identity / current phase / lifecycle status /
   allowed events / actor identity / source metadata / history /
   previous run linkage) については、この spec 内で各 role の意味論
  (purpose, runtime-agnostic であることの根拠, 含まれるべき情報の概要) を
  個別に明文化する。field-by-field の型定義は既存
  `workflow-run-state` の記述を継続して使用する。
- **C2 stability guarantee**: canonical surface の semver / breaking
  change policy はこの spec のスコープ外 (Non-goal 参照)。本 spec は
  「canonical surface が contract point として存在する」ことまでを
  固定し、stability policy は後続 capability に委ねる。
- **C3 adapter-private 定義戦略**: exclusion rule を採用する。
  canonical surface に含まれない state は全て adapter-private と
  みなされる。既知の local adapter field は informative example として
  記載するが、normative な exhaustive list は作成しない。
- **C4 現行型との不整合発見時の扱い**: この change 内では既存
  `CoreRunState` / `LocalRunState` の field 構成を変更しない。
  semantic contract を書き下した結果として不整合が検出された場合は、
  本 spec の Notes section に discrepancy を記録し、別 change として
  follow-up する。
- **C5 serialization / transport format**: 明示的にスコープ外
  (Non-goal に追加済み)。canonical surface が意味論として固定された後に、
  別 capability で interchange format を定義する余地を残す。
- **C6 `workflow-run-state` への reference の性質**: **normative**。
  新 capability が canonical semantics の source of truth となり、
  `workflow-run-state` の型分離は canonical semantics に準拠する、
  という関係を宣言する。既存 scenario の書き換えや削除は行わない。
