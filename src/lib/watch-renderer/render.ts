// ANSI frame renderer for `specflow-watch`. Takes a `WatchModel` and produces
// an array of visible lines (no raw ANSI clear-screen; the CLI adapter owns
// alt-screen entry/exit and cursor positioning). Each frame is produced
// deterministically from the model so snapshot tests remain stable.

import type { TaskStatus } from "../task-planner/index.js";
import {
	BOLD,
	color,
	DIM,
	FG_CYAN,
	FG_GREEN,
	FG_MAGENTA,
	FG_RED,
	FG_YELLOW,
	padEndVisible,
	stripAnsi,
	truncateVisible,
} from "./ansi.js";
import type {
	BundleTaskView,
	BundleView,
	LedgerDigest,
	ReviewLayerState,
	SectionState,
	WatchModel,
	WatchModelHeader,
} from "./model.js";

/** Clamp helper for progress-bar width. */
function clamp(n: number, lo: number, hi: number): number {
	if (n < lo) return lo;
	if (n > hi) return hi;
	return n;
}

function bar(done: number, total: number, width: number): string {
	const w = clamp(width, 4, 64);
	if (total <= 0) {
		return `[${"─".repeat(w)}]`;
	}
	const filled = Math.min(w, Math.round((done / total) * w));
	return `[${"█".repeat(filled)}${"─".repeat(w - filled)}]`;
}

function statusColor(status: string): (s: string) => string {
	switch (status) {
		case "done":
			return (s) => color(s, FG_GREEN);
		case "in_progress":
			return (s) => color(s, FG_CYAN);
		case "skipped":
			return (s) => color(s, DIM);
		default:
			return (s) => s;
	}
}

function manualFixBadgeOrEmpty(
	kind: WatchModelHeader["manual_fix_kind"],
): string {
	if (kind === "idle") return "";
	return ` ${color("(manual fix)", FG_YELLOW, BOLD)}`;
}

function renderHeader(h: WatchModelHeader, cols: number): string[] {
	const title = color("specflow watch", BOLD);
	const runLine = `${title}  ${color(h.run_id, FG_CYAN)}`;
	const meta = [
		`change: ${h.change_name ?? "(none)"}`,
		`phase: ${h.current_phase}${manualFixBadgeOrEmpty(h.manual_fix_kind)}`,
		`status: ${statusBadge(h.status)}`,
		`branch: ${h.branch}`,
	].join("  ");
	return [
		padEndVisible(truncateVisible(runLine, cols), cols),
		padEndVisible(truncateVisible(meta, cols), cols),
	];
}

function statusBadge(status: string): string {
	switch (status) {
		case "active":
			return color("active", FG_GREEN);
		case "terminal":
			return color("terminal", FG_MAGENTA);
		case "suspended":
			return color("suspended", FG_YELLOW);
		default:
			return color(status, DIM);
	}
}

function renderSection(
	title: string,
	body: readonly string[],
	cols: number,
): string[] {
	const head = color(`── ${title} `, BOLD);
	const rule = "─".repeat(Math.max(0, cols - visibleLen(head)));
	const headLine = padEndVisible(
		truncateVisible(`${head}${color(rule, DIM)}`, cols),
		cols,
	);
	const out: string[] = [headLine];
	for (const line of body) {
		out.push(padEndVisible(truncateVisible(line, cols), cols));
	}
	return out;
}

function visibleLen(s: string): number {
	// Reuse the shared stripper rather than re-declaring the control-char regex.
	return stripAnsi(s).length;
}

function renderPlaceholder(message: string): string[] {
	return [color(message, DIM)];
}

function renderWarning(message: string): string[] {
	return [color(`⚠ ${message}`, FG_RED)];
}

function renderSectionState<T>(
	state: SectionState<T>,
	ok: (value: T) => readonly string[],
): readonly string[] {
	if (state.kind === "ok") return ok(state.value);
	if (state.kind === "placeholder") return renderPlaceholder(state.message);
	return renderWarning(state.message);
}

function visibilityBadge(
	visibility: "live" | "completed",
	loop_state: string,
): string {
	if (visibility === "live") {
		return color("live", FG_GREEN, BOLD);
	}
	const suffix = loop_state ? ` — ${loop_state}` : "";
	return color(`completed${suffix}`, DIM);
}

function renderReviewSection(
	state: SectionState<
		NonNullable<WatchModel["review"] & { kind: "ok" }>["value"]
	>,
	_cols: number,
): readonly string[] {
	return renderSectionState(state, (r) => {
		const lines: string[] = [];
		if (r.has_snapshot) {
			const badge = visibilityBadge(r.visibility, r.loop_state);
			const parts = [
				`Round ${color(`${r.round_index}/${r.max_rounds}`, BOLD)}`,
				badge,
				`loop_state=${r.loop_state}`,
				`unresolved HIGH=${r.unresolved_high}`,
				`CRITICAL=${r.unresolved_critical}`,
				`MEDIUM=${r.unresolved_medium}`,
			];
			lines.push(parts.join("  "));
		}
		if (r.manual_fix.active) {
			const countSuffix =
				r.manual_fix.count === null
					? "? unresolved"
					: `${r.manual_fix.count} unresolved findings`;
			lines.push(color(`Manual fix in progress — ${countSuffix}`, FG_YELLOW));
		}
		if (lines.length === 0) {
			lines.push(color("No active review", DIM));
		}
		return lines;
	});
}

const NARROW_TERMINAL_THRESHOLD = 80;

function ellipsizeForCols(text: string, cols: number): string {
	if (cols <= 0) return "";
	if (visibleLen(text) <= cols) return text;
	if (cols === 1) return "…";
	return `${truncateVisible(text, cols - 1)}…`;
}

function applyNarrowTerminalRule(
	lines: readonly string[],
	cols: number,
): readonly string[] {
	if (cols >= NARROW_TERMINAL_THRESHOLD) return lines;
	return lines.map((line) => ellipsizeForCols(line, cols));
}

function renderDigestBody(d: LedgerDigest, cols: number): readonly string[] {
	const lines: string[] = [];
	lines.push(`Decision: ${d.decision}`);
	lines.push(
		`Findings: ${d.counts.total} total | ${d.counts.open} open | ${d.counts.new_count} new | ${d.counts.resolved} resolved`,
	);
	lines.push(
		`Severity: HIGH ${d.openSeverity.high} | MEDIUM ${d.openSeverity.medium} | LOW ${d.openSeverity.low}`,
	);
	const summary = d.summaryState;
	if (summary.kind === "available") {
		lines.push(`Latest summary: ${summary.text}`);
	}
	// Narrow-terminal rule: drop the open-findings list and ellipsize the
	// decision/counts/severity/summary lines. Wide terminals render in full.
	if (cols < NARROW_TERMINAL_THRESHOLD) {
		return applyNarrowTerminalRule(lines, cols);
	}
	if (d.topOpen.length > 0) {
		lines.push("Open findings:");
		for (const f of d.topOpen) {
			const sevColor =
				f.severity === "HIGH"
					? FG_RED
					: f.severity === "MEDIUM"
						? FG_YELLOW
						: DIM;
			lines.push(`  ${color(f.severity, sevColor)}  ${f.title}`);
		}
	}
	return lines;
}

function renderDigestSection(
	state: ReviewLayerState<LedgerDigest>,
	cols: number,
): readonly string[] {
	switch (state.kind) {
		case "hidden":
			return [];
		case "placeholder":
			return [color(state.message, DIM)];
		case "warning":
			return [color(`⚠ ${state.message}`, FG_RED)];
		case "ok":
			return renderDigestBody(state.value, cols);
	}
}

function renderTaskGraphSection(
	state: WatchModel["task_graph"],
	cols: number,
): readonly string[] {
	return renderSectionState(state, (g) => {
		const lines: string[] = [];
		lines.push(
			`Bundles: ${color(`${g.bundles_done}/${g.bundles_total} done`, BOLD)}`,
		);
		const labelWidth = computeLabelWidth(g.bundles, cols);
		for (const b of g.bundles) {
			lines.push(renderBundleRow(b, labelWidth, cols));
			for (const [i, t] of b.tasks.entries()) {
				const last = i === b.tasks.length - 1;
				lines.push(renderChildTaskRow(t, last, cols));
			}
		}
		return lines;
	});
}

function renderBundleRow(
	b: BundleView,
	labelWidth: number,
	cols: number,
): string {
	const label = padEndVisible(truncateVisible(b.title, labelWidth), labelWidth);
	const barWidth = clamp(cols - labelWidth - 16, 10, 30);
	const progress = bar(b.tasks_done, b.tasks_total, barWidth);
	const count = `${b.tasks_done}/${b.tasks_total}`;
	const status = statusColor(b.status)(`(${b.status})`);
	return `${label}  ${progress} ${count}  ${status}`;
}

/**
 * Status glyph mapping per design D4 / spec delta:
 *   done → `[✓]`, in_progress → `[◐]`, pending → `[ ]`, skipped → `[·]`.
 * `display_status` already accounts for bundle-done override.
 */
function taskStatusGlyph(status: TaskStatus): string {
	switch (status) {
		case "done":
			return color("[✓]", FG_GREEN);
		case "in_progress":
			return color("[◐]", FG_CYAN);
		case "skipped":
			return color("[·]", DIM);
		case "pending":
			return "[ ]";
	}
}

function renderChildTaskRow(
	t: BundleTaskView,
	last: boolean,
	cols: number,
): string {
	const glyph = last ? "└─" : "├─";
	const indent = "  ";
	const prefix = `${indent}${glyph} ${taskStatusGlyph(t.display_status)} ${t.id}.`;
	const prefixWidth = visibleLen(prefix);
	const remaining = Math.max(1, cols - prefixWidth - 1);
	const title = truncateVisible(t.title, remaining);
	return `${prefix} ${title}`;
}

function computeLabelWidth(
	bundles: readonly BundleView[],
	cols: number,
): number {
	let max = 0;
	for (const b of bundles) {
		if (b.title.length > max) max = b.title.length;
	}
	return clamp(Math.min(max, 32), 10, Math.max(10, cols - 30));
}

function renderEventsSection(
	state: WatchModel["events"],
	cols: number,
): readonly string[] {
	return renderSectionState(state, (events) => {
		const lines: string[] = [];
		for (const ev of events) {
			const ts = ev.timestamp ? color(ev.timestamp, DIM) : "";
			const kind = color(ev.kind, FG_CYAN);
			const summary = ev.summary ? `  ${ev.summary}` : "";
			lines.push(`${ts} ${kind}${summary}`.trimStart());
		}
		return lines;
	});
}

function renderApprovalSection(
	state: WatchModel["approval_summary"],
	_cols: number,
): readonly string[] {
	return renderSectionState(state, (v) => {
		const lines: string[] = [];
		if (v.status_line !== null) lines.push(v.status_line);
		if (v.diffstat_line !== null) lines.push(color(v.diffstat_line, DIM));
		return lines;
	});
}

/**
 * Render a full frame. Returns an array of padded lines (already truncated /
 * padded to `cols` so the CLI adapter can position them verbatim). The
 * adapter is responsible for screen clear / absolute cursor moves.
 */
export function renderFrame(
	model: WatchModel,
	cols: number,
	_rows: number,
): readonly string[] {
	const c = clamp(cols, 40, 500);
	const lines: string[] = [];
	lines.push(...renderHeader(model.header, c));
	if (model.terminal_banner !== null) {
		lines.push(padEndVisible("", c));
		lines.push(
			padEndVisible(
				truncateVisible(color(model.terminal_banner, FG_YELLOW, BOLD), c),
				c,
			),
		);
	}
	lines.push(padEndVisible("", c));
	const reviewBody = renderReviewSection(model.review, c);
	const digestBody = renderDigestSection(model.digest, c);
	const combined =
		digestBody.length === 0 ? reviewBody : [...reviewBody, ...digestBody];
	lines.push(...renderSection("Review round", combined, c));
	lines.push(padEndVisible("", c));
	lines.push(
		...renderSection(
			"Task graph",
			renderTaskGraphSection(model.task_graph, c),
			c,
		),
	);
	lines.push(padEndVisible("", c));
	lines.push(
		...renderSection("Recent events", renderEventsSection(model.events, c), c),
	);
	lines.push(padEndVisible("", c));
	lines.push(
		...renderSection(
			"Approval summary",
			renderApprovalSection(model.approval_summary, c),
			c,
		),
	);
	return lines;
}
