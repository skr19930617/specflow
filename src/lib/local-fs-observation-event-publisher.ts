// Local-filesystem observation event publisher.
//
// Appends events as JSONL to `<runsRoot>/<run_id>/events.jsonl`. The log is
// both transport and persistence; a single file per run, line-oriented, safe
// to tail with standard tools, cheap to replay.
//
// Idempotency is enforced by maintaining an in-memory `Set<event_id>` loaded
// from the existing log at construction time. A `publish()` call with an
// `event_id` already on disk is a silent no-op, matching the at-least-once
// + bit-identical re-emission contract without double-writing.
//
// Concurrency safety: `withLockedPublisher` acquires a per-run file lock
// before creating the publisher, ensuring that sequence allocation and
// event writes are atomic across concurrent CLI processes.

import {
	appendFileSync,
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { join } from "node:path";

import type { ObservationEvent } from "../types/observation-events.js";
import { ensureDir } from "./fs.js";
import type { ObservationEventPublisher } from "./observation-event-publisher.js";

/** Path to a run's event log under the runs root. */
export function eventLogPath(runsRoot: string, runId: string): string {
	return join(runsRoot, runId, "events.jsonl");
}

/** In-memory summary of an existing log, used to seed a publisher. */
interface LogState {
	readonly seenIds: Set<string>;
	readonly highestSequence: number;
}

function readExistingLog(path: string): LogState {
	if (!existsSync(path)) {
		return { seenIds: new Set(), highestSequence: 0 };
	}
	const raw = readFileSync(path, "utf8");
	const seenIds = new Set<string>();
	let highestSequence = 0;
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: { event_id?: unknown; sequence?: unknown };
		try {
			parsed = JSON.parse(trimmed) as typeof parsed;
		} catch {
			// Tolerate a torn final line from a prior crash; drop it.
			continue;
		}
		if (typeof parsed.event_id === "string") {
			seenIds.add(parsed.event_id);
		}
		if (
			typeof parsed.sequence === "number" &&
			parsed.sequence > highestSequence
		) {
			highestSequence = parsed.sequence;
		}
	}
	return { seenIds, highestSequence };
}

// ---------------------------------------------------------------------------
// File locking — prevents concurrent CLI processes from allocating the same
// sequence numbers or interleaving events within a single run.
// ---------------------------------------------------------------------------

const LOCK_STALE_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;

/**
 * Acquire an exclusive file lock via O_CREAT|O_EXCL, execute `fn`, then
 * release. Stale locks (older than LOCK_STALE_MS) are automatically removed.
 */
function withFileLock<T>(lockPath: string, fn: () => T): T {
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	let acquired = false;
	while (!acquired) {
		try {
			const fd = openSync(lockPath, "wx");
			closeSync(fd);
			acquired = true;
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			// Check for stale lock left by a crashed process.
			try {
				const stat = statSync(lockPath);
				if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
					try {
						unlinkSync(lockPath);
					} catch {
						/* race with another cleaner */
					}
					continue;
				}
			} catch {
				// Lock file disappeared between exists-check and stat; retry.
				continue;
			}
			if (Date.now() > deadline) {
				throw new Error(`Event log lock timeout: ${lockPath}`);
			}
			// Brief spin-wait before retrying (~10 ms).
			const spinEnd = Date.now() + 10;
			while (Date.now() < spinEnd) {
				/* spin */
			}
		}
	}
	try {
		return fn();
	} finally {
		try {
			unlinkSync(lockPath);
		} catch {
			/* already removed */
		}
	}
}

/**
 * Create a publisher scoped to a single run **without** file locking.
 *
 * **WARNING — NOT SAFE for concurrent CLI processes.** Sequence numbers are
 * allocated in-memory without a run-scoped lock; concurrent processes will
 * race on sequence allocation and may produce duplicate sequence numbers.
 *
 * Use only in tests and known single-process scenarios. Production CLI code
 * MUST use `withLockedPublisher` instead to guarantee per-run monotonic
 * sequence ordering across concurrent processes.
 */
export function createLocalFsObservationEventPublisher(
	runsRoot: string,
	runId: string,
): ObservationEventPublisher & { readonly highestSequence: () => number } {
	const path = eventLogPath(runsRoot, runId);
	const state = readExistingLog(path);
	const seenIds = new Set(state.seenIds);
	let highest = state.highestSequence;

	return {
		publish(event: ObservationEvent): void {
			if (event.run_id !== runId) {
				throw new Error(
					`Publisher scoped to run '${runId}' received event for run '${event.run_id}'`,
				);
			}
			if (seenIds.has(event.event_id)) {
				// At-least-once with idempotency: already on disk, silent no-op.
				return;
			}
			ensureDir(join(runsRoot, runId));
			appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
			seenIds.add(event.event_id);
			if (event.sequence > highest) {
				highest = event.sequence;
			}
		},
		highestSequence(): number {
			return highest;
		},
	};
}

/**
 * Execute `fn` with a locked publisher for the given run. The file lock is
 * held for the entire duration of `fn`, so all events published within are
 * sequenced atomically — no concurrent CLI process can interleave or
 * allocate overlapping sequence numbers.
 *
 * The publisher created inside the lock reads the current log state under
 * the lock, so `highestSequence()` is always accurate.
 */
export function withLockedPublisher(
	runsRoot: string,
	runId: string,
	fn: (
		publisher: ObservationEventPublisher & {
			readonly highestSequence: () => number;
		},
	) => void,
): void {
	const path = eventLogPath(runsRoot, runId);
	const lockPath = `${path}.lock`;
	ensureDir(join(runsRoot, runId));

	withFileLock(lockPath, () => {
		const state = readExistingLog(path);
		const seenIds = new Set(state.seenIds);
		let highest = state.highestSequence;

		fn({
			publish(event: ObservationEvent): void {
				if (event.run_id !== runId) {
					throw new Error(
						`Publisher scoped to run '${runId}' received event for run '${event.run_id}'`,
					);
				}
				if (seenIds.has(event.event_id)) {
					return;
				}
				appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
				seenIds.add(event.event_id);
				if (event.sequence > highest) {
					highest = event.sequence;
				}
			},
			highestSequence(): number {
				return highest;
			},
		});
	});
}
