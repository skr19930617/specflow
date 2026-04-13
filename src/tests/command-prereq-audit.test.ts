// NOTE: This audit reads generated markdown from `dist/package/global/commands/`.
// Those files are produced by `node dist/build.js`, which in turn requires a
// prior `tsc` compile. Use `npm test` or `npm run test:coverage` — both invoke
// `npm run build` before `node --test`. Running `node --test` directly against
// a stale or absent `dist/` will fail with "no generated specflow command
// markdown found" or missing-file errors.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { basename } from "node:path";
import test from "node:test";

const COMMANDS_GLOB = "dist/package/global/commands/specflow*.md";
const PROBE_LINE = "openspec list --json > /dev/null 2>&1";
const MISSING_CLI_HEADER = "❌ openspec CLI が見つかりません。";
const UNINITIALIZED_HEADER = "❌ OpenSpec が初期化されていません。";

// The eleven slash commands whose Prerequisites historically ran the
// `ls openspec/` OpenSpec-readiness probe. These must now all use the
// shared command-based probe. Commands with non-OpenSpec Prerequisites
// (e.g. specflow.license which probes for `specflow-analyze`) are
// intentionally excluded.
const OPENSPEC_PROBE_COMMANDS = [
	"specflow.md",
	"specflow.apply.md",
	"specflow.dashboard.md",
	"specflow.decompose.md",
	"specflow.design.md",
	"specflow.explore.md",
	"specflow.fix_apply.md",
	"specflow.fix_design.md",
	"specflow.review_apply.md",
	"specflow.review_design.md",
	"specflow.spec.md",
];

async function loadSpecflowCommands(): Promise<Array<[string, string]>> {
	const files: Array<[string, string]> = [];
	for await (const path of glob(COMMANDS_GLOB)) {
		const name = basename(path);
		files.push([name, readFileSync(path, "utf8")]);
	}
	assert.ok(files.length > 0, "no generated specflow command markdown found");
	return files;
}

function loadProbeCommand(name: string): string {
	return readFileSync(`dist/package/global/commands/${name}`, "utf8");
}

test("audit: every OpenSpec-probing command uses the command-based probe exactly once", () => {
	for (const name of OPENSPEC_PROBE_COMMANDS) {
		const body = loadProbeCommand(name);
		const matches = body.match(/openspec list --json > \/dev\/null 2>&1/g);
		assert.equal(
			matches?.length,
			1,
			`${name} must contain exactly one "${PROBE_LINE}" invocation (found ${matches?.length ?? 0})`,
		);
	}
});

test("audit: no generated command contains the legacy ls openspec/ probe", async () => {
	const files = await loadSpecflowCommands();
	for (const [name, body] of files) {
		assert.ok(
			!body.includes("ls openspec/"),
			`${name} still contains "ls openspec/" — migrate to openspec list --json probe`,
		);
	}
});

test("audit: no generated command advises hand-creating openspec/config.yaml", async () => {
	const files = await loadSpecflowCommands();
	for (const [name, body] of files) {
		assert.ok(
			!body.includes("openspec/config.yaml を作成"),
			`${name} still contains "openspec/config.yaml を作成" — remove hand-create guidance`,
		);
	}
});

test("audit: every OpenSpec-probing command documents both failure branches", () => {
	for (const name of OPENSPEC_PROBE_COMMANDS) {
		const body = loadProbeCommand(name);
		assert.ok(
			body.includes(MISSING_CLI_HEADER),
			`${name} Prerequisites must document the missing-CLI branch ("${MISSING_CLI_HEADER}")`,
		);
		assert.ok(
			body.includes(UNINITIALIZED_HEADER),
			`${name} Prerequisites must document the uninitialized-workspace branch ("${UNINITIALIZED_HEADER}")`,
		);
		assert.ok(
			body.includes("specflow-install"),
			`${name} Prerequisites must reference specflow-install as missing-CLI remediation`,
		);
		assert.ok(
			body.includes("specflow-init"),
			`${name} Prerequisites must reference specflow-init as uninitialized remediation`,
		);
	}
});

test("audit: specflow.decompose has exactly one Prerequisites heading and one probe", () => {
	const body = readFileSync(
		"dist/package/global/commands/specflow.decompose.md",
		"utf8",
	);
	const prereqHeadings = body.match(/^## Prerequisites\b/gm);
	assert.equal(
		prereqHeadings?.length,
		1,
		"specflow.decompose.md must have exactly one Prerequisites heading",
	);
	const probes = body.match(/openspec list --json > \/dev\/null 2>&1/g);
	assert.equal(
		probes?.length,
		1,
		"specflow.decompose.md must have exactly one probe invocation",
	);
});
