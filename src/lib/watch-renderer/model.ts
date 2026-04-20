// Render model for `specflow-watch`. A `WatchModel` is a plain data structure
// computed from tolerant artifact reads; `renderFrame` (see render.ts) turns
// it into ANSI text. Separating the model keeps both halves unit-testable.

import type { AutofixProgressSnapshot } from "../../types/autofix-progress.js";
import type { RawObservationEvent } from "../observation-event-reader.js";
import type { ArtifactReadResult } from "../specflow-watch/artifact-readers.js";
import type { Bundle } from "../task-planner/index.js";

/** Per-section state tag: present / placeholder / warning. */
export type SectionState<T> =
	| { readonly kind: "ok"; readonly value: T }
	| { readonly kind: "placeholder"; readonly message: string }
	| { readonly kind: "warning"; readonly message: string };

export interface WatchModelHeader {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly branch: string;
}

export interface ReviewRoundView {
	readonly round_index: number;
	readonly max_rounds: number;
	readonly unresolved_high: number;
	readonly unresolved_critical: number;
	readonly unresolved_medium: number;
	readonly score: number | null;
	readonly loop_state: string;
}

export interface BundleView {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly tasks_done: number;
	readonly tasks_total: number;
}

export interface TaskGraphView {
	readonly bundles: readonly BundleView[];
	readonly bundles_done: number;
	readonly bundles_total: number;
}

export interface EventView {
	readonly timestamp: string;
	readonly kind: string;
	readonly summary: string;
}

export interface WatchModel {
	readonly header: WatchModelHeader;
	readonly terminal_banner: string | null;
	readonly review: SectionState<ReviewRoundView>;
	readonly task_graph: SectionState<TaskGraphView>;
	readonly events: SectionState<readonly EventView[]>;
}

// ---------------------------------------------------------------------------
// Model builders — pure functions over read results.
// ---------------------------------------------------------------------------

export function buildHeader(input: {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly branch: string;
}): WatchModelHeader {
	return input;
}

export function terminalBannerFor(status: string): string | null {
	if (status === "active") return null;
	if (status === "suspended") return `Run suspended — press q to quit`;
	if (status === "terminal") return `Run completed — press q to quit`;
	return `Run ${status} — press q to quit`;
}

function severityCount(
	summary: Record<string, number> | undefined,
	key: string,
): number {
	if (!summary) return 0;
	const v = summary[key.toUpperCase()] ?? summary[key];
	return typeof v === "number" ? v : 0;
}

export function buildReviewView(
	phaseIsReviewGate: boolean,
	read: ArtifactReadResult<AutofixProgressSnapshot>,
): SectionState<ReviewRoundView> {
	if (!phaseIsReviewGate) {
		return { kind: "placeholder", message: "No active review" };
	}
	switch (read.kind) {
		case "absent":
			return { kind: "placeholder", message: "No active review" };
		case "unreadable":
			return {
				kind: "warning",
				message: `Autofix snapshot unreadable: ${read.reason}`,
			};
		case "malformed":
			return {
				kind: "warning",
				message: `Autofix snapshot malformed: ${read.reason}`,
			};
		case "ok": {
			const s = read.value;
			const high = severityCount(s.counters.severitySummary, "HIGH");
			const critical = severityCount(s.counters.severitySummary, "CRITICAL");
			const medium = severityCount(s.counters.severitySummary, "MEDIUM");
			return {
				kind: "ok",
				value: {
					round_index: s.round_index,
					max_rounds: s.max_rounds,
					unresolved_high: high,
					unresolved_critical: critical,
					unresolved_medium: medium,
					score: null,
					loop_state: s.loop_state,
				},
			};
		}
	}
}

function bundleView(b: Bundle): BundleView {
	let done = 0;
	for (const t of b.tasks) if (t.status === "done") done++;
	return {
		id: b.id,
		title: b.title,
		status: b.status,
		tasks_done: done,
		tasks_total: b.tasks.length,
	};
}

export function buildTaskGraphView(
	read: ArtifactReadResult<{ readonly bundles: readonly Bundle[] }>,
	orderBundles: (bundles: readonly Bundle[]) => readonly Bundle[] = passthrough,
): SectionState<TaskGraphView> {
	switch (read.kind) {
		case "absent":
			return {
				kind: "placeholder",
				message: "No task graph yet (generated in design phase)",
			};
		case "unreadable":
			return {
				kind: "warning",
				message: `task-graph.json unreadable: ${read.reason}`,
			};
		case "malformed":
			return {
				kind: "warning",
				message: `task-graph.json malformed: ${read.reason}`,
			};
		case "ok": {
			const ordered = orderBundles(read.value.bundles);
			let doneBundles = 0;
			const views: BundleView[] = [];
			for (const b of ordered) {
				if (b.status === "done") doneBundles++;
				views.push(bundleView(b));
			}
			return {
				kind: "ok",
				value: {
					bundles: views,
					bundles_done: doneBundles,
					bundles_total: ordered.length,
				},
			};
		}
	}
}

function passthrough<T>(x: T): T {
	return x;
}

function eventSummary(ev: RawObservationEvent): string {
	const payload = ev.payload;
	if (payload && typeof payload === "object") {
		const p = payload as Record<string, unknown>;
		if (typeof p.summary === "string") return p.summary;
		if (typeof p.loop_state === "string") return `loop_state=${p.loop_state}`;
	}
	return "";
}

export function buildEventsView(
	events: readonly RawObservationEvent[],
): SectionState<readonly EventView[]> {
	if (events.length === 0) {
		return { kind: "placeholder", message: "No events recorded" };
	}
	const views: EventView[] = events.map((ev) => ({
		timestamp:
			typeof ev.timestamp === "string" && ev.timestamp ? ev.timestamp : "",
		kind: typeof ev.event_kind === "string" ? ev.event_kind : "event",
		summary: eventSummary(ev),
	}));
	return { kind: "ok", value: views };
}
