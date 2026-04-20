// ANSI frame renderer for `specflow-watch`. Takes a `WatchModel` and produces
// an array of visible lines (no raw ANSI clear-screen; the CLI adapter owns
// alt-screen entry/exit and cursor positioning). Each frame is produced
// deterministically from the model so snapshot tests remain stable.

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
	BundleView,
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

function renderHeader(h: WatchModelHeader, cols: number): string[] {
	const title = color("specflow watch", BOLD);
	const runLine = `${title}  ${color(h.run_id, FG_CYAN)}`;
	const meta = [
		`change: ${h.change_name ?? "(none)"}`,
		`phase: ${h.current_phase}`,
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

function renderReviewSection(
	state: SectionState<
		NonNullable<WatchModel["review"] & { kind: "ok" }>["value"]
	>,
	cols: number,
): readonly string[] {
	return renderSectionState(state, (r) => {
		const parts = [
			`Round ${color(`${r.round_index}/${r.max_rounds}`, BOLD)}`,
			`loop_state=${r.loop_state}`,
			`unresolved HIGH=${r.unresolved_high}`,
			`CRITICAL=${r.unresolved_critical}`,
			`MEDIUM=${r.unresolved_medium}`,
		];
		return [parts.join("  ")];
	});
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
	lines.push(
		...renderSection("Review round", renderReviewSection(model.review, c), c),
	);
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
	return lines;
}
