// task-planner enrichment helpers — deterministic post-processing applied to
// every newly generated TaskGraph regardless of which code path produced it.
//
// Keeping this in a separate module lets both the library helper
// (`generateTaskGraph`) and the production CLI (`specflow-generate-task-graph`)
// apply the same invariant: every bundle in a newly persisted graph SHALL
// carry `size_score = bundle.tasks.length`. The dispatcher relies on this
// signal (see `bundle-subagent-execution` spec) to classify bundles.

import type { TaskGraph } from "./types.js";

/**
 * Attach `size_score = tasks.length` to every bundle on a newly generated
 * TaskGraph. The field is optional in the schema (pre-feature graphs remain
 * valid without it), but every graph produced by the specflow generation
 * paths SHALL carry it.
 *
 * Pure: returns a new TaskGraph; the input is not mutated.
 */
export function withSizeScore(graph: TaskGraph): TaskGraph {
	return {
		...graph,
		bundles: graph.bundles.map((b) => ({
			...b,
			size_score: b.tasks.length,
		})),
	};
}
