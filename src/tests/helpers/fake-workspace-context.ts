// Fake WorkspaceContext for core-runtime tests.
// Returns canned values; filteredDiff throws because core never uses it.

import type {
	FilteredDiffResult,
	WorkspaceContext,
} from "../../lib/workspace-context.js";

export interface FakeWorkspaceContextOptions {
	readonly projectRoot?: string;
	readonly projectIdentity?: string;
	readonly projectDisplayName?: string;
	readonly branchName?: string | null;
	readonly worktreePath?: string;
}

export function createFakeWorkspaceContext(
	options: FakeWorkspaceContextOptions = {},
): WorkspaceContext {
	const {
		projectRoot = "/fake/project",
		projectIdentity = "owner/repo",
		projectDisplayName = "owner/repo",
		branchName = "test-branch",
		worktreePath = projectRoot,
	} = options;

	return {
		projectRoot: () => projectRoot,
		projectIdentity: () => projectIdentity,
		projectDisplayName: () => projectDisplayName,
		branchName: () => branchName,
		worktreePath: () => worktreePath,
		filteredDiff: (_excludeGlobs: readonly string[]): FilteredDiffResult => {
			throw new Error(
				"filteredDiff should not be called from the core runtime",
			);
		},
	};
}
