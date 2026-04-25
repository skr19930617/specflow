// Terminal-phase cleanup gate for the main-session-worktree subtree.
//
// Approve / archive / reject all funnel through `evaluateCleanup` to decide
// whether to remove `.specflow/worktrees/<CHANGE_ID>/` or to defer cleanup
// (recording `cleanup_pending = true` in run-state). The gate is the AND of
// two predicates:
//
//   1. success_full — the terminal action itself succeeded fully.
//   2. tree_clean   — every registered worktree under the per-change parent
//                     reports an empty `git status --porcelain`.
//
// Cleanup itself only ever invokes `git worktree remove` (without --force)
// followed by `rm -rf` of the parent. If `git worktree remove` fails, the
// cleanup is reported as deferred — never silently force-removed (per D5/D8).

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tryExec } from "./process.js";

export interface CleanupReason {
	readonly kind: "dirty_worktree" | "partial_failure" | "unknown_path";
	readonly worktreePath?: string;
	readonly detail: string;
}

export type CleanupDecision =
	| {
			readonly action: "remove";
			readonly removed: readonly string[];
	  }
	| {
			readonly action: "defer";
			readonly reasons: readonly CleanupReason[];
	  };

export interface CleanupInputs {
	readonly repoPath: string;
	readonly changeId: string;
	readonly successFull: boolean;
	readonly partialFailureCause?: string | null;
}

function perChangeWorktreesDir(repoPath: string, changeId: string): string {
	return resolve(repoPath, ".specflow/worktrees", changeId);
}

interface WorktreeEntry {
	readonly path: string;
	readonly registered: boolean;
}

function listWorktreesUnder(parent: string): readonly WorktreeEntry[] {
	if (!existsSync(parent)) return [];
	const entries: WorktreeEntry[] = [];
	const visit = (p: string) => {
		// A worktree is identified by the presence of a `.git` file (not a
		// directory) — git worktree add creates a gitfile that points back to
		// the main `.git/worktrees/<name>/` registry entry.
		const gitPath = join(p, ".git");
		if (existsSync(gitPath)) {
			entries.push({ path: p, registered: statSync(gitPath).isFile() });
			return; // do not descend further
		}
		// Otherwise, descend into subdirectories looking for nested worktrees.
		try {
			for (const child of readdirSync(p)) {
				const full = join(p, child);
				if (statSync(full).isDirectory()) {
					visit(full);
				}
			}
		} catch {
			// Best-effort; ignore unreadable subtrees.
		}
	};
	visit(parent);
	return entries;
}

function isCleanWorktree(path: string): {
	clean: boolean;
	porcelainOutput: string;
} {
	const result = tryExec("git", ["status", "--porcelain"], path);
	if (result.status !== 0) {
		return { clean: false, porcelainOutput: result.stderr || result.stdout };
	}
	return {
		clean: result.stdout.trim() === "",
		porcelainOutput: result.stdout,
	};
}

/**
 * Evaluate the cleanup gate and execute cleanup if it passes. Returns a
 * `CleanupDecision` describing the outcome. Does NOT mutate run-state — the
 * caller is expected to persist `cleanup_pending` based on the decision.
 */
export function evaluateAndCleanup(inputs: CleanupInputs): CleanupDecision {
	const parent = perChangeWorktreesDir(inputs.repoPath, inputs.changeId);
	const reasons: CleanupReason[] = [];

	if (!inputs.successFull) {
		reasons.push({
			kind: "partial_failure",
			detail:
				inputs.partialFailureCause ??
				"Terminal action did not complete fully; cleanup deferred until retry.",
		});
	}

	const worktrees = listWorktreesUnder(parent);

	for (const wt of worktrees) {
		const { clean, porcelainOutput } = isCleanWorktree(wt.path);
		if (!clean) {
			reasons.push({
				kind: "dirty_worktree",
				worktreePath: wt.path,
				detail: `Worktree has uncommitted changes:\n${porcelainOutput.trim()}`,
			});
		}
	}

	if (reasons.length > 0) {
		return { action: "defer", reasons };
	}

	if (worktrees.length === 0) {
		// Nothing to remove — parent absent or already cleaned.
		if (existsSync(parent)) {
			rmSync(parent, { recursive: true, force: true });
		}
		return { action: "remove", removed: [] };
	}

	const removed: string[] = [];
	for (const wt of worktrees) {
		// Use non-force; if it fails we treat it as a deferred cleanup signal.
		const result = tryExec(
			"git",
			["worktree", "remove", wt.path],
			inputs.repoPath,
		);
		if (result.status !== 0) {
			return {
				action: "defer",
				reasons: [
					{
						kind: "dirty_worktree",
						worktreePath: wt.path,
						detail: `git worktree remove failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`}`,
					},
				],
			};
		}
		removed.push(wt.path);
	}

	if (existsSync(parent)) {
		try {
			rmSync(parent, { recursive: true, force: true });
		} catch (err) {
			return {
				action: "defer",
				reasons: [
					{
						kind: "unknown_path",
						worktreePath: parent,
						detail: `Failed to remove parent directory: ${err instanceof Error ? err.message : String(err)}`,
					},
				],
			};
		}
	}

	return { action: "remove", removed };
}
