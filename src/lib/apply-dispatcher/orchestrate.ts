// Chunked subagent orchestration — the "what the main agent does" half of
// the dispatcher, extended by apply-worktree-isolation to create ephemeral
// per-bundle worktrees, run main-agent integration, and advance bundles to
// the new subagent_failed / integration_rejected terminal statuses.
//
// Contract:
//   1. Classify the window. If inline, return `{ outcome: "inline" }` without
//      touching any state; the caller falls back to the legacy main-agent path.
//   2. For subagent-dispatched windows: preflight the ENTIRE window. If any
//      bundle has an unresolvable `owner_capability`, throw
//      `MissingCapabilityError` before ANY `advance()` call.
//   3. If worktreeRuntime is provided, CREATE WORKTREES for every bundle in the
//      current chunk BEFORE any advance() call. If any worktree creation fails,
//      throw `WorktreeError` upward — the caller fails the apply fast.
//   4. For each chunk (in bundle order):
//      a. Assemble per-bundle ContextPackages (pure read).
//      b. Advance every bundle in the chunk to `in_progress`.
//      c. Invoke subagents in parallel via `Promise.allSettled`.
//      d. For each result:
//         - throw  → advance to `subagent_failed`, retain worktree, record failure.
//         - failure → advance to `subagent_failed`, retain worktree, record failure.
//         - success → run main-agent integration:
//             - accepted → advance to `done`, remove worktree.
//             - rejected → advance to `integration_rejected`, retain worktree,
//               record failure with the specific rejection cause.
//      e. If ANY bundle in the chunk ended in a non-done terminal status, STOP
//         after the chunk drains. Subsequent chunks are NOT dispatched.

import {
	formatRejectionCause,
	type IntegrationRejectionCause,
	integrateBundle,
	type SubagentSuccessResult,
} from "../apply-worktree/integrate.js";
import {
	createWorktree,
	removeWorktree,
	WorktreeError,
	type WorktreeHandle,
	type WorktreeRuntime,
} from "../apply-worktree/worktree.js";
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
	/**
	 * Set to `"subagent_failed"` when the subagent itself reported failure or
	 * threw, and `"integration_rejected"` when main-agent integration rejected
	 * a subagent success. Useful for /specflow.fix_apply to branch on the
	 * recovery path.
	 */
	readonly terminalStatus: "subagent_failed" | "integration_rejected";
	/**
	 * Structured rejection cause for `integration_rejected` failures; undefined
	 * for `subagent_failed`.
	 */
	readonly integrationCause?: IntegrationRejectionCause;
}

export type DispatchOutcome =
	| { readonly outcome: "inline" }
	| {
			readonly outcome: "ok";
			readonly cleanupWarnings?: readonly WorktreeCleanupWarning[];
	  }
	| {
			readonly outcome: "failed";
			readonly failures: readonly ChunkFailure[];
			readonly cleanupWarnings?: readonly WorktreeCleanupWarning[];
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
	/**
	 * Enables subagent-worktree execution: each bundle in a subagent-dispatched
	 * chunk gets an ephemeral worktree, and successful subagent results go
	 * through main-agent integration before reaching `done`. REQUIRED for all
	 * subagent-dispatched windows — omitting it when the window classifies as
	 * subagent mode triggers a fail-fast error (`subagent-shared` is NOT a
	 * supported execution mode). Only inline-classified windows may proceed
	 * without it, since they return `{ outcome: "inline" }` before reaching
	 * the worktree code path.
	 */
	readonly worktreeRuntime?: WorktreeRuntime;
	/**
	 * Required whenever `worktreeRuntime` is provided. Used as the parent
	 * directory segment under `.specflow/worktrees/<runId>/<bundleId>/`.
	 */
	readonly runId?: string;
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
		terminalStatus: "subagent_failed",
	};
}

function failureFromThrow(bundleId: string, err: unknown): ChunkFailure {
	if (err instanceof Error) {
		return {
			bundleId,
			error: { message: err.message, details: err.stack },
			terminalStatus: "subagent_failed",
		};
	}
	return {
		bundleId,
		error: { message: String(err) },
		terminalStatus: "subagent_failed",
	};
}

function failureFromIntegration(
	bundleId: string,
	cause: IntegrationRejectionCause,
): ChunkFailure {
	return {
		bundleId,
		error: { message: formatRejectionCause(cause) },
		terminalStatus: "integration_rejected",
		integrationCause: cause,
	};
}

/**
 * Best-effort worktree cleanup on the success path. We only invoke this after
 * the patch has been imported at main and the bundle advanced to `done`.
 * Failing hard here would regress a bundle that is already complete — so we
 * do NOT throw. Instead, the caller receives a warning describing the stale
 * worktree so it can be surfaced to the operator (R4-F12: cleanup failures
 * must not be silently swallowed, as they violate the fixed retention policy
 * and can cause path collisions on rerun).
 */
async function tryRemoveWorktree(
	runtime: WorktreeRuntime | undefined,
	handle: WorktreeHandle,
): Promise<WorktreeCleanupWarning | undefined> {
	if (!runtime) return undefined;
	try {
		removeWorktree(runtime, handle);
		return undefined;
	} catch (err) {
		return {
			bundleId: handle.bundleId,
			worktreePath: handle.path,
			message:
				err instanceof Error
					? err.message
					: `Unknown error removing worktree at ${handle.path}`,
		};
	}
}

/**
 * Describes a non-fatal worktree cleanup failure on the success path.
 * Callers should surface these to the operator so stale worktrees are not
 * silently left behind.
 */
export interface WorktreeCleanupWarning {
	readonly bundleId: string;
	readonly worktreePath: string;
	readonly message: string;
}

export async function runDispatchedWindow(
	args: RunDispatchedWindowArgs,
): Promise<DispatchOutcome> {
	const {
		window,
		config,
		changeId,
		taskGraph,
		repoRoot,
		invoke,
		advance,
		worktreeRuntime,
		runId,
	} = args;

	const decision = classifyWindow(window, config);
	if (decision.mode === "inline") {
		return { outcome: "inline" };
	}

	// The proposal defines exactly two execution modes: `inline-main` and
	// `subagent-worktree`. `subagent-shared` (dispatched subagent without an
	// isolated worktree) is NOT a supported mode. If the window was classified
	// as subagent-dispatched but the caller did not provide a worktreeRuntime,
	// fail fast — do NOT silently fall back to the legacy shared-workspace path.
	if (!worktreeRuntime) {
		throw new Error(
			"runDispatchedWindow: window classified as subagent-dispatched but worktreeRuntime was not provided. " +
				"subagent-shared execution is not a supported mode — callers MUST provide worktreeRuntime (and runId) for all dispatched windows.",
		);
	}

	if (!runId) {
		throw new Error(
			"runDispatchedWindow: worktreeRuntime provided without runId; runId is required for .specflow/worktrees/<runId>/ layout.",
		);
	}

	// P1: validate every bundle in the window BEFORE any mutation. This call
	// throws `MissingCapabilityError` on the first unresolvable capability; the
	// error propagates to the caller with no bundle state changed.
	preflightWindow(window, changeId, repoRoot);

	const allCleanupWarnings: WorktreeCleanupWarning[] = [];

	for (const chunk of decision.chunks) {
		// Create worktrees up-front (BEFORE any advance) so worktree-add errors
		// are surfaced as apply fail-fast without leaving any bundle in
		// `in_progress` with no worktree. If worktreeRuntime is absent, this
		// loop degenerates to no-op and the legacy direct-subagent path applies.
		const handles = new Map<string, WorktreeHandle>();
		if (worktreeRuntime && runId) {
			for (const b of chunk) {
				try {
					handles.set(b.id, createWorktree(worktreeRuntime, runId, b.id));
				} catch (err) {
					// Roll back any worktrees we just created in this chunk so a
					// half-initialized chunk isn't left behind for /specflow.fix_apply
					// to untangle. Cleanup is best-effort — if it fails, the caller
					// still sees the fail-fast error that triggered rollback.
					for (const handle of handles.values()) {
						try {
							removeWorktree(worktreeRuntime, handle);
						} catch {
							// ignore
						}
					}
					if (err instanceof WorktreeError) {
						throw err;
					}
					throw new WorktreeError(
						`Unexpected error creating worktree for bundle '${b.id}': ${err instanceof Error ? err.message : String(err)}`,
						{ operation: "create-unexpected" },
					);
				}
			}
		}

		// R3-F08: wrap the pre-subagent phase (context assembly + in_progress
		// transitions) in a try-catch so that worktrees created above are cleaned
		// up if any of these steps throw. Without this, a race in
		// `assembleContextPackage` or a failing `advance(in_progress)` would
		// leave orphan worktrees on disk — causing path collisions on retry.
		let packages: ReturnType<typeof assembleContextPackage>[];
		try {
			// Assemble context packages up-front (pure reads). If assembly throws
			// despite preflight (e.g., race with a concurrent filesystem edit),
			// the error propagates and no `in_progress` transition occurs.
			packages = chunk.map((b) =>
				assembleContextPackage(b, changeId, taskGraph, repoRoot),
			);

			// Advance each bundle in the chunk to `in_progress`, serialized
			// through the main agent. Any advance failure aborts the chunk.
			for (let i = 0; i < chunk.length; i++) {
				await advance(chunk[i]!.id, "in_progress");
			}
		} catch (err) {
			// Best-effort cleanup of all worktrees created for this chunk.
			for (const handle of handles.values()) {
				try {
					removeWorktree(worktreeRuntime, handle);
				} catch {
					// ignore — the original error is more important
				}
			}
			throw err;
		}

		// Fire all subagents in the chunk in parallel. `allSettled` drains the
		// chunk even if some subagents reject.
		const settled = await Promise.allSettled(
			packages.map((pkg, i) => {
				const b = chunk[i]!;
				const handle = handles.get(b.id);
				return invoke(pkg, handle);
			}),
		);

		const failures: ChunkFailure[] = [];
		for (let i = 0; i < chunk.length; i++) {
			const bundle = chunk[i]!;
			const outcome = settled[i]!;
			const handle = handles.get(bundle.id);

			if (outcome.status === "rejected") {
				await advance(bundle.id, "subagent_failed");
				failures.push(failureFromThrow(bundle.id, outcome.reason));
				continue;
			}
			const result = outcome.value;
			if (result.status === "failure") {
				await advance(bundle.id, "subagent_failed");
				failures.push(failureFromResult(bundle.id, result));
				continue;
			}

			// Success — run the main-agent integration step. worktreeRuntime is
			// guaranteed non-null by the fail-fast check at the top of this
			// function (subagent-shared is not a supported mode). The handle
			// MUST exist for every bundle in the chunk because worktrees are
			// created up-front before any advance.
			const successResult: SubagentSuccessResult = {
				status: "success",
				produced_artifacts: result.produced_artifacts,
			};
			const integration = integrateBundle({
				runtime: worktreeRuntime,
				handle: handle!,
				changeId,
				subagentResult: successResult,
			});
			if (!integration.ok) {
				await advance(bundle.id, "integration_rejected");
				failures.push(failureFromIntegration(bundle.id, integration.cause));
				// Worktree retained for diagnosis — do NOT call removeWorktree.
				continue;
			}
			try {
				await advance(bundle.id, "done");
			} catch (err) {
				failures.push(failureFromThrow(bundle.id, err));
				return {
					outcome: "failed",
					failures,
					cleanupWarnings:
						allCleanupWarnings.length > 0 ? allCleanupWarnings : undefined,
				};
			}
			const cleanupWarning = await tryRemoveWorktree(worktreeRuntime, handle!);
			if (cleanupWarning) {
				allCleanupWarnings.push(cleanupWarning);
			}
		}

		if (failures.length > 0) {
			return {
				outcome: "failed",
				failures,
				cleanupWarnings:
					allCleanupWarnings.length > 0 ? allCleanupWarnings : undefined,
			};
		}
	}

	return {
		outcome: "ok",
		cleanupWarnings:
			allCleanupWarnings.length > 0 ? allCleanupWarnings : undefined,
	};
}
