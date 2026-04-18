// Runtime helpers for creating and resolving gates.
//
// Two public entry points:
// - issueGate(...) : creates a new gate, applying kind-specific concurrency.
//     * approval / review_decision: at most one pending per (run, phase);
//       a new same-kind/same-phase gate supersedes the prior pending one.
//     * clarify: multiple pending gates may coexist in one phase.
// - resolveGate(...) : applies a response to a pending gate, validating
//     allowed_responses and eligible_responder_roles.
//
// The supersede path uses a write-ahead intent journal (`.supersede-intent.json`)
// and a run-scoped lock file (`.gate-lock`) to keep the paired old/new writes
// recoverable after crashes. Recovery is lazy: `list()` and `read()` paths run
// through `recoverPendingIntent` before returning results.

import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { ActorIdentity } from "../contracts/surface-events.js";
import {
	allowedResponsesFor,
	defaultEligibleRolesFor,
	type GateKind,
	type GatePayload,
	type GateRecord,
	type GateStatus,
} from "../types/gate-records.js";
import { atomicWriteText, readText } from "./fs.js";
import type { GateRecordStore } from "./gate-record-store.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GateRuntimeErrorKind =
	| "invalid_gate_kind"
	| "invalid_response"
	| "role_not_eligible"
	| "gate_not_pending"
	| "gate_not_found"
	| "concurrent_issuance_conflict";

export class GateRuntimeError extends Error {
	readonly kind: GateRuntimeErrorKind;
	readonly gate_id?: string;
	constructor(kind: GateRuntimeErrorKind, message: string, gateId?: string) {
		super(message);
		this.name = "GateRuntimeError";
		this.kind = kind;
		this.gate_id = gateId;
	}
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface IssueGateInput {
	readonly gate_id: string;
	readonly gate_kind: GateKind;
	readonly run_id: string;
	readonly originating_phase: string;
	readonly reason: string;
	readonly payload: GatePayload;
	/** Optional override of the per-kind default role set. */
	readonly eligible_responder_roles?: readonly string[];
	readonly created_at: string;
	/** Event id to append to the new gate's history on creation. */
	readonly creation_event_id?: string;
}

export interface ResolveGateInput {
	readonly run_id: string;
	readonly gate_id: string;
	readonly response: string;
	readonly actor: ActorIdentity;
	/** Actor's active role (used to check eligibility). */
	readonly actor_role: string;
	readonly resolved_at: string;
	/** Event id to append to the gate's history on resolution. */
	readonly resolution_event_id?: string;
	/** For clarify gates: the answer text to persist in payload. */
	readonly answer?: string;
}

// ---------------------------------------------------------------------------
// issueGate
// ---------------------------------------------------------------------------

/**
 * Create a new gate in the store. For approval and review_decision kinds,
 * supersedes any existing pending gate with the same originating_phase. Clarify
 * gates are additive.
 *
 * Intent journal and lock file are used for approval/review_decision to make
 * the paired supersede+create writes recoverable after crash.
 */
export function issueGate(
	store: GateRecordStore,
	projectRoot: string,
	input: IssueGateInput,
): GateRecord {
	const roles =
		input.eligible_responder_roles ?? defaultEligibleRolesFor(input.gate_kind);
	const responses = allowedResponsesFor(input.gate_kind);

	const newRecord: GateRecord = {
		gate_id: input.gate_id,
		gate_kind: input.gate_kind,
		run_id: input.run_id,
		originating_phase: input.originating_phase,
		status: "pending",
		reason: input.reason,
		payload: input.payload,
		eligible_responder_roles: [...roles],
		allowed_responses: [...responses],
		created_at: input.created_at,
		resolved_at: null,
		decision_actor: null,
		resolved_response: null,
		event_ids: input.creation_event_id ? [input.creation_event_id] : [],
	};

	if (input.gate_kind === "clarify") {
		// No supersede; just write.
		store.write(input.run_id, newRecord);
		return newRecord;
	}

	// approval / review_decision: paired supersede + create under run lock + intent journal.
	return runUnderRunLock(projectRoot, input.run_id, () => {
		const supersedeTarget = findPendingSameKindPhase(
			store,
			input.run_id,
			input.gate_kind,
			input.originating_phase,
		);

		const intentPath = intentJournalPath(projectRoot, input.run_id);
		const intent = {
			version: 1,
			kind: "supersede" as const,
			run_id: input.run_id,
			old_gate: supersedeTarget,
			new_gate: newRecord,
		};
		atomicWriteText(intentPath, `${JSON.stringify(intent, null, 2)}\n`);

		if (supersedeTarget) {
			const superseded: GateRecord = {
				...supersedeTarget,
				status: "superseded",
				resolved_at: input.created_at,
				resolved_response: null,
				event_ids: input.creation_event_id
					? [...supersedeTarget.event_ids, input.creation_event_id]
					: [...supersedeTarget.event_ids],
			};
			store.write(input.run_id, superseded);
		}
		store.write(input.run_id, newRecord);

		// Success: clean up the intent journal.
		try {
			unlinkSync(intentPath);
		} catch {
			/* best effort */
		}

		return newRecord;
	});
}

// ---------------------------------------------------------------------------
// resolveGate
// ---------------------------------------------------------------------------

export function resolveGate(
	store: GateRecordStore,
	input: ResolveGateInput,
): GateRecord {
	const existing = store.read(input.run_id, input.gate_id);
	if (!existing) {
		throw new GateRuntimeError(
			"gate_not_found",
			`No gate ${input.gate_id} in run ${input.run_id}`,
			input.gate_id,
		);
	}
	if (existing.status !== "pending") {
		throw new GateRuntimeError(
			"gate_not_pending",
			`Gate ${input.gate_id} is ${existing.status}; only pending gates can be resolved`,
			input.gate_id,
		);
	}
	if (!existing.allowed_responses.includes(input.response)) {
		throw new GateRuntimeError(
			"invalid_response",
			`Response '${input.response}' is not in allowed_responses for ${existing.gate_kind}`,
			input.gate_id,
		);
	}
	if (!existing.eligible_responder_roles.includes(input.actor_role)) {
		throw new GateRuntimeError(
			"role_not_eligible",
			`Actor role '${input.actor_role}' is not in eligible_responder_roles for gate ${input.gate_id}`,
			input.gate_id,
		);
	}

	const mergedPayload = mergeAnswerIntoPayload(
		existing.payload,
		input.answer,
		input.response,
	);

	const resolved: GateRecord = {
		...existing,
		payload: mergedPayload,
		status: "resolved",
		resolved_at: input.resolved_at,
		decision_actor: input.actor,
		resolved_response: input.response,
		event_ids: input.resolution_event_id
			? [...existing.event_ids, input.resolution_event_id]
			: [...existing.event_ids],
	};

	store.write(input.run_id, resolved);
	return resolved;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeAnswerIntoPayload(
	payload: GatePayload,
	answer: string | undefined,
	response: string,
): GatePayload {
	if (payload.kind !== "clarify") return payload;
	if (response !== "clarify_response" || answer === undefined) return payload;
	return { ...payload, answer };
}

function findPendingSameKindPhase(
	store: GateRecordStore,
	runId: string,
	kind: GateKind,
	phase: string,
): GateRecord | null {
	const all = store.list(runId);
	for (const g of all) {
		if (
			g.status === "pending" &&
			g.gate_kind === kind &&
			g.originating_phase === phase
		) {
			return g;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Lock file (O_CREAT|O_EXCL with stale-lock breaking)
// ---------------------------------------------------------------------------

const LOCK_STALE_MS = 30_000; // 30s matches design.md D4

function lockPath(projectRoot: string, runId: string): string {
	return resolve(projectRoot, ".specflow/runs", runId, "records", ".gate-lock");
}

function intentJournalPath(projectRoot: string, runId: string): string {
	return resolve(
		projectRoot,
		".specflow/runs",
		runId,
		"records",
		".supersede-intent.json",
	);
}

function runUnderRunLock<T>(
	projectRoot: string,
	runId: string,
	fn: () => T,
): T {
	const path = lockPath(projectRoot, runId);
	mkdirSync(dirname(path), { recursive: true });
	const startedAt = Date.now();
	// Ensure containing directory exists; GateRecordStore.write also creates it.
	const waitDeadline = startedAt + LOCK_STALE_MS * 2;
	let acquired = false;
	let fd = -1;
	while (!acquired) {
		try {
			fd = openSync(path, "wx");
			acquired = true;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw err;
			// inspect the existing lock
			if (isStaleLock(path)) {
				try {
					unlinkSync(path);
				} catch {
					/* best-effort */
				}
				continue;
			}
			if (Date.now() > waitDeadline) {
				throw new GateRuntimeError(
					"concurrent_issuance_conflict",
					`Timed out waiting for gate lock at ${path}`,
				);
			}
			sleep(100);
		}
	}
	try {
		writeSync(fd, `${process.pid}:${Date.now()}`);
		return fn();
	} finally {
		if (fd !== -1) {
			try {
				closeSync(fd);
			} catch {
				/* best-effort */
			}
		}
		try {
			unlinkSync(path);
		} catch {
			/* best-effort */
		}
	}
}

function isStaleLock(path: string): boolean {
	if (!existsSync(path)) return true;
	try {
		const content = readText(path).trim();
		const parts = content.split(":");
		const ts = Number(parts[1] ?? "0");
		if (!Number.isFinite(ts)) return true;
		return Date.now() - ts > LOCK_STALE_MS;
	} catch {
		return true;
	}
}

// node:test supports async waits but we use a small synchronous spin to keep
// issueGate synchronous for legacy call sites.
function sleep(ms: number): void {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		// busy-wait deliberately short
	}
}

// ---------------------------------------------------------------------------
// Recovery (intent journal replay)
// ---------------------------------------------------------------------------

/**
 * Replay any leftover `.supersede-intent.json` files in a run's records
 * directory. Completes a partial supersede by writing both records if missing,
 * or rolls forward from the journal. Idempotent.
 */
export function recoverPendingIntent(
	store: GateRecordStore,
	projectRoot: string,
	runId: string,
): void {
	const path = intentJournalPath(projectRoot, runId);
	if (!existsSync(path)) return;
	let raw: string;
	try {
		raw = readText(path);
	} catch {
		return;
	}
	let intent: unknown;
	try {
		intent = JSON.parse(raw);
	} catch {
		return;
	}
	if (
		typeof intent !== "object" ||
		intent === null ||
		(intent as { kind?: string }).kind !== "supersede"
	) {
		return;
	}
	const payload = intent as {
		old_gate: GateRecord | null;
		new_gate: GateRecord;
	};
	// Re-apply writes; atomic writes are idempotent.
	if (payload.old_gate) {
		const superseded: GateRecord = {
			...payload.old_gate,
			status: "superseded" as GateStatus,
			resolved_at: payload.old_gate.resolved_at ?? payload.new_gate.created_at,
			resolved_response: null,
		};
		store.write(runId, superseded);
	}
	store.write(runId, payload.new_gate);
	try {
		unlinkSync(path);
	} catch {
		/* best-effort */
	}
}

/** Find all run ids under projectRoot that currently have leftover intent journals. */
export function listRunsWithPendingIntent(projectRoot: string): string[] {
	const runsRoot = resolve(projectRoot, ".specflow/runs");
	if (!existsSync(runsRoot)) return [];
	const out: string[] = [];
	for (const runId of readdirSync(runsRoot)) {
		if (existsSync(intentJournalPath(projectRoot, runId))) {
			out.push(runId);
		}
	}
	return out;
}
