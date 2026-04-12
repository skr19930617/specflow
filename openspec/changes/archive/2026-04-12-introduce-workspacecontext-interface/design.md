## Context

The specflow runtime resolves workspace metadata (repo root, branch, project identity, worktree path) and produces filtered diffs for code review. Currently these operations are scattered across CLI entry points (`specflow-run.ts`, `specflow-review-apply.ts`, `specflow-filter-diff.ts`) using direct git CLI calls via `src/lib/git.ts`. There is no abstraction boundary: core modules in `src/lib/` transitively depend on git-specific logic, and external runtimes cannot provide alternative implementations.

The project already follows a DI pattern for storage: `ChangeArtifactStore` and `RunArtifactStore` interfaces are defined in `src/lib/artifact-store.ts`, with concrete `createLocalFs*` factory functions instantiated at CLI entry points and passed to core via function arguments. WorkspaceContext will adopt the same pattern.

**Current metadata resolution** in `specflow-run start`:
- `project_id` / `repo_name`: parsed from `git remote get-url origin`
- `repo_path` / `worktree_path`: from `git rev-parse --show-toplevel`
- `branch_name`: from `git rev-parse --abbrev-ref HEAD`

**Current diff resolution** in `specflow-review-apply`:
- Calls `specflow-filter-diff` binary via `tryExec()`
- Two-stage: `git diff --name-status -M100` then `git diff -- [files]`
- Returns `{ diff: string, summary: DiffSummary | "empty" }`

## Goals / Non-Goals

**Goals:**
- Define a VCS-neutral `WorkspaceContext` interface in `src/lib/`
- Provide a git-backed `LocalWorkspaceContext` implementation
- Migrate all workspace metadata resolution and diff filtering through WorkspaceContext
- Follow the existing ArtifactStore DI pattern (factory functions, interface injection)
- Maintain full backward compatibility with existing CLI behavior

**Non-Goals:**
- Providing non-git WorkspaceContext implementations (deferred to future changes)
- Changing the existing RunState schema or stored field names
- Modifying the review-ledger or review-runtime beyond swapping the diff source
- Abstracting other git operations (commit, push, branch creation)

## Decisions

### D1: Interface location and naming

**Decision**: Define `WorkspaceContext` interface in a new file `src/lib/workspace-context.ts`. Place `LocalWorkspaceContext` in `src/lib/local-workspace-context.ts`.

**Rationale**: Follows the existing pattern where `artifact-store.ts` defines the interface and `local-fs-*.ts` files contain concrete implementations. Separating interface from implementation ensures core modules can import only the interface.

**Alternatives considered**:
- Single file for interface + implementation: rejected because it would force core modules to import git-specific code
- Placing in `src/types/`: rejected because interfaces with behavior belong in `src/lib/`, while `src/types/` holds pure data contracts

### D2: Construction pattern and root resolution ownership

**Decision**: Implement `LocalWorkspaceContext` as the concrete class in `src/lib/local-workspace-context.ts`, with a constructor that accepts an optional starting `workspacePath`/`cwd` (defaulting to `process.cwd()`) and resolves plus validates the git workspace root during construction. Export `createLocalWorkspaceContext(workspacePath?: string): WorkspaceContext` as a thin wrapper around `new LocalWorkspaceContext(workspacePath)`. CLI entry points pass only their current working directory (or omit the argument entirely); they never pre-resolve or validate the git root before construction.

**Rationale**: The concrete implementation, not the CLI caller, owns workspace validation and root resolution. Callers provide only a starting path for discovery; they do not pre-resolve or validate the git root themselves. This keeps the abstraction boundary aligned with the interface contract: `projectRoot()` is resolved by the context itself, and invalid workspaces fail immediately at construction time. The thin factory preserves the existing DI ergonomics used at CLI entry points without requiring callers to pre-resolve git state.

**Alternatives considered**:
- `createLocalWorkspaceContext(projectRoot: string)`: rejected because it requires the caller to supply the value the interface is responsible for resolving
- Exposing only `new LocalWorkspaceContext(workspacePath?)`: viable, but the wrapper keeps the composition pattern consistent with other local implementations
- Module-level singleton: rejected because it prevents testing with different workspace contexts

### D3: Method signatures

**Decision**:
```typescript
interface WorkspaceContext {
  readonly projectRoot: () => string;
  readonly branchName: () => string | null;
  readonly projectIdentity: () => string;
  readonly projectDisplayName: () => string;
  readonly worktreePath: () => string;
  readonly filteredDiff: (excludeGlobs: readonly string[]) => FilteredDiffResult;
}

type FilteredDiffResult = {
  readonly diff: string;
  readonly summary: DiffSummary | "empty";
};
```

**Rationale**: Methods are functions (not getters) because metadata resolution may involve I/O. `readonly` function properties enforce immutability. `FilteredDiffResult` uses the `DiffSummary` type, which will be co-located in `src/lib/workspace-context.ts` alongside the interface definition. The existing `DiffSummary` type in `specflow-filter-diff.ts` will be removed and replaced with a re-export from the shared location, preventing import cycles between `src/lib/` and `src/bin/`.

**Alternatives considered**:
- Async methods: rejected because all current git operations are synchronous (`spawnSync`) and the review pipeline is synchronous
- Separate MetadataContext and DiffContext interfaces: rejected because the proposal scopes them as a single cohesive interface

### D4: filteredDiff baseline and parity semantics

**Decision**: `LocalWorkspaceContext.filteredDiff()` uses working-tree-vs-index (`git diff`), matching the existing `specflow-filter-diff` behavior exactly. The `excludeGlobs` parameter accepts standard glob patterns; the implementation converts them to git pathspec `:(exclude)<pattern>` format internally. Parity includes both the patch text and the exact `DiffSummary` contract currently emitted by `specflow-filter-diff`, including serialized excluded-entry strings, warning text, output ordering, and the distinct handling of deleted files, pure renames, and untracked files.

The implementation preserves the current exclusion semantics:
- Candidate files are discovered with `git diff --name-status -M100` using the same exclude pathspec handling and excluded-entry serialization rules as the existing CLI
- Content-changing tracked files remain eligible for the unified diff unless excluded by glob
- Deleted files are omitted from the patch body but recorded in `summary.excluded` using the same serialized entry format the current tool emits, counted in `excluded_count`, and included in warning generation exactly as today
- Pure renames (`R100`) are omitted from the patch body and recorded in excluded metadata using the same serialized entry format, counts, and warning behavior the current tool emits
- Untracked files remain out of scope and do not affect `diff`, `summary.excluded`, counts, warnings, or excluded ordering
- If no included changes remain, the method returns `{ diff: "", summary: "empty" }`; otherwise it preserves the existing `DiffSummary` shape `{ excluded, warnings, included_count, excluded_count, total_lines }` plus the current excluded-entry ordering and warning semantics

**Rationale**: Acceptance Criterion 2 requires full compatibility with `specflow-filter-diff`, including exclusion accounting and serialized summary shape, not just similar diff content. Making deleted, untracked, and rename handling explicit prevents accidental behavior drift during the migration.

**Alternatives considered**:
- `git diff HEAD` (all uncommitted changes): would include staged changes not visible in the current flow, breaking parity
- Simplifying excluded-file accounting to patch-only parity: rejected because it would break the existing summary contract
- Parameterized baseline: deferred; the interface contract intentionally leaves baseline as implementation-defined

### D5: Migration of specflow-filter-diff

**Decision**: Move the diff logic from `src/bin/specflow-filter-diff.ts` into `LocalWorkspaceContext.filteredDiff()`. Keep `specflow-filter-diff` as a thin CLI wrapper that constructs a `LocalWorkspaceContext` and delegates to it. This preserves the standalone binary for backward compatibility.

**Rationale**: Avoids breaking external callers of `specflow-filter-diff` while centralizing diff logic in the WorkspaceContext implementation.

### D6: Integration with specflow-run start

**Decision**: Add `WorkspaceContext` as a parameter to the run start handler. Map workspace methods to RunState fields:
- `repo_name` ← `ctx.projectDisplayName()`
- `repo_path` ← `ctx.projectRoot()`
- `branch_name` ← `ctx.branchName()`
- `worktree_path` ← `ctx.worktreePath()`
- `project_id` ← `ctx.projectIdentity()`

**Rationale**: Direct mapping preserves all existing RunState fields. `projectDisplayName()` exists specifically to maintain backward compatibility with `repo_name`.

### D7: Integration with specflow-review-apply

**Decision**: Replace `diffFilter()` in `specflow-review-apply.ts` with a call to `ctx.filteredDiff(excludeGlobs)`. The CLI entry point constructs `LocalWorkspaceContext` and passes it to the review handler. Exclude patterns remain hardcoded in the caller (review-ledger, current-phase files).

**Rationale**: The exclude patterns are review-specific policy, not workspace-level configuration. Keeping them in the caller avoids polluting the WorkspaceContext interface.

### D8: Originless repository fallback

**Decision**: When `git remote get-url origin` fails, both `projectIdentity()` and `projectDisplayName()` return `local/<project-root-basename>`.

**Rationale**: This matches the approved contract and preserves backward compatibility for persisted metadata and the existing `repo_name` behavior. The fallback must remain identical across `projectIdentity()` and `projectDisplayName()` for originless repositories.

**Alternatives considered**:
- Path-hash fallback (`local/<basename>-<hash>`): rejected because it changes the specified behavior and persisted identifiers without a corresponding proposal change

### D9: Detached-HEAD branch name parity

**Decision**: `LocalWorkspaceContext.branchName()` uses `git rev-parse --abbrev-ref HEAD` (matching the current `specflow-run start` behavior), not `git branch --show-current`. On detached HEAD, this returns the string `"HEAD"`, preserving the existing `branch_name` value stored in RunState. The interface contract allows `null` for implementations that cannot determine a branch, but the local git implementation returns `"HEAD"` to maintain parity.

**Rationale**: The existing codebase uses `git rev-parse --abbrev-ref HEAD` which returns `"HEAD"` on detached HEAD. Switching to `git branch --show-current` (which returns empty string / `null`) would change persisted `branch_name` values, violating Acceptance Criterion 1. Parity takes precedence over the cleaner `null` semantics described in the interface contract.

### D10: CLI error-handling for invalid workspaces

**Decision**: Each CLI entry point wraps `createLocalWorkspaceContext()` in a try-catch and preserves the existing CLI error contract:

- **`specflow-run.ts`**: On construction failure, calls existing `notInGitRepo()` helper which writes `{"status":"error","error":"not_in_git_repo"}` to stdout and exits with code 1. This preserves the exact existing error contract.
- **`specflow-review-apply.ts`**: On construction failure, writes `{"status":"error","error":"not_in_git_repo"}` to stdout and exits with code 1. Matches the structured JSON error pattern already used by this CLI for other error conditions.
- **`specflow-filter-diff.ts`**: On construction failure, writes `Error: not a git repository: <path>` to stderr and exits with code 1. This is a new error path (the CLI previously relied on `git diff` failing directly), but the exit code and stderr-based error reporting match git CLI conventions.

**Rationale**: Satisfies Acceptance Criteria 5 (failure explicitness) and 6 (no CLI breaking change). Each CLI preserves its existing error format: `specflow-run` and `specflow-review-apply` use structured JSON on stdout; `specflow-filter-diff` uses stderr text. The construction exception is caught at the CLI boundary, not in core modules.

### D11: Review-apply empty-diff and large-diff handling

**Decision**: After replacing `diffFilter()` with `ctx.filteredDiff(excludeGlobs)` in `specflow-review-apply`, the handler preserves the existing control flow:
- When `filteredDiff()` returns `summary: "empty"`, the handler skips the review and reports no reviewable changes (existing early-return path)
- When `summary.total_lines` exceeds the configured `diff_warn_threshold`, the handler sets the `diff_warning` flag and follows the existing warning flow (re-invocation with `--skip-diff-check`)

**Rationale**: These behaviors are required by the review-orchestration spec. The migration changes only the diff source, not the downstream control flow.

## Risks / Trade-offs

**[Synchronous I/O]** All WorkspaceContext methods use synchronous git CLI calls. This is consistent with the existing codebase but could become a bottleneck if the interface is called frequently in a single run.
→ *Mitigation*: Current usage patterns call each method at most once per command invocation. If performance becomes an issue, add internal caching (memoize results on first call).

**[specflow-filter-diff dual maintenance]** Keeping `specflow-filter-diff` as a wrapper introduces two code paths for the same logic.
→ *Mitigation*: The wrapper is a thin passthrough (construct context, call `filteredDiff`, write to stdout/stderr). Logic lives solely in `LocalWorkspaceContext`.

**[Glob-to-pathspec conversion]** Converting generic glob patterns to git pathspec format may have edge cases (nested globs, special characters).
→ *Mitigation*: The current callers use simple patterns (`*/review-ledger.json`). Add explicit tests for the conversion logic. Document supported glob subset.

**[Breaking change if RunState fields renamed]** The proposal maps `projectDisplayName()` → `repo_name`. If the RunState field is later renamed, the mapping must change.
→ *Mitigation*: The design explicitly keeps existing field names unchanged. Future field renaming would be a separate change.
