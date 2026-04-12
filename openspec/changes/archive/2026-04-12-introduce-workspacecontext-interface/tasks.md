## 1. Interface Definition

- [x] 1.1 Create `src/lib/workspace-context.ts` with `WorkspaceContext` interface, `FilteredDiffResult` type, and `DiffSummary` type (moved from specflow-filter-diff)
- [x] 1.2 Export `WorkspaceContext`, `FilteredDiffResult`, and `DiffSummary` from `src/lib/workspace-context.ts`
- [x] 1.3 Update `specflow-filter-diff.ts` to re-export `DiffSummary` from `src/lib/workspace-context.ts` (remove local definition)

## 2. Local Git Implementation

- [x] 2.1 Create `src/lib/local-workspace-context.ts` with `LocalWorkspaceContext` and a thin `createLocalWorkspaceContext(workspacePath?: string)` factory that accepts a starting path/cwd, not a pre-resolved git root
- [x] 2.2 Resolve and validate the git workspace root inside `LocalWorkspaceContext` construction from the provided starting `workspacePath`/cwd, and throw on non-git directories
- [x] 2.3 Implement `projectRoot()` using the resolved root from construction
- [x] 2.4 Implement `branchName()` using `git rev-parse --abbrev-ref HEAD` (returns `"HEAD"` on detached HEAD for parity with existing behavior)
- [x] 2.5 Implement `projectIdentity()` from remote origin URL with the exact `local/<directory-name>` fallback from the proposal (no hash or entropy suffix)
- [x] 2.6 Implement `projectDisplayName()` returning `owner/repo` format or the same exact `local/<directory-name>` fallback as `projectIdentity()`
- [x] 2.7 Implement `worktreePath()` using `git rev-parse --show-toplevel`
- [x] 2.8 Move filtered diff logic from `specflow-filter-diff.ts` into `filteredDiff()` method
- [x] 2.9 Implement glob-to-pathspec conversion for `excludeGlobs` parameter
- [x] 2.10 Preserve deleted-file exclusion semantics in `filteredDiff()`: omit deleted files from the patch body while recording them in `summary.excluded` with the current serialized entry format, `excluded_count`, and warning behavior
- [x] 2.11 Preserve pure-rename exclusion semantics in `filteredDiff()`: omit `R100` entries from the patch body while recording matching excluded metadata, counts, and warnings
- [x] 2.12 Preserve untracked-file omission semantics in `filteredDiff()`: untracked files stay completely out of scope and do not affect the patch body, `summary.excluded`, counts, or warnings
- [x] 2.13 Preserve the existing `DiffSummary` output contract and count/warning behavior (`excluded`, `warnings`, `included_count`, `excluded_count`, `total_lines`), including serialized excluded entries and warning text/order

## 3. Migrate specflow-run start

- [x] 3.1 Add `WorkspaceContext` parameter to run start handler function
- [x] 3.2 Replace direct git calls with `ctx.projectRoot()`, `ctx.branchName()`, `ctx.projectIdentity()`, `ctx.projectDisplayName()`, `ctx.worktreePath()`
- [x] 3.3 Update `specflow-run.ts` CLI entry point to construct `LocalWorkspaceContext` from the current workspace path and pass it to the handler
- [x] 3.4 Add try-catch around `createLocalWorkspaceContext()` in CLI entry point: on failure, call `notInGitRepo()` to write `{"status":"error","error":"not_in_git_repo"}` to stdout and exit 1

## 4. Migrate specflow-review-apply

- [x] 4.1 Add `WorkspaceContext` parameter to the review handler function
- [x] 4.2 Replace `diffFilter()` function with `ctx.filteredDiff(excludeGlobs)` call
- [x] 4.3 Preserve empty-diff skip behavior: when `filteredDiff()` returns `summary: "empty"`, skip review and report no reviewable changes
- [x] 4.4 Preserve large-diff warning flow: when `summary.total_lines` exceeds threshold, set `diff_warning` flag and follow existing warning path
- [x] 4.5 Update `specflow-review-apply.ts` CLI entry point to construct `LocalWorkspaceContext` from the current workspace path and pass it to the handler
- [x] 4.6 Add try-catch around `createLocalWorkspaceContext()` in CLI entry point: on failure, write `{"status":"error","error":"not_in_git_repo"}` to stdout and exit 1

## 5. Migrate specflow-filter-diff

- [x] 5.1 Refactor `specflow-filter-diff.ts` to construct `LocalWorkspaceContext` from the current workspace path and delegate to `filteredDiff()`
- [x] 5.2 Preserve existing CLI interface (args, stdout/stderr output format) and summary serialization
- [x] 5.3 Add try-catch around `createLocalWorkspaceContext()`: on failure, write `Error: not a git repository: <path>` to stderr and exit 1

## 6. Core Isolation Verification

- [x] 6.1 Verify `src/lib/` modules import only `WorkspaceContext` interface, not `LocalWorkspaceContext`
- [x] 6.2 Verify `src/lib/git.ts` is not imported by core modules that now use `WorkspaceContext`

## 7. Tests

- [x] 7.1 Unit tests for `LocalWorkspaceContext` metadata methods (projectRoot, branchName, projectIdentity, projectDisplayName, worktreePath), including originless `local/<directory-name>` fallback parity between identity and display name
- [x] 7.1a Unit test for detached-HEAD parity: `branchName()` returns `"HEAD"` (not `null`) matching existing `git rev-parse --abbrev-ref HEAD` behavior
- [x] 7.2 Unit tests for `LocalWorkspaceContext.filteredDiff()` happy-path parity (changed files, empty diff, excludeGlobs)
- [x] 7.3 Unit tests for `LocalWorkspaceContext.filteredDiff()` deleted-file parity: deleted files are omitted from the patch but recorded in `summary.excluded` with matching counts and warnings
- [x] 7.4 Unit tests for `LocalWorkspaceContext.filteredDiff()` pure-rename parity: `R100` entries are omitted from the patch but recorded with the expected excluded metadata, counts, and warnings
- [x] 7.5 Unit tests for `LocalWorkspaceContext.filteredDiff()` untracked-file omission parity: untracked files do not affect diff text, excluded metadata, counts, or warnings
- [x] 7.6 Unit tests for the exact `DiffSummary` output contract (field shape, serialized excluded entries, excluded counts, warning text/order, total lines) used by `specflow-filter-diff`
- [x] 7.7 Unit tests for glob-to-pathspec conversion edge cases
- [x] 7.8 Unit test for constructor validation (non-git directory)
- [x] 7.9 Integration test: `specflow-run start` produces identical RunState metadata as before, including originless fallback behavior
- [x] 7.10 Integration test: `specflow-review-apply` produces identical diff output and summary as before for deleted-file exclusions, pure-rename exclusions, untracked-file omission, and excluded count/warning parity
- [x] 7.11 Integration test: `specflow-filter-diff` CLI backward compatibility
- [x] 7.12 Integration test: `specflow-review-apply` skips review when `filteredDiff()` returns empty
- [x] 7.13 Integration test: `specflow-review-apply` triggers large-diff warning when `total_lines` exceeds threshold
- [x] 7.14 Integration test: `specflow-run` and `specflow-review-apply` write `{"status":"error","error":"not_in_git_repo"}` to stdout and exit 1 on non-git workspace
- [x] 7.14a Integration test: `specflow-filter-diff` writes error to stderr and exits 1 on non-git workspace
- [x] 7.15 Verify test coverage >= 80% for new code
