# Apply worktree recovery

Operator-facing guide for diagnosing and recovering from apply-time failures
introduced by the `apply-worktree-isolation` change. Use this alongside
`/specflow.fix_apply`.

## New terminal bundle statuses

When `apply.subagent_dispatch.enabled: true` (see `openspec/config.yaml`) and
a bundle is dispatched as a subagent in an isolated worktree, the dispatcher
can end that bundle in one of two new terminal-for-invocation statuses:

| Status | Meaning | Typical cause |
|---|---|---|
| `subagent_failed` | The subagent itself reported `status: failure` or the Agent tool rejected. | Subagent encountered an implementation error, hit a timeout, lost its worktree context, or raised an unhandled exception. |
| `integration_rejected` | Subagent returned `status: success`, but main-agent integration rejected the worktree diff. | `produced_artifacts` did not match the diff, the diff touched a protected path, the diff was empty, or `git apply --binary` could not apply it cleanly. |

Both statuses leave the **run in `apply_draft`**. The apply stops immediately
after the current chunk drains. Subsequent chunks and windows are NOT
dispatched.

These statuses are non-terminal for the run: they can be reset back to
`pending` and re-attempted. Transitions to `pending` from either status
REQUIRE `specflow-advance-bundle ... --allow-reset` — the apply-class
workflow SHALL NOT pass this flag, but `/specflow.fix_apply` and explicit
operator interventions MAY.

## Retained worktrees

On both failure modes, the subagent's ephemeral worktree is **retained** at

```
.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/
```

relative to the repository root. `git worktree list` will include this path
until cleanup. The worktree contains the exact state the subagent left when
it returned — inspect it to diagnose what went wrong.

On successful integration, the worktree is immediately removed with
`git worktree remove --force`; nothing is persisted for that bundle after
it reaches `done`.

## Diagnosing subagent_failed

1. Locate the retained worktree:
   ```bash
   git worktree list | grep "/<RUN_ID>/<BUNDLE_ID>"
   ```
2. Enter the worktree and review subagent output. If the subagent wrote a
   partial implementation before failing, those files are still there.
3. Check the main-agent CLI output for the `error` message the subagent
   returned — it is surfaced by the dispatcher at STOP time.
4. Common root causes:
   - Subagent crashed before writing files (diff is empty).
   - Subagent timed out (no failure payload; dispatcher records a generic
     throw).
   - Subagent lost context or tool access mid-run.

## Diagnosing integration_rejected

The failure payload in the dispatcher's STOP message includes a structured
`integrationCause` field with one of four kinds:

| `cause.kind` | Meaning | Fix |
|---|---|---|
| `undeclared_path` | The diff touches `<path>` but the subagent did not list it in `produced_artifacts`. | Add `<path>` to `produced_artifacts`, OR if the path should not have been touched, remove the edit from the worktree and re-run. |
| `protected_path` | The diff touches a main-agent-only path (`task-graph.json`, `tasks.md`, or anything under `.specflow/`). | Revert that change inside the retained worktree. These paths are the main agent's domain. |
| `empty_diff_on_success` | Subagent returned `success` but produced no changes. | Subagent contract violation. Investigate why the subagent claimed success with no work. |
| `patch_apply_failure` | `git apply --binary` refused the worktree's diff at the repo root. | The main workspace diverged from the worktree's base. Either reset the worktree onto the current main HEAD, or hand-merge the changes. Phase 1 does NOT attempt `--3way` fallback. |

## Recovery paths

### Option A — auto-fix loop

Re-run `/specflow.fix_apply`. The fix-loop orchestrator reads the retained
worktree and the failure payload, generates a targeted patch, and re-runs
integration. This is the recommended first step for any `integration_rejected`
bundle.

### Option B — manual intervention

If the auto-fix loop cannot resolve the issue, manually:

1. Enter the retained worktree and diagnose the issue.
2. Make the necessary corrections inside the retained worktree.
3. **Import your fixes into the main workspace.** Re-running `/specflow.apply`
   creates a **fresh** worktree from the main workspace's current HEAD —
   edits made only inside the retained worktree are discarded. You MUST
   apply your fixes back to the main workspace before resetting:
   ```bash
   # Import fixes from the retained worktree into the main workspace.
   # Stage first so new (untracked) files are included in the diff, then use
   # --binary on both sides so binary content round-trips correctly.
   git -C .specflow/worktrees/<RUN_ID>/<BUNDLE_ID> add -A
   git -C .specflow/worktrees/<RUN_ID>/<BUNDLE_ID> diff --binary --cached HEAD | git apply --binary --index
   ```
   Alternatively, skip the retained worktree and make fixes directly in the
   main workspace.
4. Reset the bundle back to pending:
   ```bash
   specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> pending --allow-reset
   ```
5. Re-run `/specflow.apply`. The dispatcher will create a fresh worktree
   from the main workspace's current HEAD (which now includes your imported
   fixes and any successful siblings' imports from the prior attempt) and
   re-dispatch the bundle.

The old worktree is implicitly superseded by the reset. You MAY remove it
manually:

```bash
git worktree remove --force .specflow/worktrees/<OLD_RUN_ID>/<BUNDLE_ID>
```

If the old run id is different from the current one, the next apply run
will create a worktree at a different path anyway, so cleanup is cosmetic.

### Option C — skip the bundle

If the bundle is no longer needed, operator-reset to `pending` then
advance it to `skipped`:

```bash
specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> pending --allow-reset
specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> skipped
```

Use this only for work that has become obsolete. Skipping a bundle that
other bundles depend on will cascade.

## Distinguishing subagent failure vs integration rejection at a glance

| Observation | Likely status |
|---|---|
| Subagent returned an `error` payload in STOP output | `subagent_failed` |
| Main-agent integration surfaced an `integrationCause` | `integration_rejected` |
| `task-graph.json` shows the bundle with `"status": "subagent_failed"` | `subagent_failed` |
| `task-graph.json` shows the bundle with `"status": "integration_rejected"` | `integration_rejected` |
| Retained worktree exists but is empty | likely `empty_diff_on_success` (a subtype of integration_rejected) |
| Retained worktree has changes but main is unchanged | `integration_rejected` or `subagent_failed`, check task-graph |
| No retained worktree | `inline-main` bundle or already-cleaned success |

## Invariants worth remembering

- Subagents SHALL NOT edit `task-graph.json`, `tasks.md`, or anything under
  `.specflow/`. If a diff touches any of those, integration rejects even if
  the subagent declared the path.
- Main agent is the sole caller of `specflow-advance-bundle`. Inside a
  retained worktree, do not invoke advance transitions — do that from the
  repo root.
- On `subagent_failed` / `integration_rejected`, the run remains in
  `apply_draft`. Do not transition the run phase manually while bundles are
  still in these statuses.
