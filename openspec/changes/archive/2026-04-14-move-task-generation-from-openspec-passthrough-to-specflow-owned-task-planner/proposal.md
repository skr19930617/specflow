## Why

現状の `tasks.md` は OpenSpec artifact pipeline の template/instruction passthrough として生成されており、human-readable checklist としては十分だが、以下の用途には構造的に弱い:

- apply phase で next execution window を切り出す
- specialist sub-agent に bounded context を渡す
- bundle dependency graph を持つ
- completion semantics を output artifact で判定する（task count ではなく）

specflow が workflow execution core として成熟するために、design から executable task graph を導出する責務を specflow 側に持つべき。

Source: https://github.com/skr19930617/specflow/issues/137

## What Changes

- tasks 生成の ownership を OpenSpec passthrough から specflow 側の責務に移行する
- design phase 内で design.md 生成直後に、specflow が LLM-based 推論で machine-readable な task graph (`task-graph.json`) を生成する（OpenSpec tasks template は完全に無効化し使用しない）
- task graph 生成の出力は JSON schema validation で品質担保し、validation failure 時は retry する
- task graph は bundle-based structure を持ち、各 bundle に以下のフィールドを含む:
  - `id`: bundle の一意識別子
  - `title`: bundle の名称
  - `goal`: bundle の目的
  - `depends_on`: soft dependency（依存先 bundle の output artifact が available なら並行実行可）
  - `inputs`: bundle が必要とする入力 artifact
  - `outputs`: bundle が生成する output artifact
  - `status`: bundle の実行状態 (`pending` | `in_progress` | `done` | `skipped`)
  - `tasks`: bundle 内の個別タスク一覧
  - `owner_capabilities`: baseline spec names への参照（bundle がどの spec の領域に属するかを示す）
- bundle completion は outputs に定義された artifact が全て存在することで判定する（output artifact 存在チェック）
- human-readable `tasks.md` は task graph から render する（task graph が single source of truth）
- apply phase が task graph を正本として next window を切り出し、実行後に bundle status を write-back する (`pending` → `in_progress` → `done`)
- `task-graph` を新しい change-domain artifact type として artifact-ownership-model に追加する
- 既存の進行中 change（task-graph.json なし）は tasks.md を legacy mode で直接参照する fallback を提供する

## Capabilities

### New Capabilities
- `task-planner`: design.md から LLM-based 推論で machine-readable task graph を生成する specflow-owned モジュール。bundle-based schema 定義、JSON schema validation + retry、task graph 生成ロジック、tasks.md render、apply phase からの status write-back を含む。

### Modified Capabilities
- `artifact-ownership-model`: change-domain artifact types に `task-graph` を追加。ChangeArtifactStore に task-graph 用の read/write/exists 操作を含める。artifact-phase gate matrix に `oneOf(task-graph, tasks)` を追加し、legacy fallback を提供する。

## Impact

- `src/lib/local-fs-change-artifact-store.ts`: `task-graph` artifact type の path resolution を追加
- `src/contracts/command-bodies.ts`: design phase の command body を更新し、task graph 生成を specflow 側で行う記述に変更
- `/specflow.design` skill: tasks 生成フローを OpenSpec passthrough から specflow task-planner 呼び出しに切り替え
- `src/core/run-commands.ts` (or equivalent): apply phase の artifact gate に task-graph を追加（legacy fallback 付き）
- OpenSpec tasks template/instruction: design phase での使用を完全停止
