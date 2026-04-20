// Window classification + deterministic chunking.
//
// `classifyWindow` implements D2 (window-level uniform dispatch): if any bundle
// in the window has `size_score > threshold`, the entire window is dispatched
// as subagents; otherwise it runs inline on the main agent.
//
// Chunking (D3) splits a subagent-dispatched window into chunks of size
// ≤ `maxConcurrency`, preserving bundle order as returned by `selectNextWindow`.
// Chunk boundaries are a pure function of `(window, maxConcurrency)` so two
// invocations over the same inputs always produce identical chunks.

import type { Bundle } from "../task-planner/types.js";
import type { DispatchConfig } from "./config.js";
import type { DispatchDecision, DispatchMode } from "./types.js";

function isEligible(bundle: Bundle, threshold: number): boolean {
	// Missing `size_score` SHALL be treated as inline-only regardless of
	// threshold — this is the backward-compatibility rule for pre-feature
	// task-graph.json files (see `task-planner` spec).
	if (bundle.size_score === undefined) return false;
	return bundle.size_score > threshold;
}

function chunk<T>(
	items: readonly T[],
	size: number,
): readonly (readonly T[])[] {
	if (size < 1) {
		throw new Error(`chunk: size must be >= 1 (got ${size})`);
	}
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/**
 * Decide how to execute a single window returned by `selectNextWindow`.
 *
 * Uniform-dispatch rule (D2): any eligible bundle in the window promotes the
 * entire window to `subagent` mode — mixed windows are NOT supported.
 */
export function classifyWindow(
	window: readonly Bundle[],
	config: DispatchConfig,
): DispatchDecision {
	const anyEligible =
		config.enabled && window.some((b) => isEligible(b, config.threshold));
	const mode: DispatchMode = anyEligible ? "subagent" : "inline";
	const chunks =
		mode === "subagent"
			? chunk(window, Math.max(1, config.maxConcurrency))
			: // For inline mode we keep a single chunk containing the whole window so
				// callers have a uniform iteration shape.
				[window];
	return { mode, chunks };
}
