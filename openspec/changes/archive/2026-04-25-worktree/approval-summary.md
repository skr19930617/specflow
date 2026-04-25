# Approval Summary: worktree

**Generated**: 2026-04-25T22:26:43+09:00
**Branch**: worktree
**Status**: ⚠️ 4 unresolved high (accepted as risk — see Remaining Risks)

## What Changed

```
.gitignore                                         |   1 +
assets/commands/specflow.approve.md.tmpl           |  79 ++++++++++--
assets/commands/specflow.reject.md.tmpl            |  56 +++++++--
assets/template/.gitignore                         |   1 +
src/bin/specflow-challenge-proposal.ts             |   2 +-
src/bin/specflow-generate-task-graph.ts            |   2 +-
src/bin/specflow-prepare-change.ts                 | 173 ++++++++++++++++++++++++--
src/bin/specflow-review-apply.ts                   |   2 +-
src/bin/specflow-review-design.ts                  |   2 +-
src/bin/specflow-run.ts                            |  74 ++++++++++-
src/bin/specflow-watch.ts                          |  62 +++++++--
src/core/update-field.ts                           |   3 +
src/lib/apply-dispatcher/orchestrate.ts            |  29 +++++
src/lib/apply-worktree/worktree.ts                 |  48 +++++--
src/lib/local-workspace-context.ts                 |  12 +-
src/lib/run-store-ops.ts                           |  15 ++-
src/lib/schemas.ts                                 |   3 +
src/lib/terminal-worktree-cleanup.ts               | 178 ++++++++++++++++++++++++++
src/lib/worktree-resolver.ts                       |  56 +++++++++
src/tests/__snapshots__/specflow.approve.md.snap   |  79 ++++++++++--
src/tests/__snapshots__/specflow.reject.md.snap    |  56 +++++++--
... (additional test/fixture updates omitted)
43 files changed, 1421 insertions(+), 183 deletions(-)
```

## Files Touched

```
.gitignore
assets/commands/specflow.approve.md.tmpl
assets/commands/specflow.reject.md.tmpl
assets/template/.gitignore
src/bin/specflow-challenge-proposal.ts
src/bin/specflow-generate-task-graph.ts
src/bin/specflow-prepare-change.ts
src/bin/specflow-review-apply.ts
src/bin/specflow-review-design.ts
src/bin/specflow-run.ts
src/bin/specflow-watch.ts
src/core/update-field.ts
src/lib/apply-dispatcher/orchestrate.ts
src/lib/apply-worktree/worktree.ts
src/lib/local-workspace-context.ts
src/lib/run-store-ops.ts
src/lib/schemas.ts
src/lib/terminal-worktree-cleanup.ts
src/lib/worktree-resolver.ts
src/tests/__snapshots__/specflow.approve.md.snap
src/tests/__snapshots__/specflow.reject.md.snap
src/tests/advance-records.test.ts
src/tests/apply-dispatcher-orchestrate.test.ts
src/tests/apply-worktree-helpers.test.ts
src/tests/apply-worktree-integrate.test.ts
src/tests/apply-worktree-realgit.test.ts
src/tests/core-advance.test.ts
src/tests/core-error-wording.test.ts
src/tests/core-start.test.ts
src/tests/core-status-fields.test.ts
src/tests/core-suspend-resume.test.ts
src/tests/fixtures/legacy-final/specflow-run/advance.json
src/tests/fixtures/legacy-final/specflow-run/start.json
src/tests/generation.test.ts
src/tests/legacy-runstate-guard.test.ts
src/tests/phase-router.test.ts
src/tests/prepare-change-raw-input.test.ts
src/tests/prepare-change-worktree-conflicts.test.ts
src/tests/run-state-partition.test.ts
src/tests/runstate-generic.test.ts
src/tests/spec-verify-integration.test.ts
src/tests/specflow-watch-integration.test.ts
src/tests/specflow-watch-readers.test.ts
src/tests/terminal-worktree-cleanup.test.ts
src/tests/utility-cli.test.ts
src/tests/worktree-invariant-verification.test.ts
src/tests/worktree-resolver.test.ts
src/types/contracts.ts
```

## Review Loop Summary

### Design Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 1     |
| Resolved high      | 1     |
| Unresolved high    | 0     |
| New high (later)   | 1     |
| Total rounds       | 2     |

### Impl Review
| Metric             | Count |
|--------------------|-------|
| Initial high       | 4     |
| Resolved high      | 3     |
| Unresolved high    | 4     |
| New high (later)   | 4     |
| Total rounds       | 3     |

## Proposal Coverage

Proposal covers worktree-mode for the main session. Coverage mapping:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | C-1 user repo HEAD/branch/dirty state untouched after prepare-change | Yes | src/bin/specflow-prepare-change.ts (ensureMainSessionWorktree), src/tests/worktree-invariant-verification.test.ts |
| 2 | C-2 LocalRunState carries base_commit/base_branch/cleanup_pending | Yes | src/types/contracts.ts, src/lib/schemas.ts, src/bin/specflow-run.ts, src/tests/run-state-partition.test.ts |
| 3 | C-3 phase-command cwd routing through worktree_path | Partial | src/lib/worktree-resolver.ts, src/bin/specflow-watch.ts (watcher only) |
| 4 | C-4 subagent patches land in main-session worktree | Yes | src/lib/apply-worktree/worktree.ts (mainWorkspacePath/changeId mandatory), src/lib/apply-dispatcher/orchestrate.ts |
| 5 | C-5 approve PR base resolution from base_commit/base_branch with default-branch fallback | Yes | assets/commands/specflow.approve.md.tmpl |
| 6 | C-6 terminal cleanup gate (clean+complete vs deferred) | Yes | src/lib/terminal-worktree-cleanup.ts, src/tests/terminal-worktree-cleanup.test.ts |
| 7 | C-7 legacy run-state guard with synthetic-run exemption | Yes | src/bin/specflow-prepare-change.ts (legacy guard), src/bin/specflow-watch.ts (watcher guard) |

**Coverage Rate**: 6.5/7 (93%) — C-3 partial because audit of every downstream phase CLI is scope-limited to follow-up.

## Remaining Risks

### Deterministic risks (from review-ledger)

- **R1-F04 (high)**: Legacy mode preservation — `readRunState` backfills missing `base_commit`/`base_branch`/`cleanup_pending` fields with defaults instead of fail-fast. **Accepted as risk.** Rationale: synthetic runs legitimately lack these fields; the backfill is forward-compat for record evolution. The mutating entry points (`prepare-change`) and the watcher both fail-fast on legacy `worktree_path == repo_path` non-synthetic records — that's the actual policy lever. The lenient read is read-only.
- **R2-F06 (high)**: Downstream phase CLIs (`specflow-review-apply`, `specflow-review-design`, `specflow-challenge-proposal`, `specflow-generate-task-graph`) still build their change stores from `projectRoot()`/`ensureGitRepo()` instead of resolving the run-id → worktree_path indirection. **Accepted as risk.** Rationale: the resolver (`src/lib/worktree-resolver.ts`) is foundation for that audit, but threading it through every CLI is a separate cross-cutting effort tracked as bundle-4 follow-up. For changes started after this lands, users can either (a) `cd .specflow/worktrees/<change>/main && /specflow.<phase>` (cwd-rooted resolution works correctly), or (b) wait for the follow-up audit change.
- **R3-F08 (high)**: Same scope as R2-F06. **Accepted as risk.**
- **R3-F09 (high)**: Slash-command templates (other than `specflow.approve` / `specflow.reject`) still instruct repo-root execution. **Accepted as risk.** Same scope as R2-F06.

### Untested new files
None — every new file (`worktree-resolver.ts`, `terminal-worktree-cleanup.ts`) has corresponding test files.

### Uncovered criteria
None.

## Human Checkpoints

- [ ] Drain any in-flight legacy `/specflow` runs (`worktree_path == repo_path` for non-synthetic) before merging this PR. The `prepare-change` legacy guard will refuse to resume them after merge.
- [ ] After merge, file a follow-up issue for the C-3 downstream-CLI audit (R1-F04 / R2-F06 / R3-F08 / R3-F09): thread `worktree-resolver` through `specflow-review-apply`, `specflow-review-design`, `specflow-challenge-proposal`, `specflow-generate-task-graph`, and update slash-command templates other than approve/reject.
- [ ] Smoke-test the new behavior on a fresh repo: invoke `/specflow` from a feature branch and confirm (a) the user's branch is unchanged, (b) `.specflow/worktrees/<change>/main/` is created, (c) the PR base resolves to the feature branch (not `main`).
- [ ] Verify that `git worktree list` does NOT show stale entries after `/specflow.approve` succeeds end-to-end.
- [ ] Confirm the `.specflow/worktrees/` entry is in user repos' `.gitignore` after this change ships (the template adds it automatically; existing repos may need a one-time merge).
