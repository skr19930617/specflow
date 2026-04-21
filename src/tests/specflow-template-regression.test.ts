// Regression tests that pin the slash-command guide output so the TUI
// auto-launch bug from issue #180 cannot recur. The rendered
// `.claude/commands/specflow.md` and `.claude/commands/specflow.watch.md`
// MUST (a) invoke `specflow-launch-watch`, (b) contain NO `launch_watch`
// function definition, (c) contain no fenced `bash`/`sh` references to
// `$1`..`$9` or `$ARGUMENTS`, and (d) preserve the `SPECFLOW_NO_WATCH`
// skip branch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, "..", "..");
const renderedRoot = join(projectRoot, "dist", "package", "global", "commands");
const renderedSpecflow = join(renderedRoot, "specflow.md");
const renderedSpecflowWatch = join(renderedRoot, "specflow.watch.md");

/**
 * Returns the list of 1-based line numbers that match `regex` inside any
 * fenced ` ``` bash ` or ` ``` sh ` block in `content`. Identical logic to
 * the build-time lint; duplicated here so regression failures point at
 * the rendered output rather than the source template.
 */
function bashFenceMatches(content: string, regex: RegExp): number[] {
	const lines = content.split("\n");
	let inForbidden = false;
	const hits: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		const fence = /^(\s*)```(\S*)\s*$/.exec(lines[i]);
		if (fence !== null) {
			if (inForbidden) {
				inForbidden = false;
			} else {
				const lang = fence[2].trim().toLowerCase();
				inForbidden = lang === "bash" || lang === "sh";
			}
			continue;
		}
		if (!inForbidden) continue;
		const local = new RegExp(regex.source, regex.flags.replace("g", ""));
		if (local.test(lines[i])) hits.push(i + 1);
	}
	return hits;
}

test("regression: rendered specflow.md invokes specflow-launch-watch", () => {
	const content = readFileSync(renderedSpecflow, "utf8");
	assert.match(
		content,
		/specflow-launch-watch "\$RUN_ID"/,
		'expected `specflow-launch-watch "$RUN_ID"` invocation in Step 3',
	);
});

test("regression: rendered specflow.watch.md invokes specflow-launch-watch", () => {
	const content = readFileSync(renderedSpecflowWatch, "utf8");
	assert.match(
		content,
		/specflow-launch-watch "\$WATCH_TARGET"/,
		'expected `specflow-launch-watch "$WATCH_TARGET"` invocation in Step 2',
	);
});

test("regression: rendered specflow.md does not define launch_watch function", () => {
	const content = readFileSync(renderedSpecflow, "utf8");
	assert.doesNotMatch(
		content,
		/launch_watch\s*\(\)\s*\{/,
		"rendered specflow.md must not contain an inline `launch_watch()` function definition",
	);
});

test("regression: rendered specflow.watch.md does not define launch_watch function", () => {
	const content = readFileSync(renderedSpecflowWatch, "utf8");
	assert.doesNotMatch(
		content,
		/launch_watch\s*\(\)\s*\{/,
		"rendered specflow.watch.md must not contain an inline `launch_watch()` function definition",
	);
});

test("regression: rendered specflow.md has no $N / $ARGUMENTS in bash/sh fences", () => {
	const content = readFileSync(renderedSpecflow, "utf8");
	const hits = bashFenceMatches(
		content,
		/(?<!\\)\$[0-9]\b|(?<!\\)\$ARGUMENTS\b/g,
	);
	assert.deepEqual(
		hits,
		[],
		`rendered specflow.md contains forbidden positional-arg placeholders inside bash/sh fences at lines ${hits.join(", ")}`,
	);
});

test("regression: rendered specflow.watch.md has no $N / $ARGUMENTS in bash/sh fences", () => {
	const content = readFileSync(renderedSpecflowWatch, "utf8");
	const hits = bashFenceMatches(
		content,
		/(?<!\\)\$[0-9]\b|(?<!\\)\$ARGUMENTS\b/g,
	);
	assert.deepEqual(
		hits,
		[],
		`rendered specflow.watch.md contains forbidden positional-arg placeholders inside bash/sh fences at lines ${hits.join(", ")}`,
	);
});

test("regression: rendered specflow.md preserves SPECFLOW_NO_WATCH skip path", () => {
	const content = readFileSync(renderedSpecflow, "utf8");
	assert.match(
		content,
		/SPECFLOW_NO_WATCH/,
		"expected SPECFLOW_NO_WATCH branch in Step 3 auto-launch",
	);
	assert.match(
		content,
		/WATCH_METHOD=skipped/,
		"expected `WATCH_METHOD=skipped` marker on SPECFLOW_NO_WATCH branch",
	);
});
