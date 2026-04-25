## Context

`/specflow` today uses `git checkout -b <CHANGE_ID>` (see `ensureBranch` in `src/bin/specflow-prepare-change.ts:118-139`) on the user's repository root. That mutates the user's working tree and forces the user off whatever branch they were on. Subagent bundles already enjoy isolated worktrees under `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` (see `apply-worktree-integration` baseline), so the asymmetry between subagent and main is the immediate motivator.

The proposal locks down: main session runs in `.specflow/worktrees/<CHANGE_ID>/main/`, subagents move under `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`, the `<CHANGE_ID>` branch only exists inside the worktree, the user's repo is untouched, and the legacy branch-checkout mode is deleted wholesale (no migration, no flag).

Constraints inherited from the spec deltas:
- `LocalRunState` partition is exactly enumerated in `workflow-run-state` and guarded at compile time. Adding fields requires updating both the type and the drift-guard test.
- Core runtime modules under `src/core/**` cannot import `WorkspaceContext` and cannot use `LocalRunState` field names as object property keys; everything new must live in the wiring layer or a dedicated adapter.
- `apply-worktree-integration` integration target now reads `.specflow/worktrees/<CHANGE_ID>/main/` from run-state, not `process.cwd()` or `git rev-parse --show-toplevel`.
- All specflow CLIs (`specflow-prepare-change`, `specflow-run`, `specflow-design-artifacts`, watcher, dashboard, archive, approve) currently take `cwd = repo root` as gospel; they must be reworked to resolve `worktree_path` from run-state.

Stakeholders: `/specflow` users (no longer get their branch hijacked), the apply pipeline (now patches into a worktree), the watch/dashboard tooling (must follow the run-state path indirection), and downstream consumers of `LocalRunState`.

## Goals / Non-Goals

**Goals:**
- Replace branch-checkout with worktree creation in `specflow-prepare-change`, end-to-end, with no behavioural fallback.
- Keep the user's repository working tree untouched (HEAD, branch, staged/unstaged/untracked state) across the entire `/specflow` lifecycle.
- Move every main-session phase command's `cwd` to the worktree resolved from run-state.
- Push/PR from inside the worktree using the recorded base branch, not always `main`.
- Tear down the entire `.specflow/worktrees/<CHANGE_ID>/` subtree on terminal phases when the run is clean and complete; defer with `cleanup_pending = true` otherwise.
- Refuse to load any persisted `RunState` whose `worktree_path == repo_path` and `run_kind != "synthetic"` (legacy guard with synthetic-run exemption).

**Non-Goals:**
- Auto-migration of in-flight legacy runs. The team drains them manually before this lands; the code does not branch on a `legacy_mode` flag.
- Configurable worktree paths. `.specflow/worktrees/<CHANGE_ID>/main/` is fixed.
- Multi-base/branch features (e.g. stacked PRs, base-rebase). Out of scope for this change.
- Changes to `canonical-workflow-state`. Path semantics live in the local adapter; the canonical surface is unchanged.
- A new `specflow-cleanup-worktree` helper command. The deferred-cleanup story is "user resolves manually"; tooling for that is a follow-up.
- Concurrent `/specflow` runs for *different* changes have always been allowed in principle but were blocked in practice by branch contention; this change makes them work, but explicit concurrency hardening (lockfiles, coordination) is out of scope.

## Decisions

### D1. Path layout: `.specflow/worktrees/<CHANGE_ID>/{main, <RUN_ID>/<BUNDLE_ID>}`

Picked the per-change parent over flat `.specflow/worktrees/main/<CHANGE_ID>/` so that everything for one change cleans up in a single `rm -rf`. Subagent worktrees become siblings of main under the same parent. Rejected: a flat `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` (the existing layout) because it leaves orphans across changes; rejected configurability because Phase-1 should be opinionated.

### D2. Branch lives only inside the worktree, named `<CHANGE_ID>`

`git worktree add -b <CHANGE_ID> .specflow/worktrees/<CHANGE_ID>/main/ HEAD` creates the branch atomically with the worktree. The user-repo's branch ref is never updated. Reasoning: keep `change_name == branch_name`, no PR ergonomics regression, and detached-HEAD avoidance (rejected alternative C1-b: detached HEAD complicated push/PR semantics).

### D3. Base commit is the user-repo HEAD at first prepare-change

`git -C <user-repo> rev-parse HEAD` is captured *before* `git worktree add`, then passed as the third arg. Recorded in run-state as `base_commit` and (separately) as `base_branch` (`git -C <user-repo> branch --show-current`). Reasoning: matches the user's mental model ("I started this from feature/X, so the PR should target feature/X"). Rejected alternative C4-b (always default branch) because feature-branch starts would produce huge cross-feature diffs.

### D4. Reuse existing `.specflow/worktrees/<CHANGE_ID>/main/` as-is

The reuse predicate is "directory exists AND `git worktree list --porcelain` shows it tied to `refs/heads/<CHANGE_ID>`". On a hit, reuse without modification (no `git pull`, no checkout, no branch repoint). Rejected alternative C3-b (auto-prune and recreate) because it can erase uncommitted state; rejected C3-c (detect any same-named branch and reuse) because branch-without-worktree is exactly the conflict we want to fail-fast.

### D5. Conflict fail-fast (no auto-recovery, no automatic prune)

If the conventional path is occupied by a non-worktree directory, by a worktree pointing at a different branch, or by a worktree at a *different* path that owns `<CHANGE_ID>`, `prepare-change` exits non-zero with the offending path/branch in the message. The user fixes manually (`git worktree remove`, `git branch -D`, or pick a new change-id). Rejected silent prune for the same reason as D4.

`prepare-change` SHALL NOT run `git worktree prune` automatically. Stale or conflicting worktree state (including orphaned `.git` entries left by OS-level directory deletion) is surfaced for manual resolution, not auto-recovered. This is the single-path, fail-fast policy: detect and report, never silently mutate git worktree registry state. The user may run `git worktree prune` manually when needed.

### D6. `LocalRunState` extension: `base_commit`, `base_branch`, `cleanup_pending`

The drift-guard test in `src/tests/run-state-partition.test.ts` enforces exact key sets, so we extend both the type definition in `src/types/contracts.ts` AND the test. Three fields:
- `base_commit: string` — the SHA captured at worktree creation; immutable thereafter.
- `base_branch: string | null` — the user's branch at creation time (null when detached).
- `cleanup_pending: boolean` — flipped to `true` when a terminal phase defers cleanup. Default `false`.

Rejected alternative: stash these in a sidecar JSON. Run-state is already the authoritative ledger; an extra file fragments the source of truth.

### D7. Push/PR resolution

Inside the worktree:
1. `git push -u origin <CHANGE_ID>` (cwd = worktree path).
2. PR base resolution: read `base_branch` from run-state. If `base_branch` has an upstream tracking ref (`git -C <worktree> rev-parse --abbrev-ref <base_branch>@{upstream}` succeeds), use the remote-side branch name. Otherwise fall back to `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
3. `gh pr create --base <resolved> --head <CHANGE_ID> ...` (cwd = worktree path so `gh` picks the right remote).

Rejected: cherry-picking commits back into the user repo before pushing (C7-b). It re-introduces the contamination this change is removing.

### D8. Cleanup gating

Terminal phases (`approve`, `archive`, `reject`) compute a 2-bit gate at entry:
- `success_full`: terminal action returned exit 0, with no recorded partial-failure cause.
- `tree_clean`: for every worktree under `.specflow/worktrees/<CHANGE_ID>/`, `git -C <wt> status --porcelain` is empty.

If both bits are set → `git worktree remove` each (in any order; `git worktree remove --force` is NOT used) → `rm -rf .specflow/worktrees/<CHANGE_ID>/`.
Otherwise → write `cleanup_pending = true` to run-state, surface the offending paths/cause to stderr, exit 0 (the run is still terminal). Operator resolves and re-invokes the terminal phase to retry cleanup.

Rejected alternative: always force-remove on terminal entry (C6-b). It can destroy in-progress recovery work the operator was about to commit.

### D9. Legacy guard placement (with synthetic-run exemption)

The check `worktree_path === repo_path` lives in `specflow-prepare-change`'s wiring layer (where run-state is loaded), not in core. Core stays oblivious to local-adapter semantics per the existing `Core runtime commands are pure and perform no I/O` requirement. The check fires on `prepare-change` resume; it does NOT fire when other CLIs (e.g., `specflow-run get-field`) read the same record, because those flows are read-only and we still need them for inspection.

**Synthetic-run exemption**: The legacy guard SHALL NOT apply when `run_kind === "synthetic"`. Synthetic runs never carry a `repo_path`/`worktree_path` divergence by design (per `workflow-run-state` spec). The full predicate is: reject when `worktree_path === repo_path AND run_kind !== "synthetic"`.

### D10. cwd resolution for phase commands

Every command that today does `process.cwd()`/`git rev-parse --show-toplevel` and treats it as the integration target is migrated to: read run-state via `RunArtifactStore`, take `state.worktree_path` as the cwd. The user can still invoke `/specflow.<phase>` from anywhere; the resolution is run-id → run-state → worktree path.

The existing `WorkspaceContext` interface (`src/lib/workspace-context.ts:14-23`) already exposes `worktreePath()`. Today its concrete impl returns the same value as `projectRoot()`. We extend the local-fs implementation to take an optional override path so the wiring layer can construct a `WorkspaceContext` rooted at the main-session worktree when a `RUN_ID` is in scope.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|---|---|---|
| **Hard-coded `process.cwd()` in deeply-nested CLIs** finds its way into integration paths and silently uses the user repo. | Bundles get applied to the user's branch, defeating the change. | Add a smoke test that runs `/specflow.apply` end-to-end and asserts user repo HEAD did not move. Add a grep-guard test that fails if `src/bin/**` outside `specflow-prepare-change` and the workspace-context factory contains `process.cwd()` or `rev-parse --show-toplevel` for write paths. |
| **Disk usage growth.** Each change carries a full worktree. | A long-running developer accumulates many worktrees. | `.specflow/worktrees/<CHANGE_ID>/` is removed on terminal phases. Document that abandoned changes should be `/specflow.reject`'d; mention `git worktree prune`. |
| **gh CLI cwd assumptions.** `gh pr create` can mis-detect remotes if cwd is a worktree of a non-canonical repo. | PR creation fails or targets wrong remote. | Always run `gh` with `cwd = worktree path`; add an integration test that `gh pr create` works from inside `.specflow/worktrees/.../main/`. |
| **Reuse race**: two concurrent `/specflow` invocations for the same change-id. | Second invocation could observe a half-built worktree. | `git worktree add` is atomic; the reuse-vs-create branch is gated by checking `git worktree list --porcelain` (single-shot). Acceptable in Phase 1; document as a known limitation. |
| **Symlink / case-insensitive FS collisions** on macOS where `<CHANGE_ID>` casing differs. | Phantom conflicts. | `prepare-change` lowercases / normalizes change-ids consistently with the existing `deriveChangeId` rules; the conflict fail-fast already covers detection. |
| **Watcher cwd assumption.** `specflow-watch` reads artifacts from `process.cwd()` today, which would break under the new layout. | Watcher loses track of bundle progress. | Auditing the watcher path is part of this change's task list. The watcher already takes `<RUN_ID>` as input; resolution becomes "load run-state, use `worktree_path`". |
| **Ledger / dashboard CLIs that scan `openspec/changes/<CHANGE_ID>/` from the user repo path.** | Show stale or empty data because artifacts now live inside the worktree. | `openspec/changes/<CHANGE_ID>/` is created INSIDE the worktree (because `openspec new change` runs with cwd = worktree). Dashboard/archive readers must follow `worktree_path`. Captured as tasks. |
| **`openspec` CLI also assumes cwd.** | OpenSpec validate/instructions called from the wrong cwd produces noisy errors. | Wiring layer always invokes `openspec` with explicit `cwd = worktree path` (already the pattern in `prepare-change`; extend it elsewhere). |

## Migration Plan

This change is breaking and ships with no in-process migration:

1. Pre-merge: maintainers drain all in-flight `/specflow` runs (approve or reject) so that no run-state on disk has `worktree_path == repo_path` for non-synthetic runs.
2. Merge.
3. Post-merge: any old run-state still on disk (e.g., a developer's local stash) triggers the legacy guard on `prepare-change` resume; the user is told to manually approve/reject and start fresh.

Rollback: revert the merge commit. The new run-state with `base_commit`/`base_branch`/`cleanup_pending` is JSON-additive; older binaries ignore unknown fields, so a rollback only needs `git worktree remove` + `git branch -D` for any in-progress worktree-mode changes the user wants to migrate back to legacy.

## Resolved Policy Decisions

The following items were initially open questions; they are now resolved and encoded as binding design decisions:

- **Cleanup retries**: `cleanup_pending = true` does NOT block subsequent terminal-phase invocations. The gate re-evaluates each invocation; a clean+complete state on the retry triggers cleanup and clears `cleanup_pending`. (Encoded in D8.)
- **No automatic `git worktree prune`**: `prepare-change` SHALL NOT run `git worktree prune` automatically. Stale or conflicting worktree state is surfaced for manual resolution via D5's fail-fast contract. Running `git worktree prune` silently could mask user-relevant state (e.g., a directory deleted by the OS but containing recoverable work). The user may run `git worktree prune` manually if needed. (Encoded in D5.)
- **Legacy read-only inspection**: The legacy guard (`worktree_path == repo_path` rejection) fires only on `prepare-change` resume. Read-only inspection commands (`specflow-run status`, `specflow-run get-field`, etc.) can still load legacy records without error. (Encoded in D9.)

## Concerns

- **C-1: Worktree lifecycle (create / reuse / fail-fast).** The user-facing concern is "/specflow no longer hijacks my branch." Resolved by D1–D5 in `specflow-prepare-change`.
- **C-2: Run-state schema extension.** The persisted `RunState` must carry `base_commit`, `base_branch`, `cleanup_pending`. Resolved by D6 plus drift-guard test update.
- **C-3: Phase-command cwd routing.** All `/specflow.*` commands and the watcher must operate on the worktree, not the user repo. Resolved by D10.
- **C-4: Subagent dispatch retargeting.** Subagent base HEAD and patch-apply target shift to the main-session worktree. Resolved by the `apply-worktree-integration` and `bundle-subagent-execution` deltas.
- **C-5: Approve push & PR base.** PR targets the recorded `base_branch`, push runs from the worktree. Resolved by D7.
- **C-6: Terminal cleanup.** Approve/archive/reject tear down the worktree subtree iff clean and complete; otherwise defer. Resolved by D8.
- **C-7: Legacy guard.** Old run-states are rejected on resume. Resolved by D9.

## State / Lifecycle

Phase machine itself does NOT change; the existing `workflow-run-state` transitions stay intact. What changes is per-run *adapter state*:

| Field | Phase introduced | Mutated by | Lifetime |
|---|---|---|---|
| `worktree_path` | start (`prepare-change`) | start; never mutated thereafter | until run-state file is deleted |
| `branch_name` | start | start | until terminal cleanup |
| `base_commit` | start | start | until terminal cleanup |
| `base_branch` | start | start | until terminal cleanup |
| `cleanup_pending` | terminal phases (approve/archive/reject) | terminal phase deferral path; cleared on successful retry that completes cleanup | persists across CLI invocations |

Worktree lifecycle (separate from run state):
1. **Created** at first `prepare-change` for a change.
2. **Active** through draft → review → ready → terminal entry.
3. **Removed** on terminal entry IFF clean+complete; else **persisted** with `cleanup_pending = true`.
4. **Re-removed** on a subsequent terminal-phase invocation that observes clean+complete.

Persistence-sensitive state: `base_commit`/`base_branch` MUST be set atomically with worktree creation; otherwise a crash leaves the run-state inconsistent with the worktree (e.g., wrong base for PR). Implementation: write run-state AFTER `git worktree add` succeeds; if `git worktree add` fails, no run-state is written.

## Contracts / Interfaces

### `WorkspaceContext` extension (existing interface, `src/lib/workspace-context.ts:14-23`)
The interface adds two read-only accessors on the local-fs concrete implementation (NOT on the interface in core, to keep core agnostic):
- `baseCommit(): string` — reads from run-state via the wiring-layer construction site.
- `baseBranch(): string | null` — same.

The interface itself is untouched. Wiring code that needs base info reads it directly from `RunState` (which already flows through the wiring layer); the accessors are only exposed where the local-fs context is materialized.

**Repo-root vs worktree-root accessor split**: When a `WorkspaceContext` is constructed for a worktree-mode run, `repo_path` and `worktree_path` diverge. The following contract governs which path each accessor resolves against:
- `projectRoot()` → `repo_path` (the user's repository root). Used for `.specflow/` administrative paths, git worktree registry operations, and any read that must see the original repo.
- `worktreePath()` → `worktree_path` (`.specflow/worktrees/<CHANGE_ID>/main/`). Used as `cwd` for all phase commands, `openspec` invocations, artifact reads/writes, and subagent dispatch.
- `baseCommit()` → reads `base_commit` from the persisted `RunState`.
- `baseBranch()` → reads `base_branch` from the persisted `RunState`.

The local-fs concrete implementation MUST accept both `repo_path` and `worktree_path` at construction time (via the wiring layer) and MUST NOT assume they are equal. Persisted `run.json` MUST contain distinct `repo_path` and `worktree_path` values for worktree-mode runs.

### `LocalRunState` (in `src/types/contracts.ts`)
```ts
export interface LocalRunState {
  readonly project_id: string;
  readonly repo_name: string;
  readonly repo_path: string;
  readonly branch_name: string;
  readonly worktree_path: string;
  readonly base_commit: string;        // NEW
  readonly base_branch: string | null; // NEW
  readonly cleanup_pending: boolean;   // NEW
  readonly last_summary_path: string | null;
}
```
Drift-guard test: extend the disjoint/exhaustive assertion in `src/tests/run-state-partition.test.ts` to include the three new keys.

### `specflow-prepare-change` CLI (wiring layer)
Replace `ensureBranch(root, changeId)` with `ensureMainSessionWorktree(root, changeId, source) → { worktreePath, baseCommit, baseBranch }`. The function:
1. Checks `git worktree list --porcelain` for an existing entry tied to `<CHANGE_ID>`.
2. On match at the conventional path → reuse.
3. On match at a non-conventional path or branch existing without matching worktree → fail-fast.
4. Otherwise: `git -C <user-repo> rev-parse HEAD` → `git -C <user-repo> branch --show-current` → `git worktree add -b <CHANGE_ID> .specflow/worktrees/<CHANGE_ID>/main/ <HEAD>` → return.

The downstream call to `ensureProposalDraft`, `ensureRunStarted`, etc., now flows with `cwd = worktreePath`, NOT `cwd = root`. `openspec new change`, `openspec instructions`, `specflow-run start` all run inside the worktree.

### Terminal-phase contract (approve/archive/reject)
```
gateInputs: { run-state, list of worktree paths }
gateOutputs: { decision: "remove" | "defer", reasons: string[] }
sideEffects: git worktree remove × N → rm -rf parent (decision=remove)
            | run-state.cleanup_pending = true (decision=defer)
```

### Subagent dispatch contract (delta in `apply-worktree-integration`)
- Input: `mainSessionWorktreePath = state.worktree_path`.
- **Per-bundle base commit**: At subagent worktree creation time, the main-session worktree HEAD is captured as the bundle's `base_commit_sha`. This SHA is persisted in the bundle's metadata (e.g., `bundle.json` or equivalent artifact written by the apply pipeline). Each bundle records its own base independently; there is no shared apply-run base snapshot. Later bundles inherit the integrated state of earlier bundles because their base is captured after prior patches have landed.
- Subagent worktree creation: `git -C <user-repo> worktree add <absolute-path-to-.specflow/worktrees/CHANGE_ID/RUN_ID/BUNDLE_ID/> <main-session-HEAD>`. The `<main-session-HEAD>` is the SHA captured above. To avoid a nested-`.specflow` artifact, subagent worktrees are created via `git -C <user-repo>` with the explicit absolute path under the user repo's `.specflow/`. The user repo's `.git` is the worktree registry; both main-session and subagent worktrees share that registry.
- Patch import: `git -C <subagentWorktree> diff --binary <bundle_base_commit_sha>..HEAD | git -C <mainSessionWorktreePath> apply --binary`. The diff base is the bundle's recorded `base_commit_sha`, not a shared run-level snapshot.

## Persistence / Ownership

| Path | Owner | Lifetime | Notes |
|---|---|---|---|
| `<userRepo>/.specflow/worktrees/<CHANGE_ID>/main/` | main agent | start → terminal cleanup | Holds the change branch and all artifacts under `openspec/changes/<CHANGE_ID>/` |
| `<userRepo>/.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/` | apply pipeline | bundle dispatch → bundle done/retain | Existing subagent worktree, re-parented under change |
| `<userRepo>/.specflow/runs/<RUN_ID>/run.json` | wiring layer (run-store) | start → cleanup complete | Records `worktree_path`, `base_commit`, `base_branch`, `cleanup_pending`. When a terminal phase defers cleanup (`cleanup_pending = true`), the run-state file MUST be retained past the terminal transition — it is NOT deleted at archive/approve/reject time. The file is only deleted (or may be deleted) after a subsequent invocation completes cleanup and clears `cleanup_pending`. This ensures the retry path can still resolve `worktree_path`, enumerate worktrees for the gate check, and read `cleanup_pending` itself. |
| `<userRepo>/openspec/changes/<CHANGE_ID>/...` | OpenSpec | start → archive | The canonical artifact directory is created and maintained INSIDE the worktree. Archive reads artifacts from the worktree via `worktree_path`; it does NOT propagate or copy them back to the user repo's working tree. The user repo remains read-only throughout the change lifecycle. |

The user repo's working tree is read-only with respect to specflow during a change's lifecycle (apart from the `.specflow/worktrees/` and `.specflow/runs/` administrative directories, which it owns).

## Integration Points

- **`openspec` CLI**: invoked with `cwd = worktree path` for `new change`, `validate`, `instructions`. No protocol change.
- **`gh` CLI**: invoked with `cwd = worktree path` for `pr create`. Inherits the user repo's remote because `git worktree add` shares `.git/`.
- **`git`**: `worktree add`, `worktree list --porcelain`, `worktree remove`, `branch --show-current`, `rev-parse HEAD` are all called with explicit `cwd`.
- **External watch / dashboard / chief-of-staff hooks**: receive `<RUN_ID>` as input; resolve `worktree_path` via run-state; read artifacts from there. No direct cwd assumption.
- **CI**: pipelines that rely on the user repo's branch ref reaching a state matching `<CHANGE_ID>` no longer see that ref in the user-repo `.git` until the worktree's branch is pushed. Push happens at `/specflow.approve`. Pre-approve CI can be run by the user manually inside the worktree (`cd .specflow/worktrees/<change>/main && pnpm test`); a future enhancement may automate this.

## Ordering / Dependency Notes

Implementation order (foundational → derived):
1. **Run-state schema + drift guard + `WorkspaceContext` factory + `specflow-prepare-change` rewrite** (`LocalRunState` extension, `ensureMainSessionWorktree`, conflict fail-fast with no auto-prune, base_commit/base_branch capture, cwd indirection). These share the run-state contract and must land together.
2. **Apply pipeline retargeting** (`apply-worktree-integration` + `bundle-subagent-execution` deltas): subagent worktree path layout, base HEAD source, patch-apply target.
3. **Phase command cwd resolution** (every `/specflow.*` skill that today assumes user-repo cwd reads `worktree_path` from run-state).
4. **Approve push + PR base resolution** (`base_branch` lookup → `gh pr create --base`).
5. **Terminal cleanup** (approve/archive/reject gate evaluation, `cleanup_pending` deferral).
6. **Legacy guard** in `prepare-change` (with synthetic-run exemption per D9).
7. **Watcher + dashboard cwd updates** (archive reads from worktree, no propagation to user repo).
8. **End-to-end smoke test**.

Items in step 1 must land in one bundle. 2 and 3 can run in parallel after 1. 4–5 follow 3. 6 is independent of 2–5 but depends on 1. 7 follows 3. 8 is the final verification.

## Completion Conditions

- **C-1 done** when `specflow-prepare-change` running on a fresh repo never invokes `git checkout` against the user repo, leaves the user-repo HEAD/branch/dirty state unchanged, and creates `.specflow/worktrees/<CHANGE_ID>/main/` with branch `<CHANGE_ID>`.
- **C-2 done** when `RunState`/`LocalRunState` carry `base_commit`, `base_branch`, `cleanup_pending`, persisted run.json contains all three, and the drift-guard test enforces them.
- **C-3 done** when every `/specflow.*` command, the watcher, and the dashboard, executed against an active run, operate inside the worktree (verified by an integration test that asserts no writes to the user repo's working tree).
- **C-4 done** when `git apply --binary` of a successful subagent's diff lands in `.specflow/worktrees/<CHANGE_ID>/main/`, NOT in the user repo, and the subagent worktree path is `.specflow/worktrees/<CHANGE_ID>/<RUN_ID>/<BUNDLE_ID>/`.
- **C-5 done** when `/specflow.approve` pushes from inside the worktree and creates a PR whose base equals the recorded `base_branch` (or default branch as fallback).
- **C-6 done** when a clean-and-complete terminal phase deletes `.specflow/worktrees/<CHANGE_ID>/`; a dirty-or-partial terminal phase writes `cleanup_pending = true` and leaves the worktree on disk.
- **C-7 done** when `specflow-prepare-change` resuming a run with `worktree_path == repo_path` AND `run_kind != "synthetic"` exits non-zero with a clear message and modifies nothing; AND when a synthetic run with `worktree_path == repo_path` is NOT rejected by the guard.

Each concern has at least one integration test that exercises the user-repo invariants (HEAD unchanged, no rogue commits) using a temp git repo fixture.
