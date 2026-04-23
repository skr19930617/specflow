// Deterministic tasks.md rendering from TaskGraph.

import type { Bundle, TaskGraph } from "./types.js";

function statusIcon(status: string): string {
	switch (status) {
		case "done":
			return "x";
		case "in_progress":
			return "~";
		case "skipped":
			return "-";
		default:
			return " ";
	}
}

function bundleStatusLabel(status: string): string {
	switch (status) {
		case "done":
			return " ✓";
		case "in_progress":
			return " (in progress)";
		case "skipped":
			return " (skipped)";
		case "subagent_failed":
			return " ✗ (subagent failed — retained worktree)";
		case "integration_rejected":
			return " ⚠ (integration rejected — retained worktree)";
		default:
			return "";
	}
}

function renderBundle(bundle: Bundle, index: number): string {
	const lines: string[] = [];
	const num = index + 1;

	lines.push(`## ${num}. ${bundle.title}${bundleStatusLabel(bundle.status)}`);
	lines.push("");

	if (bundle.goal) {
		lines.push(`> ${bundle.goal}`);
		lines.push("");
	}

	if (bundle.depends_on.length > 0) {
		lines.push(`> Depends on: ${bundle.depends_on.join(", ")}`);
		lines.push("");
	}

	for (const task of bundle.tasks) {
		lines.push(
			`- [${statusIcon(task.status)}] ${num}.${task.id} ${task.title}`,
		);
	}

	return lines.join("\n");
}

export function renderTasksMd(taskGraph: TaskGraph): string {
	const sections = taskGraph.bundles.map((bundle, i) =>
		renderBundle(bundle, i),
	);
	return sections.join("\n\n") + "\n";
}
