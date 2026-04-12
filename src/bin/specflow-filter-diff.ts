import {
	createLocalWorkspaceContext,
	filterLocalWorkspaceDiff,
} from "../lib/local-workspace-context.js";
import { printSchemaJson } from "../lib/process.js";
import type { DiffSummary } from "../types/contracts.js";

const HELP_TEXT = `Usage: specflow-filter-diff [-- <pathspec>...]

Filter git diff output for Codex review by removing:
  - Completely deleted files (deleted file mode)
  - Rename-only files (similarity index 100%, no content change)
  - Files matching DIFF_EXCLUDE_PATTERNS globs

Output:
  stdout: Filtered diff text
  stderr: JSON summary (last line)

Environment variables:
  DIFF_EXCLUDE_PATTERNS  Colon-separated glob patterns to exclude
  DIFF_WARN_THRESHOLD    Line count threshold (used by caller, not this script)

Examples:
  specflow-filter-diff
  specflow-filter-diff -- . ':(exclude).specflow' ':(exclude).specify'
  DIFF_EXCLUDE_PATTERNS="*.lock:dist/**" specflow-filter-diff
`;

function printSummary(summary: DiffSummary): void {
	printSchemaJson("diff-summary", summary, { stream: "stderr", pretty: false });
}

function main(): void {
	const args = process.argv.slice(2);
	if (args[0] === "--help" || args[0] === "-h") {
		process.stdout.write(HELP_TEXT);
		process.exit(0);
	}

	let ctx: import("../lib/workspace-context.js").WorkspaceContext;
	try {
		ctx = createLocalWorkspaceContext();
	} catch (err) {
		const message = err instanceof Error ? err.message : "not a git repository";
		process.stderr.write(`Error: ${message}\n`);
		process.exit(1);
	}

	const result = filterLocalWorkspaceDiff(ctx.projectRoot(), {
		pathspecs: args,
	});

	if (result.summary === "empty") {
		printSummary({
			excluded: [],
			warnings: [...result.warnings],
			included_count: 0,
			excluded_count: 0,
			total_lines: 0,
		});
		process.exit(0);
	}

	if (result.diff) {
		process.stdout.write(result.diff);
	}

	printSummary(result.summary);
}

main();
