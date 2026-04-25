// Render model for `specflow-watch`. A `WatchModel` is a plain data structure
// computed from tolerant artifact reads; `renderFrame` (see render.ts) turns
// it into ANSI text. Separating the model keeps both halves unit-testable.

import type { AutofixProgressSnapshot } from "../../types/autofix-progress.js";
import type {
	ReviewFinding,
	ReviewLedger,
	RunState,
} from "../../types/contracts.js";
import type { RawObservationEvent } from "../observation-event-reader.js";
import type {
	ArtifactReadResult,
	ReviewLedgerFamily,
} from "../specflow-watch/artifact-readers.js";
import type { Bundle, TaskStatus } from "../task-planner/index.js";

/** Per-section state tag: present / placeholder / warning. */
export type SectionState<T> =
	| { readonly kind: "ok"; readonly value: T }
	| { readonly kind: "placeholder"; readonly message: string }
	| { readonly kind: "warning"; readonly message: string };

/**
 * Per-layer state for the composite Review section. Adds a fourth `hidden`
 * kind so non-review phases (e.g., `proposal_*`, `spec_*`) can suppress the
 * digest layer entirely without colliding with `placeholder` (which is
 * reserved for active review-family phases that have no ledger yet).
 */
export type ReviewLayerState<T> =
	| { readonly kind: "ok"; readonly value: T }
	| { readonly kind: "placeholder"; readonly message: string }
	| { readonly kind: "warning"; readonly message: string }
	| { readonly kind: "hidden" };

/** Discriminated state for the latest-round narrative summary. */
export type SummaryState =
	| { readonly kind: "available"; readonly text: string }
	| { readonly kind: "absent" };

/** Compact, three-tier severity bucket displayed in the digest. */
export type DigestSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface DigestFinding {
	readonly severity: DigestSeverity;
	readonly title: string;
	readonly id: string;
}

/** Ledger-backed digest sub-model rendered below the snapshot progress lines. */
export interface LedgerDigest {
	readonly family: ReviewLedgerFamily;
	/** Latest decision verbatim, or "(none)" when unavailable. */
	readonly decision: string;
	readonly counts: {
		readonly total: number;
		readonly open: number;
		readonly new_count: number;
		readonly resolved: number;
	};
	/** Severity counts over **open** findings only. `critical` aggregates into HIGH. */
	readonly openSeverity: {
		readonly high: number;
		readonly medium: number;
		readonly low: number;
	};
	readonly summaryState: SummaryState;
	/** Up to three open findings ranked per the design's tie-break rule. */
	readonly topOpen: readonly DigestFinding[];
}

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
	/**
	 * Independent ledger-digest layer rendered below the snapshot progress lines
	 * inside the same Review section. `hidden` for non-review phases.
	 */
	readonly digest: ReviewLayerState<LedgerDigest>;
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

// ---------------------------------------------------------------------------
// Ledger digest model — derived exclusively from the latest persisted ledger
// state. The digest is self-sufficient; no external summary files are read.
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = {
	critical: 0,
	high: 0,
	medium: 1,
	low: 2,
};

function severityRank(s: string | undefined): number {
	if (s === undefined) return 0; // unknown → top tier
	const key = s.toLowerCase();
	const rank = SEVERITY_RANK[key];
	return rank === undefined ? 0 : rank;
}

function digestSeverityFor(s: string | undefined): DigestSeverity {
	if (s === undefined) return "HIGH";
	const key = s.toLowerCase();
	if (key === "medium") return "MEDIUM";
	if (key === "low") return "LOW";
	// "critical", "high", and any unknown severity all display as HIGH per D6.
	return "HIGH";
}

function isOpen(f: ReviewFinding): boolean {
	const s = f.status;
	return s === "open" || s === "new";
}

/**
 * Rank open findings by severity (HIGH/CRITICAL > MEDIUM > LOW), then
 * `latest_round` DESC, then finding `id` ASC. Pure — caller takes a slice.
 */
export function rankOpenFindings(
	findings: readonly ReviewFinding[],
): readonly ReviewFinding[] {
	return [...findings].filter(isOpen).sort((a, b) => {
		const sa = severityRank(a.severity);
		const sb = severityRank(b.severity);
		if (sa !== sb) return sa - sb;
		const ra = a.latest_round ?? 0;
		const rb = b.latest_round ?? 0;
		if (ra !== rb) return rb - ra;
		const ia = a.id ?? "";
		const ib = b.id ?? "";
		return ia.localeCompare(ib);
	});
}

/**
 * Build the latest-round narrative state for the digest.
 *
 * The persisted `LedgerRoundSummary` does not carry free-form summary text
 * (only counters and a decision token), and the watcher's read-only contract
 * forbids reading any other artifact — `review-result*.json` was rejected by
 * apply review as out-of-scope read-surface widening. With no compliant
 * persisted source for narrative text, the digest renders no `Latest summary:`
 * line. The spec explicitly allows this via "Latest round summary missing
 * elides the line." When persisted narrative text becomes available in a
 * future change (e.g. by extending `LedgerRoundSummary` with a free-form
 * `summary` field), this function can return `{ kind: "available" }`
 * instead.
 */
function buildSummaryState(
	_latestRound: import("../../types/contracts.js").LedgerRoundSummary,
): SummaryState {
	return { kind: "absent" };
}

function buildDigestFromLedger(
	ledger: ReviewLedger,
	family: ReviewLedgerFamily,
): LedgerDigest | null {
	const summaries = ledger.round_summaries;
	if (!Array.isArray(summaries) || summaries.length === 0) return null;
	const last = summaries[summaries.length - 1];

	const latestDecisionField =
		typeof ledger.latest_decision === "string" &&
		ledger.latest_decision.length > 0
			? ledger.latest_decision
			: null;
	const lastRoundDecisionField =
		typeof last.decision === "string" && last.decision.length > 0
			? last.decision
			: null;
	const decision = latestDecisionField ?? lastRoundDecisionField ?? "(none)";

	const counts = {
		total: last.total,
		open: last.open,
		new_count: last.new,
		resolved: last.resolved,
	};

	const openFindings = ledger.findings.filter(isOpen);
	let high = 0;
	let medium = 0;
	let low = 0;
	for (const f of openFindings) {
		const tier = digestSeverityFor(f.severity);
		if (tier === "HIGH") high++;
		else if (tier === "MEDIUM") medium++;
		else low++;
	}

	const ranked = rankOpenFindings(ledger.findings);
	const topOpen: DigestFinding[] = ranked.slice(0, 3).map((f) => ({
		severity: digestSeverityFor(f.severity),
		title: f.title ?? "",
		id: f.id ?? "",
	}));

	const summaryState = buildSummaryState(last);

	return {
		family,
		decision,
		counts,
		openSeverity: { high, medium, low },
		summaryState,
		topOpen,
	};
}

export interface BuildDigestStateInput {
	readonly activeFamily: ReviewLedgerFamily | null;
	readonly ledgerRead: ArtifactReadResult<ReviewLedger>;
}

/**
 * Build the digest layer state from the active family and the ledger reader
 * result. Returns `hidden` when the phase is outside review families,
 * `placeholder` when the ledger is absent or empty, `warning` for I/O or
 * schema problems, and `ok` with a populated `LedgerDigest` otherwise.
 *
 * The digest is sourced exclusively from the ledger — no external summary
 * files are consulted. The digest layer is independent from the snapshot
 * layer — a snapshot placeholder/warning never suppresses a digest, and
 * vice versa.
 */
export function buildDigestState(
	input: BuildDigestStateInput,
): ReviewLayerState<LedgerDigest> {
	const { activeFamily, ledgerRead } = input;
	if (activeFamily === null) return { kind: "hidden" };
	switch (ledgerRead.kind) {
		case "absent":
			return { kind: "placeholder", message: "No review digest yet" };
		case "unreadable":
			return {
				kind: "warning",
				message: `Review ledger unreadable: ${ledgerRead.reason}`,
			};
		case "malformed":
			return {
				kind: "warning",
				message: `Review ledger malformed: ${ledgerRead.reason}`,
			};
		case "ok": {
			const digest = buildDigestFromLedger(ledgerRead.value, activeFamily);
			if (digest === null) {
				return { kind: "placeholder", message: "No review digest yet" };
			}
			return { kind: "ok", value: digest };
		}
	}
}
