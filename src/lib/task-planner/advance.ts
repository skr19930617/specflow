// advance.ts — apply-phase caller for bundle status transitions.
//
// Orchestrates the full "update + persist + render + log" sequence around the
// pure `updateBundleStatus` function so the apply-phase has a single entry
// point that guarantees task-graph.json and tasks.md stay in sync, and that
// every child-task coercion emits exactly one structured audit log line.

import { renderTasksMd } from "./render.js";
import {
	type StatusUpdateError,
	type TaskStatusCoercion,
	updateBundleStatus,
} from "./status.js";
import type { BundleStatus, TaskGraph } from "./types.js";

/**
 * Pluggable sink for the task-graph.json / tasks.md writes. Structured as
 * an interface so tests can inject an in-memory writer and the production
 * caller can pass a filesystem writer (atomic write-to-temp + rename).
 */
export interface AdvanceBundleWriter {
	writeTaskGraph(content: string): void;
	writeTasksMd(content: string): void;
}

/**
 * Pluggable sink for structured audit log lines. One call per child-task
 * coercion that actually changed status. No calls are made when the
 * `coercions` array is empty (non-terminal transition, empty-bundle terminal
 * transition, or every child already matched the target).
 */
export type AdvanceBundleLogger = (coercion: TaskStatusCoercion) => void;

export interface AdvanceBundleOptions {
	readonly taskGraph: TaskGraph;
	readonly bundleId: string;
	readonly newStatus: BundleStatus;
	readonly writer: AdvanceBundleWriter;
	readonly logger?: AdvanceBundleLogger;
	/**
	 * Permit reset transitions out of `subagent_failed` or `integration_rejected`
	 * back to `pending`. Only /specflow.fix_apply or an operator reset flow
	 * should set this. Apply-class workflows MUST NOT.
	 */
	readonly allowReset?: boolean;
}

export interface AdvanceBundleSuccess {
	readonly ok: true;
	readonly taskGraph: TaskGraph;
	readonly coercions: readonly TaskStatusCoercion[];
}

export type AdvanceBundleResult = AdvanceBundleSuccess | StatusUpdateError;

function serializeTaskGraph(taskGraph: TaskGraph): string {
	return `${JSON.stringify(taskGraph, null, 2)}\n`;
}

/**
 * Advance a bundle to a new status, persist the normalized task graph and
 * rendered tasks.md, and emit audit logs for every child-task coercion that
 * actually changed status. Persistence and logging are performed via the
 * injected `writer` and `logger` so the orchestration stays testable.
 *
 * The returned `taskGraph` is the normalized graph. Callers that need to
 * react to coercions after persistence can also read `result.coercions`.
 *
 * On invalid transitions or unknown bundles, no writes or logs are emitted
 * and the original error is returned unchanged.
 */
export function advanceBundleStatus(
	options: AdvanceBundleOptions,
): AdvanceBundleResult {
	const result = updateBundleStatus(
		options.taskGraph,
		options.bundleId,
		options.newStatus,
		{ allowReset: options.allowReset === true },
	);
	if (!result.ok) {
		return result;
	}

	// 1) Persist the normalized task graph. Writers are expected to use an
	//    atomic write pattern (write-to-temp + rename) so crash-mid-write
	//    leaves either the old or the fully-normalized state.
	options.writer.writeTaskGraph(serializeTaskGraph(result.taskGraph));

	// 2) Re-render tasks.md from the normalized graph (NOT an intermediate
	//    graph) and persist with the same atomic guarantee.
	options.writer.writeTasksMd(renderTasksMd(result.taskGraph));

	// 3) Emit one audit log per coercion that actually changed status.
	//    Empty `coercions` yields zero log calls (no-op silence).
	if (options.logger) {
		for (const coercion of result.coercions) {
			options.logger(coercion);
		}
	}

	return {
		ok: true,
		taskGraph: result.taskGraph,
		coercions: result.coercions,
	};
}
