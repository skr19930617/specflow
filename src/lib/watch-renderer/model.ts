// Render model for `specflow-watch`. A `WatchModel` is a plain data structure
// computed from tolerant artifact reads; `renderFrame` (see render.ts) turns
// it into ANSI text. Separating the model keeps both halves unit-testable.

import type { AutofixProgressSnapshot } from "../../types/autofix-progress.js";
import type { RunState } from "../../types/contracts.js";
import type { RawObservationEvent } from "../observation-event-reader.js";
import type { ArtifactReadResult } from "../specflow-watch/artifact-readers.js";
import type { Bundle, TaskStatus } from "../task-planner/index.js";

/** Per-section state tag: present / placeholder / warning. */
export type SectionState<T> =
	| { readonly kind: "ok"; readonly value: T }
	| { readonly kind: "placeholder"; readonly message: string }
	| { readonly kind: "warning"; readonly message: string };

export type ManualFixKind = "idle" | "design" | "apply";

export interface WatchModelHeader {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly branch: string;
	readonly manual_fix_kind: ManualFixKind;
}

export type ReviewRoundVisibility = "live" | "completed";

/**
 * Manual-fix indicator for the review section. Renderer emits a line only
 * when `active` is true; `count === null` produces `? unresolved`, any
 * concrete number renders as `N unresolved findings`.
 */
export type ReviewManualFixIndicator =
	| { readonly active: false }
	| { readonly active: true; readonly count: number | null };

export interface ReviewRoundView {
	readonly round_index: number;
	readonly max_rounds: number;
	readonly unresolved_high: number;
	readonly unresolved_critical: number;
	readonly unresolved_medium: number;
	readonly score: number | null;
	readonly loop_state: string;
	readonly visibility: ReviewRoundVisibility;
	readonly manual_fix: ReviewManualFixIndicator;
	/**
	 * True when the view carries a real snapshot. False for
	 * manual-fix-without-snapshot, where the renderer elides the Round line.
	 */
	readonly has_snapshot: boolean;
}

export interface BundleTaskView {
	readonly id: string;
	readonly title: string;
	readonly status: TaskStatus;
	readonly display_status: TaskStatus;
}

export interface BundleView {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly tasks_done: number;
	readonly tasks_total: number;
	readonly tasks: readonly BundleTaskView[];
}

export interface ApprovalSummaryView {
	readonly status_line: string | null;
	readonly diffstat_line: string | null;
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
	readonly approval_summary: SectionState<ApprovalSummaryView>;
}

// ---------------------------------------------------------------------------
// Model builders — pure functions over read results.
// ---------------------------------------------------------------------------

/**
 * Derive the manual-fix indicator from run history. The latest history entry
 * is authoritative: `revise_apply` → "apply", `revise_design` → "design",
 * otherwise → "idle". A later `review_*` event (or any other event) clears
 * the indicator automatically.
 */
export function deriveManualFixKind(
	run: Pick<RunState, "history">,
): ManualFixKind {
	const history = run.history;
	if (!history || history.length === 0) return "idle";
	const last = history[history.length - 1];
	if (last.event === "revise_apply") return "apply";
	if (last.event === "revise_design") return "design";
	return "idle";
}

export function buildHeader(input: {
	readonly run_id: string;
	readonly change_name: string | null;
	readonly current_phase: string;
	readonly status: string;
	readonly branch: string;
	readonly manual_fix_kind: ManualFixKind;
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

export interface BuildReviewViewInput {
	/** Is the current phase a live review gate (`design_review`/`apply_review`)? */
	readonly phase_is_review_gate: boolean;
	/**
	 * Did the current phase resolve to a review family (design or apply)? When
	 * false (e.g., `proposal_*` / `spec_*`), the section renders "No active
	 * review" regardless of snapshot presence.
	 */
	readonly phase_in_review_family: boolean;
	readonly snapshot: ArtifactReadResult<AutofixProgressSnapshot>;
	readonly manual_fix_kind: ManualFixKind;
}

export function buildReviewView(
	input: BuildReviewViewInput,
): SectionState<ReviewRoundView> {
	const {
		phase_is_review_gate,
		phase_in_review_family,
		snapshot,
		manual_fix_kind,
	} = input;
	if (!phase_in_review_family) {
		return { kind: "placeholder", message: "No active review" };
	}
	// When manual fix is active, always render the indicator — even for
	// unreadable/malformed snapshots — per the spec's "? unresolved"
	// degradation contract. Losing the indicator on an I/O glitch would hide
	// the current state from the operator.
	const manualFixFallback = (): SectionState<ReviewRoundView> => ({
		kind: "ok",
		value: {
			round_index: 0,
			max_rounds: 0,
			unresolved_high: 0,
			unresolved_critical: 0,
			unresolved_medium: 0,
			score: null,
			loop_state: "",
			visibility: "completed",
			manual_fix: { active: true, count: null },
			has_snapshot: false,
		},
	});
	switch (snapshot.kind) {
		case "absent":
			if (manual_fix_kind !== "idle") return manualFixFallback();
			return { kind: "placeholder", message: "No active review" };
		case "unreadable":
			if (manual_fix_kind !== "idle") return manualFixFallback();
			return {
				kind: "warning",
				message: `Autofix snapshot unreadable: ${snapshot.reason}`,
			};
		case "malformed":
			if (manual_fix_kind !== "idle") return manualFixFallback();
			return {
				kind: "warning",
				message: `Autofix snapshot malformed: ${snapshot.reason}`,
			};
		case "ok": {
			const s = snapshot.value;
			const high = severityCount(s.counters.severitySummary, "HIGH");
			const critical = severityCount(s.counters.severitySummary, "CRITICAL");
			const medium = severityCount(s.counters.severitySummary, "MEDIUM");
			const visibility: ReviewRoundVisibility = phase_is_review_gate
				? "live"
				: "completed";
			const manualFix: ReviewManualFixIndicator =
				manual_fix_kind === "idle"
					? { active: false }
					: { active: true, count: s.counters.totalOpen };
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
					visibility,
					manual_fix: manualFix,
					has_snapshot: true,
				},
			};
		}
	}
}

function bundleView(b: Bundle): BundleView {
	let done = 0;
	for (const t of b.tasks) if (t.status === "done") done++;
	const bundleDone = b.status === "done";
	const tasks: BundleTaskView[] = b.tasks.map((t) => ({
		id: t.id,
		title: t.title,
		status: t.status,
		display_status: bundleDone ? "done" : t.status,
	}));
	return {
		id: b.id,
		title: b.title,
		status: b.status,
		tasks_done: done,
		tasks_total: b.tasks.length,
		tasks,
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

function pickString(payload: unknown, key: string): string | null {
	if (!payload || typeof payload !== "object") return null;
	const v = (payload as Record<string, unknown>)[key];
	return typeof v === "string" && v.length > 0 ? v : null;
}

function parenthesize(suffix: string | null): string {
	return suffix === null ? "" : ` (${suffix})`;
}

/**
 * Concrete one-line summary per event kind. For unknown kinds we fall back to
 * the legacy `payload.summary` / `payload.loop_state` projection so older
 * producers continue to render.
 */
function eventSummary(ev: RawObservationEvent): string {
	const kind = typeof ev.event_kind === "string" ? ev.event_kind : "";
	const source = typeof ev.source_phase === "string" ? ev.source_phase : null;
	const target = typeof ev.target_phase === "string" ? ev.target_phase : null;
	const gateRef = typeof ev.gate_ref === "string" ? ev.gate_ref : null;
	const trigger = pickString(ev.payload, "triggered_event");
	const outcome = pickString(ev.payload, "outcome");
	const gateKind = pickString(ev.payload, "gate_kind");
	const resolvedResponse = pickString(ev.payload, "resolved_response");
	const finalStatus = pickString(ev.payload, "final_status");

	switch (kind) {
		case "phase_entered":
			if (target === null) break;
			return `→ ${target}${parenthesize(trigger)}`;
		case "phase_completed":
			if (source === null) break;
			return `✓ ${source}${parenthesize(outcome)}`;
		case "gate_opened": {
			if (gateKind === null) break;
			const refSuffix = gateRef ? ` (${gateRef})` : "";
			return `⏸ waiting: ${gateKind}${refSuffix}`;
		}
		case "gate_resolved":
			if (gateKind === null) break;
			return resolvedResponse === null
				? `▶ ${gateKind}`
				: `▶ ${gateKind} = ${resolvedResponse}`;
		case "run_started":
			return "▶ run started";
		case "run_terminated":
			return finalStatus === null ? "■ run terminated" : `■ run ${finalStatus}`;
		default:
			break;
	}
	// Legacy fallback — only used for unknown kinds or when a required field
	// was missing from a known kind.
	const payload = ev.payload;
	if (payload && typeof payload === "object") {
		const p = payload as Record<string, unknown>;
		if (typeof p.summary === "string" && p.summary.length > 0) return p.summary;
		if (typeof p.loop_state === "string" && p.loop_state.length > 0) {
			return `loop_state=${p.loop_state}`;
		}
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

/**
 * Map an `ApprovalSummaryExtract` read result into the section state shown by
 * the renderer. Follows the end-to-end degradation contract documented in
 * design.md D5: absent → placeholder, missing → warning, partial extracts
 * are normalized so the renderer can always display a well-formed row list.
 */
export function buildApprovalSummary(
	read: ArtifactReadResult<ApprovalSummaryView>,
): SectionState<ApprovalSummaryView> {
	switch (read.kind) {
		case "absent":
			return { kind: "placeholder", message: "No approval yet" };
		case "unreadable":
			// Sentinel reason "missing" from the reader indicates the file was
			// advertised via `last_summary_path` but is absent on disk. Render
			// the spec's dedicated missing-file warning; other I/O errors keep
			// the generic unreadable message.
			if (read.reason === "missing") {
				return { kind: "warning", message: "Approval summary missing" };
			}
			return {
				kind: "warning",
				message: `Approval summary unreadable: ${read.reason}`,
			};
		case "malformed":
			return {
				kind: "warning",
				message: `Approval summary malformed: ${read.reason}`,
			};
		case "ok": {
			const { status_line, diffstat_line } = read.value;
			// Per the spec's end-to-end contract (design.md D5), a missing
			// `Status:` line degrades to "Status: (unknown)" regardless of
			// whether the diffstat is present. Both fields missing is still a
			// valid render — status shows "(unknown)" and the diffstat row is
			// omitted — rather than a malformed warning.
			const statusForView: string =
				status_line === null ? "Status: (unknown)" : status_line;
			return {
				kind: "ok",
				value: {
					status_line: statusForView,
					diffstat_line,
				},
			};
		}
	}
}
