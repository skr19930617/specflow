// specflow-advance-bundle — CLI wrapper around advanceBundleStatus.
//
// Reads task-graph.json for a change, advances one bundle to a new status
// with child-task normalization, atomically persists task-graph.json and
// tasks.md, and emits one JSON audit log line per child-task coercion.
//
// Usage: specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>

import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { advanceBundleStatus } from "../lib/task-planner/advance.js";
import { validateTaskGraph } from "../lib/task-planner/schema.js";
import type { BundleStatus, TaskGraph } from "../lib/task-planner/types.js";

const VALID_STATUSES: readonly BundleStatus[] = [
	"pending",
	"in_progress",
	"done",
	"skipped",
	"subagent_failed",
	"integration_rejected",
];

interface DieContext {
	readonly changeId?: string;
	readonly bundleId?: string;
	readonly newStatus?: string;
}

/**
 * Emit an `advance-bundle-result` error envelope to stdout and exit 1.
 *
 * Unified with the post-orchestration error path so programmatic callers can
 * always `JSON.parse(stdout)` without branching on pre- vs post-call shape.
 * Unknown fields (e.g., `bundle_id` before args are parsed) are simply
 * omitted; the schema only requires `status` and `error` on the error branch.
 */
function die(error: string, context: DieContext = {}): never {
	const payload: Record<string, unknown> = { status: "error", error };
	if (context.changeId !== undefined) payload.change_id = context.changeId;
	if (context.bundleId !== undefined) payload.bundle_id = context.bundleId;
	if (context.newStatus !== undefined) payload.new_status = context.newStatus;
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
	process.exit(1);
}

function ensureGitRepo(): string {
	const result = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
	if (result.status !== 0) {
		die("Not in a git repository");
	}
	return result.stdout.trim();
}

function isBundleStatus(value: string): value is BundleStatus {
	return (VALID_STATUSES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
	const allArgs = process.argv.slice(2);
	// Extract --allow-reset flag; remaining positional args are CHANGE_ID BUNDLE_ID NEW_STATUS.
	// Only /specflow.fix_apply or an explicit operator reset flow should pass this flag.
	const allowReset = allArgs.includes("--allow-reset");
	const args = allArgs.filter((a) => a !== "--allow-reset");
	if (args.length < 3) {
		die(
			"Usage: specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS> [--allow-reset]. " +
				`NEW_STATUS must be one of: ${VALID_STATUSES.join(" | ")}. ` +
				"--allow-reset is required for subagent_failed|integration_rejected → pending transitions.",
		);
	}

	const [changeId, bundleId, rawStatus] = args;
	if (!isBundleStatus(rawStatus)) {
		die(
			`Invalid NEW_STATUS: '${rawStatus}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
			{ changeId, bundleId, newStatus: rawStatus },
		);
	}

	const projectRoot = ensureGitRepo();
	const store = createLocalFsChangeArtifactStore(projectRoot);
	const taskGraphRef = changeRef(changeId, ChangeArtifactType.TaskGraph);
	if (!(await store.exists(taskGraphRef))) {
		die(`task-graph.json not found for change '${changeId}'`, {
			changeId,
			bundleId,
			newStatus: rawStatus,
		});
	}

	let taskGraph: TaskGraph;
	try {
		const parsed = JSON.parse(await store.read(taskGraphRef)) as unknown;
		const validation = validateTaskGraph(parsed);
		if (!validation.valid) {
			die(
				`task-graph.json schema validation failed: ${validation.errors.join("; ")}`,
				{ changeId, bundleId, newStatus: rawStatus },
			);
		}
		taskGraph = parsed as TaskGraph;
	} catch (error) {
		die(
			`Failed to parse task-graph.json: ${error instanceof Error ? error.message : String(error)}`,
			{ changeId, bundleId, newStatus: rawStatus },
		);
	}

	const tasksRef = changeRef(changeId, ChangeArtifactType.Tasks);
	const result = advanceBundleStatus({
		taskGraph,
		bundleId,
		newStatus: rawStatus,
		allowReset,
		writer: {
			writeTaskGraph(content) {
				void store.write(taskGraphRef, content);
			},
			writeTasksMd(content) {
				void store.write(tasksRef, content);
			},
		},
		logger(coercion) {
			// One structured JSON line per actual status change. Written to
			// stderr so stdout stays reserved for the machine-readable result.
			process.stderr.write(
				`${JSON.stringify({
					event: "task_status_coercion",
					change_id: changeId,
					bundle_id: coercion.bundleId,
					task_id: coercion.taskId,
					from_status: coercion.from,
					to_status: coercion.to,
				})}\n`,
			);
		},
	});

	if (!result.ok) {
		process.stdout.write(
			`${JSON.stringify(
				{
					status: "error",
					change_id: changeId,
					bundle_id: bundleId,
					new_status: rawStatus,
					error: result.error,
				},
				null,
				2,
			)}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(
		`${JSON.stringify(
			{
				status: "success",
				change_id: changeId,
				bundle_id: bundleId,
				new_status: rawStatus,
				coercions: result.coercions.length,
			},
			null,
			2,
		)}\n`,
	);
}

main();
