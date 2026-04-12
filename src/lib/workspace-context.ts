// VCS-neutral workspace abstraction.
// Core modules depend on this interface, never on concrete implementations.

import type { DiffExcludedEntry, DiffSummary } from "../types/contracts.js";

export type { DiffExcludedEntry, DiffSummary };

export interface FilteredDiffResult {
	readonly diff: string;
	readonly summary: DiffSummary | "empty";
	readonly warnings: readonly string[];
}

export interface WorkspaceContext {
	readonly projectRoot: () => string;
	readonly branchName: () => string | null;
	readonly projectIdentity: () => string;
	readonly projectDisplayName: () => string;
	readonly worktreePath: () => string;
	readonly filteredDiff: (
		excludeGlobs: readonly string[],
	) => FilteredDiffResult;
}
