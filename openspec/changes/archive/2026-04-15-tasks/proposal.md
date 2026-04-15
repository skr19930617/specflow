## Why

When an agent executes `/specflow.apply`, each completed bundle requires a status update in `openspec/changes/<CHANGE_ID>/task-graph.json` plus a re-render of `tasks.md`. A CLI that does this already exists — `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` (see [src/bin/specflow-advance-bundle.ts](src/bin/specflow-advance-bundle.ts)) — but the `/specflow.apply` and `/specflow.fix_apply` command guides never tell the agent to use it. So the agent invents ad-hoc `node -e '…'` scripts per bundle (see issue [skr19930617/specflow#147](https://github.com/skr19930617/specflow/issues/147)).

Source reference:
- Source provider: github
- Source title: tasksの更新で毎回コマンドを作っている
- Source reference: https://github.com/skr19930617/specflow/issues/147

Writing one-off scripts bypasses the canonical path (`advanceBundleStatus` → schema validation → child-task normalization → atomic `tasks.md` re-render → coercion audit log). That re-introduces exactly the drift the task-planner spec was written to prevent: unnormalized child statuses, stale `tasks.md`, and no audit trail of coercions.

## What Changes

- **`/specflow.apply` switches to the CLI.** In `src/contracts/command-bodies.ts`, the `specflow.apply` → "Step 1: Apply Draft and Implement" body replaces the current free-form instruction ("update the bundle status in `task-graph.json` … and re-render `tasks.md`") with an explicit requirement to call `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` for **every** bundle status transition (all four: `pending → in_progress`, `in_progress → done`, `pending → skipped`, any `→ done` direct), and explicitly prohibits `node -e` / `jq` / manual writes to `task-graph.json` / `tasks.md` in this path.
- **Fail-fast on CLI error.** When `specflow-advance-bundle` exits non-zero (schema invalid, unknown bundle, invalid transition), `/specflow.apply` aborts the apply immediately, surfaces the CLI's JSON error envelope to the user, and leaves the run in `apply_draft`. No auto-retry, no skip-and-continue. The user decides: manual intervention or `/specflow.fix_apply`.
- **Pre-apply detection rule.** Before Step 1 runs any bundle transitions, the agent determines the path:
  - `task-graph.json` absent → **legacy fallback** (current behavior: mark tasks in `tasks.md` directly).
  - `task-graph.json` present and passes `validateTaskGraph` → **CLI path** (mandatory).
  - `task-graph.json` present but malformed → **abort with error** in `apply_draft`; user fixes or regenerates the task graph before retry.
- **Strict mutation contract (codify only).** `task-planner` spec is strengthened: in apply-class workflows, `specflow-advance-bundle` is the only supported mutation entry point for bundle/task statuses when `task-graph.json` exists. Direct writes to `task-graph.json` / `tasks.md` from these flows are a contract violation. **Scope note:** this change only codifies the rule. Automated detection in apply review (diff heuristics, reviewer prompt changes, or orchestrator scanning) is deliberately out of scope — tracked as a separate change.
- **`/specflow.fix_apply` safety-net line.** `/specflow.fix_apply` keeps delegating to the `specflow-review-apply fix-review` orchestrator (no flow change). The "Important Rules" section gains one line: "if the fix loop requires updating `task-graph.json` / `tasks.md`, use `specflow-advance-bundle`; inline edits are a contract violation per `task-planner`."
- **Utility CLI registration (first-class).** `utility-cli-suite` spec adds `specflow-advance-bundle` as a documented distribution CLI with its positional-arg signature, allowed `NEW_STATUS` values (`pending | in_progress | done | skipped`), stdout JSON envelope (success / error shape), stderr `task_status_coercion` audit line format, and exit-code semantics. Packaged alongside the other `specflow-*` binaries.
- **Done-criteria test (required).** A test asserting the generated `dist/package/global/commands/specflow.apply.md` contains the `specflow-advance-bundle` call (and does not contain example inline edit scripts) is part of this change's acceptance criteria. Likely extends an existing `generation.test.ts`-style suite.
- **No new CLI, no new library code.** The issue asks "add one if it doesn't exist, otherwise use it." It exists ([src/bin/specflow-advance-bundle.ts](src/bin/specflow-advance-bundle.ts), backed by `advanceBundleStatus` in `src/lib/task-planner/advance.ts`). This change is wiring + contract only.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `slash-command-guides`:
  - `/specflow.apply` Step 1 MUST detect `task-graph.json` presence and schema validity, then choose the path: absent → legacy fallback; present + valid → CLI-mandatory; present + malformed → abort with error and remain in `apply_draft`.
  - In the CLI-mandatory path, every bundle status transition (all four: `pending → in_progress`, `in_progress → done`, `pending → skipped`, `pending → done`) MUST be performed via `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`. Inline `node -e` / `jq` / manual writes to `task-graph.json` or `tasks.md` are prohibited.
  - If `specflow-advance-bundle` exits non-zero, Step 1 aborts immediately, surfaces the CLI JSON error envelope, and leaves the run in `apply_draft` (fail-fast; no retry; no skip).
  - `/specflow.fix_apply` Important Rules gains a single safety-net line pointing to `specflow-advance-bundle` for any `task-graph.json` / `tasks.md` mutation arising inside a fix loop.
- `task-planner`: In apply-class workflows where `task-graph.json` exists and is schema-valid, `specflow-advance-bundle` is the only supported mutation entry point for bundle/task statuses. Direct writes to `task-graph.json` or `tasks.md` from these flows are a contract violation. (Automated detection of violations is deliberately deferred to a follow-up change.)
- `utility-cli-suite`: Register `specflow-advance-bundle` as a first-class distribution CLI with:
  - Positional arguments: `<CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`
  - `NEW_STATUS` ∈ `{pending, in_progress, done, skipped}`
  - Stdout success envelope: `{status: "success", change_id, bundle_id, new_status, coercions}`
  - Stdout error envelope: `{status: "error", error, change_id?, bundle_id?, new_status?}`
  - Stderr audit lines: one `{event: "task_status_coercion", change_id, bundle_id, task_id, from_status, to_status}` JSON object per child-task coercion
  - Exit code: `0` on success, `1` on any error (no other codes)

## Impact

- **Source of truth for command docs:** `src/contracts/command-bodies.ts` — the `"specflow.apply"` → "Step 1: Apply Draft and Implement" body is rewritten (detection rule, CLI-mandatory instruction, fail-fast error handling). The `"specflow.fix_apply"` → "Important Rules" body gains one safety-net line.
- **Generated artifacts:** `dist/package/global/commands/specflow.apply.md` and `dist/package/global/commands/specflow.fix_apply.md` are regenerated via the existing build pipeline.
- **Specs:** `openspec/specs/slash-command-guides/spec.md`, `openspec/specs/task-planner/spec.md`, `openspec/specs/utility-cli-suite/spec.md` each receive a delta.
- **Code:** No new library code. `src/bin/specflow-advance-bundle.ts` and `src/lib/task-planner/advance.ts` already implement the required behavior.
- **Tests (required for acceptance):**
  - A test asserting the regenerated `dist/package/global/commands/specflow.apply.md` contains `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` and contains the detection rule / fail-fast language, and does **not** contain example `node -e` or `jq` mutation scripts. Likely added to the existing `src/tests/generation.test.ts` (or a peer) so `command-bodies.ts` and the dist output cannot drift apart silently.
- **Out of scope (tracked separately):**
  - Automated detection of contract violations during apply review (diff scanning / review-agent prompt updates).
  - Deprecating or migrating the `task-graph.json`-absent legacy fallback.
- **Runtime behavior:** After this change, a `/specflow.apply` run with a valid `task-graph.json` invokes `specflow-advance-bundle` once per bundle transition, eliminating drift risk from ad-hoc scripts and producing a structured `task_status_coercion` audit log on stderr for every coerced child task. Malformed `task-graph.json` fails fast with a clear error. The legacy path is unchanged.
