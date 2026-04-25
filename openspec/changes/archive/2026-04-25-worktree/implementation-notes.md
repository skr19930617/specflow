# Implementation Notes: Worktree Mode (Bundle 1 output)

This document captures the **single, locked-down behavioral contract** for the worktree-mode change. Downstream bundles SHALL implement these policies as-is — there is no `legacy_mode` flag, no auto-recovery branch, and no per-environment override.

## 1. Cleanup retry policy (D8 follow-on)

Behavior:
- Every invocation of a terminal-phase CLI (`/specflow.approve`, `/specflow.archive`, `/specflow.reject`) re-evaluates the cleanup gate (`success_full ∧ tree_clean`) against the current run-state and worktree contents.
- If the gate evaluates `true`, cleanup runs and `cleanup_pending` is cleared (set to `false` if it was `true` from a prior deferral).
- If the gate evaluates `false`, `cleanup_pending` is set to `true` (or left `true`), the run remains in its terminal phase, and offending paths / partial-failure cause are surfaced on stderr.
- The CLI exits 0 in BOTH outcomes — terminal-phase entry is not blocked by deferred cleanup. The user can re-invoke the terminal CLI later to retry cleanup once the failure root cause is resolved.

What is NOT permitted:
- Force-removal (`git worktree remove --force`). The non-force variant is the only allowed call; if it fails (typically because the worktree is dirty), the gate has already deferred and we never reach the remove step anyway.
- Auto-stash / auto-commit of dirty worktree state to "make it clean enough" for cleanup.
- Re-evaluating only on a separate `specflow-cleanup-worktree` helper. (None such helper ships in this change; users re-invoke the terminal CLI.)

Acceptance condition for a downstream bundle: the implementation re-evaluates the cleanup gate on every terminal-phase invocation, including subsequent re-entries while `cleanup_pending = true`.

## 2. `git worktree prune` policy (D5 follow-on, also touches the design's Open Questions section)

**No automatic `git worktree prune` SHALL be invoked by any specflow CLI** (including `prepare-change`, the apply pipeline, and the terminal cleanup gate). This applies even to the "safety-only" variant the design originally entertained.

Rationale:
- Pruning the registry can mask real conflict states the user must resolve (e.g., a manually-deleted directory whose `.git/worktrees/` entry is the only signal that something went wrong).
- D5's fail-fast policy says specflow "detects and reports, never silently mutates git worktree registry state". An automatic prune is exactly that mutation.
- The earlier draft of the design listed "safety-only auto-prune" as an Open Question with a working assumption of "yes". The locked policy reverses that working assumption to "no", aligning the design narrative with the spec deltas.

User-facing path: when `git worktree list` shows a stale entry the user wants to clean, the user runs `git worktree prune` themselves. This is documented in CLI error messages (e.g., the conflict fail-fast in `prepare-change`).

Acceptance condition for a downstream bundle: no specflow code path calls `git worktree prune`. A grep guard test (covered by bundle 9 / task 8.4) enforces this.

## 3. Legacy read-only inspection semantics (D9 follow-on)

The legacy guard rejects only the **resume / mutating** path. Read-only inspection commands SHALL still load legacy run-state records.

Inclusive list (legacy guard fires HERE — refuse, surface remediation):
- `specflow-prepare-change` (when resuming an existing change whose run-state has `worktree_path == repo_path` and `run_kind != "synthetic"`). This is the entry to all mutating phase work.

Exclusive list (legacy guard does NOT fire — record loads normally):
- `specflow-run get-field` / `specflow-run status` / `specflow-run list` — read-only inspection.
- `specflow-watch` — read-only stream.
- `specflow.dashboard` — read-only aggregator.
- Any other CLI whose surface is documented as read-only.

Synthetic-run exemption: any record with `run_kind == "synthetic"` SHALL bypass the legacy guard regardless of whether `worktree_path == repo_path`. Synthetic runs never adopt the worktree-mode path layout (they have no associated change directory), and the spec explicitly carves them out.

Acceptance condition for a downstream bundle: the guard predicate is `state.run_kind !== "synthetic" && state.worktree_path === state.repo_path`, scoped to `specflow-prepare-change`. Read paths construct run-state without invoking the guard. Both paths covered by tests in bundle 7 (legacy-runstate-guard) and re-asserted by bundle 9 (worktree-invariant-verification, task 8.4).

## 4. Rejected alternatives (locked)

Capturing the rejected alternatives here so downstream bundles do not re-litigate them.

| Concern | Rejected alternative | Reason |
|---|---|---|
| Worktree path layout | `.specflow/worktrees/main/<CHANGE_ID>/` (separate main parent) | Prevents single-`rm -rf` cleanup; adds path-resolution complexity. |
| Branch creation | Detached HEAD inside the worktree | Complicates push/PR semantics; loses the `change_name == branch_name` invariant. |
| Base commit source | Repo's default branch (`main`) HEAD | Feature-branch-rooted changes would produce huge cross-feature diffs. |
| Conflict policy | Auto-prune any conflicting worktree before recreating | Can erase uncommitted state. Fail-fast and let the user resolve. |
| Migration | `legacy_mode` flag on run-state | Doubles the maintenance surface; in-flight runs are drained pre-merge instead. |
| Cleanup | Always force-remove on terminal entry | Destroys in-progress recovery work. Gate on clean-and-complete; defer otherwise. |
| Worktree prune | "Safety-only" auto-prune in `prepare-change` | Hides real conflict states. User runs prune manually. |
| Read-only inspection | Apply legacy guard everywhere | Breaks `specflow-run get-field` / watcher / dashboard for legacy records. Guard only the mutating resume entry. |
| Push/PR | Cherry-pick worktree commits into the user repo before push | Re-introduces the user-repo contamination this change removes. |
| Run-state extension | Sidecar JSON for `base_commit`/`base_branch`/`cleanup_pending` | Fragments the source of truth. Extend `LocalRunState` and the drift guard. |

Each rejected alternative is referenced by ID in downstream bundle PR descriptions if it comes up during review.

## 5. Resolved Open Questions (Design ↔ Spec alignment)

The design's `Open Questions` section had three items. They are now LOCKED to:

1. **"Should `cleanup_pending = true` block subsequent retries?"** → No, retries are always allowed; the gate re-evaluates each invocation. (See §1.)
2. **"Should `git worktree prune` run automatically?"** → No, never. (See §2.)
3. **"What happens when a user inspects a legacy run via `specflow-run status`?"** → Read paths are unaffected; only `prepare-change` blocks. (See §3.)

These resolutions bind every downstream bundle. If a future change reopens any of them, it must do so via a new proposal under `/specflow`, not by re-introducing fallback paths in this change's bundles.
