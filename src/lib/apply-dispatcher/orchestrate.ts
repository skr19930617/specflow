// Chunked subagent orchestration — the "what the main agent does" half of
// the dispatcher.
//
// Contract (D2–D4, review P1):
//   1. Classify the window. If inline, return `{ outcome: "inline" }` without
//      touching any state; the caller falls back to the legacy main-agent path.
//   2. For subagent-dispatched windows: preflight the ENTIRE window. If any
//      bundle has an unresolvable `owner_capability`, throw
//      `MissingCapabilityError` before ANY `advance()` call. This is the
//      P1/review-fix invariant: no bundle is ever left in `in_progress` due to
//      a later bundle's missing capability.
//   3. For each chunk of size ≤ maxConcurrency (in bundle order):
//      a. Assemble per-bundle ContextPackages (pure read).
//      b. Advance every bundle in the chunk to `in_progress` via `advance()`.
//      c. Invoke subagents in parallel via `Promise.allSettled`.
//      d. On each success result, advance the corresponding bundle to `done`.
//      e. If ANY subagent returned failure OR threw, collect failures, STOP
//         after the chunk drains. Subsequent chunks are NOT dispatched. Failed
//         bundles remain in `in_progress`; successful siblings are `done`.

import type { Bundle, BundleStatus, TaskGraph } from "../task-planner/types.js";
import { classifyWindow } from "./classify.js";
import type { DispatchConfig } from "./config.js";
import { assembleContextPackage, preflightWindow } from "./context-package.js";
import type { SubagentInvoker, SubagentResult } from "./types.js";

export interface ChunkFailure {
	readonly bundleId: string;
	readonly error: {
		readonly message: string;
		readonly details?: unknown;
	};
}

export type DispatchOutcome =
	| { readonly outcome: "inline" }
	| { readonly outcome: "ok" }
	| {
			readonly outcome: "failed";
			readonly failures: readonly ChunkFailure[];
	  };

export type AdvanceBundleFn = (
	bundleId: string,
	status: BundleStatus,
) => Promise<void>;

export interface RunDispatchedWindowArgs {
	readonly window: readonly Bundle[];
	readonly config: DispatchConfig;
	readonly changeId: string;
	readonly taskGraph: TaskGraph;
	readonly repoRoot: string;
	readonly invoke: SubagentInvoker;
	readonly advance: AdvanceBundleFn;
}

function failureFromResult(
	bundleId: string,
	result: SubagentResult,
): ChunkFailure {
	return {
		bundleId,
		error: result.error ?? {
			message: `Subagent for bundle '${bundleId}' returned failure without an error payload.`,
		},
	};
}

function failureFromThrow(bundleId: string, err: unknown): ChunkFailure {
	if (err instanceof Error) {
		return {
			bundleId,
			error: { message: err.message, details: err.stack },
		};
	}
	return {
		bundleId,
		error: { message: String(err) },
	};
}

export async function runDispatchedWindow(
	args: RunDispatchedWindowArgs,
): Promise<DispatchOutcome> {
	const { window, config, changeId, taskGraph, repoRoot, invoke, advance } =
		args;

	const decision = classifyWindow(window, config);
	if (decision.mode === "inline") {
		return { outcome: "inline" };
	}

	// P1: validate every bundle in the window BEFORE any mutation. This call
	// throws `MissingCapabilityError` on the first unresolvable capability; the
	// error propagates to the caller with no bundle state changed.
	preflightWindow(window, changeId, repoRoot);

	for (const chunk of decision.chunks) {
		// Assemble context packages up-front (pure reads). If assembly throws
		// despite preflight (e.g., race with a concurrent filesystem edit), the
		// error propagates and no `in_progress` transition occurs for this chunk.
		const packages = chunk.map((b) =>
			assembleContextPackage(b, changeId, taskGraph, repoRoot),
		);

		// Advance each bundle in the chunk to `in_progress`, serialized through
		// the main agent. Any advance failure aborts the chunk immediately.
		for (let i = 0; i < chunk.length; i++) {
			await advance(chunk[i]!.id, "in_progress");
		}

		// Fire all subagents in the chunk in parallel. `allSettled` drains the
		// chunk even if some subagents reject.
		const settled = await Promise.allSettled(
			packages.map((pkg) => invoke(pkg)),
		);

		const failures: ChunkFailure[] = [];
		for (let i = 0; i < chunk.length; i++) {
			const bundle = chunk[i]!;
			const outcome = settled[i]!;
			if (outcome.status === "rejected") {
				failures.push(failureFromThrow(bundle.id, outcome.reason));
				continue;
			}
			const result = outcome.value;
			if (result.status === "failure") {
				failures.push(failureFromResult(bundle.id, result));
				continue;
			}
			// Success: record `done`. A thrown `advance(done)` means the CLI
			// mutation failed (e.g., `specflow-advance-bundle` exited non-zero).
			// The `/specflow.apply` fail-fast contract requires STOP-immediately
			// on any non-zero CLI exit (R4-F08) — so we:
			//   1. Record the bundle as failed.
			//   2. STOP processing the rest of the chunk immediately. We do NOT
			//      attempt `advance(done)` for later siblings, because that would
			//      mask the first CLI failure behind additional mutations and
			//      could leave task-graph.json in a state beyond the failure.
			try {
				await advance(bundle.id, "done");
			} catch (err) {
				failures.push(failureFromThrow(bundle.id, err));
				return { outcome: "failed", failures };
			}
		}

		if (failures.length > 0) {
			return { outcome: "failed", failures };
		}
	}

	return { outcome: "ok" };
}
