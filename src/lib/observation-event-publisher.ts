// Observation event publisher interface.
//
// Concrete implementations MUST satisfy the ordering (per-run monotonic) and
// delivery (at-least-once with bit-identical re-emission on idempotent keys)
// requirements defined in openspec/specs/workflow-observation-events/spec.md.

import type { ObservationEvent } from "../types/observation-events.js";

/**
 * Publisher contract: `publish` appends a single event to the run's
 * observation-event log. Implementations SHALL:
 *
 *   - preserve `event.sequence` as monotonically increasing within a run,
 *   - make each write visible to later readers as atomically as the
 *     underlying transport allows,
 *   - de-duplicate by `event_id` (at-least-once delivery with consumer-side
 *     idempotency — a re-published event with an id already on the log MUST
 *     NOT produce a second record).
 */
export interface ObservationEventPublisher {
	readonly publish: (event: ObservationEvent) => void;
}

/**
 * Returns the next `sequence` value for a run given the highest already
 * observed on the log. `highest` is the largest `sequence` seen so far, or
 * `0` if the log is empty.
 */
export function nextSequence(highest: number): number {
	return highest + 1;
}

/**
 * Deterministic `event_id` for a given (run_id, sequence) pair. Using a
 * deterministic scheme means a re-emission with the same (run, sequence)
 * produces bit-identical envelope fields, satisfying the re-emission
 * invariant without requiring a random UUID generator.
 */
export function makeEventId(runId: string, sequence: number): string {
	return `${runId}-evt-${sequence}`;
}
