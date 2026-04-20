import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

// Compile-time import graph regression: `src/bin/specflow-watch.ts` MUST NOT
// transitively import any module that writes to run artifacts. The renderer
// is a pure read-only consumer; the spec delta enforces this invariant.

const repoRoot = resolve(process.cwd());
const entry = join(repoRoot, "src/bin/specflow-watch.ts");

// Denylist: importing any of these from specflow-watch would leak a write
// path (gate writers, run-state mutators, ledger writers). If a legitimate
// need to read from one of these modules arises, expose a read-only barrel
// export and import that instead.
const DENYLISTED_MODULES: readonly string[] = [
	"../lib/local-fs-gate-record-store.js",
	"../lib/local-fs-interaction-record-store.js",
	"../lib/local-fs-observation-event-publisher.js",
	"../lib/local-fs-run-artifact-store.js",
	"../lib/local-fs-change-artifact-store.js",
	"../lib/gate-runtime.js",
	"../lib/gate-mutation-bridge.js",
	"../lib/review-runtime.js",
	"../lib/run-store-ops.js",
	"../lib/workflow-machine.js",
];

// A denylist of write-surface APIs on shared modules that MUST NOT appear
// in any import/use position reachable from specflow-watch.ts.
const DENYLISTED_WRITE_APIS: readonly string[] = [
	"atomicWriteText",
	"writeText",
	"specflow-run advance",
	"gate-runtime",
];

function collectImports(filePath: string): readonly string[] {
	const src = readFileSync(filePath, "utf8");
	const matches = src.matchAll(/from\s+"([^"]+)"/g);
	const out: string[] = [];
	for (const m of matches) out.push(m[1]);
	return out;
}

test("specflow-watch entrypoint does not import any denylisted mutator module", () => {
	const imports = collectImports(entry);
	for (const deny of DENYLISTED_MODULES) {
		assert.equal(
			imports.includes(deny),
			false,
			`specflow-watch.ts must not import ${deny}`,
		);
	}
});

test("specflow-watch entrypoint does not name any denylisted write API", () => {
	const src = readFileSync(entry, "utf8");
	for (const api of DENYLISTED_WRITE_APIS) {
		assert.equal(
			src.includes(api),
			false,
			`specflow-watch.ts must not reference ${api}`,
		);
	}
});

test("specflow-watch helper modules avoid run-artifact mutators", () => {
	const helperFiles = [
		join(repoRoot, "src/lib/specflow-watch/artifact-readers.ts"),
		join(repoRoot, "src/lib/specflow-watch/run-resolution.ts"),
		join(repoRoot, "src/lib/specflow-watch/run-scan.ts"),
		join(repoRoot, "src/lib/observation-event-reader.ts"),
		join(repoRoot, "src/lib/watch-fs.ts"),
	];
	for (const f of helperFiles) {
		const src = readFileSync(f, "utf8");
		assert.equal(
			/\batomicWriteText\b/.test(src),
			false,
			`${f} must not use atomicWriteText`,
		);
		assert.equal(
			/\bwriteFileSync\b/.test(src),
			false,
			`${f} must not use writeFileSync`,
		);
		assert.equal(
			/\brenameSync\b/.test(src),
			false,
			`${f} must not use renameSync`,
		);
	}
});
