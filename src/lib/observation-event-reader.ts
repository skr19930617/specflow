// Read-only tailer for observation-event JSONL logs.
//
// The write-side contract lives in `local-fs-observation-event-publisher.ts`;
// this module is its read-only counterpart. A torn final line from a prior
// crashed writer is tolerated (dropped silently), matching the publisher's
// own tolerance when it re-scans its log on boot.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal shape of an observation event the watcher cares about. The JSONL
 * log may store richer payloads; the reader keeps parsed objects as
 * `Record<string, unknown>` to avoid coupling to a specific event schema
 * version.
 */
export interface RawObservationEvent {
	readonly event_id?: string;
	readonly sequence?: number;
	readonly run_id?: string;
	readonly event_kind?: string;
	readonly timestamp?: string;
	readonly payload?: unknown;
	readonly [key: string]: unknown;
}

export function eventLogPath(projectRoot: string, runId: string): string {
	return join(projectRoot, ".specflow/runs", runId, "events.jsonl");
}

/**
 * Read an entire events.jsonl, tolerate torn last lines, and return the
 * last `n` entries whose `run_id` matches `runId`. Older-first order is
 * preserved (newest last) because terminal UIs typically show recent
 * entries at the bottom.
 */
export function tailEventsForRun(
	logPath: string,
	runId: string,
	n: number,
): readonly RawObservationEvent[] {
	if (n <= 0) return [];
	if (!existsSync(logPath)) return [];
	let raw: string;
	try {
		raw = readFileSync(logPath, "utf8");
	} catch {
		return [];
	}
	if (raw.length === 0) return [];
	const lines = raw.split("\n");
	const out: RawObservationEvent[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: RawObservationEvent;
		try {
			parsed = JSON.parse(trimmed) as RawObservationEvent;
		} catch {
			// Torn line from a crashed writer; skip.
			continue;
		}
		if (parsed && typeof parsed === "object" && parsed.run_id === runId) {
			out.push(parsed);
		}
	}
	if (out.length <= n) return out;
	return out.slice(out.length - n);
}

/** Convenience wrapper that resolves the per-run log path first. */
export function tailRunEvents(
	projectRoot: string,
	runId: string,
	n: number,
): readonly RawObservationEvent[] {
	return tailEventsForRun(eventLogPath(projectRoot, runId), runId, n);
}
