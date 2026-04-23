// apply-dispatcher types — closed, deterministic contracts for subagent
// context packaging, subagent results, and the window-level dispatch decision.

import type { Bundle } from "../task-planner/types.js";

export interface CapabilitySpecs {
	readonly capability: string;
	readonly baseline?: string;
	readonly delta?: string;
}

export interface BundleSlice {
	readonly bundle: Bundle;
	/**
	 * Outputs produced by bundles that this bundle directly depends on. Values
	 * are the artifact references as they appear in the dependency's `outputs`
	 * array. Ordering matches `bundle.depends_on`.
	 */
	readonly dependency_outputs: ReadonlyArray<{
		readonly bundleId: string;
		readonly outputs: readonly string[];
	}>;
}

export interface ContextPackageInput {
	readonly path: string;
	readonly content: string;
}

export interface ContextPackage {
	readonly bundleId: string;
	readonly proposal: string;
	readonly design: string;
	readonly specs: readonly CapabilitySpecs[];
	readonly bundleSlice: BundleSlice;
	readonly tasksSection: string;
	readonly inputs: readonly ContextPackageInput[];
}

export interface SubagentResult {
	readonly status: "success" | "failure";
	readonly produced_artifacts: readonly string[];
	readonly error?: {
		readonly message: string;
		readonly details?: unknown;
	};
}

/**
 * apply-worktree-isolation: when a bundle is dispatched in subagent-worktree
 * mode, the main agent passes the ephemeral worktree handle so the subagent
 * knows where to write its implementation. The handle is `undefined` for
 * test fixtures and for any non-worktree dispatch path (none supported in
 * production post-feature; `subagent-shared` is NOT a supported mode).
 */
export interface SubagentWorktreeHandle {
	readonly path: string;
	readonly baseSha: string;
	readonly runId: string;
	readonly bundleId: string;
}

export type SubagentInvoker = (
	pkg: ContextPackage,
	worktree?: SubagentWorktreeHandle,
) => Promise<SubagentResult>;

/**
 * Window-level dispatch decision. `subagent` mode is used when at least one
 * bundle in the window has `size_score > config.threshold`. Otherwise the
 * entire window runs inline on the main agent.
 */
export type DispatchMode = "inline" | "subagent";

export interface DispatchDecision {
	readonly mode: DispatchMode;
	/**
	 * For `subagent` mode, chunks of size ≤ `config.maxConcurrency` to dispatch
	 * in parallel; for `inline` mode, a single chunk containing every bundle in
	 * the window.
	 */
	readonly chunks: readonly (readonly Bundle[])[];
}
