// Guardrail test: src/core/ must stay free of process I/O, filesystem
// access, and host-environment probes. Any file under src/core/ that
// imports a forbidden module (directly or via `import type`) breaks the
// "core runtime is callable without CLI or OS wiring" contract declared in
// `openspec/specs/workflow-run-state/spec.md`.
//
// If this test fails, either:
//   1. Move the offending logic into the CLI wiring layer
//      (`src/bin/specflow-run.ts`) or a store adapter under `src/lib/`; or
//   2. Extend an injected collaborator interface (WorkspaceContext,
//      ArtifactStore) to expose what the core actually needs.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const FORBIDDEN_IMPORTS = [
	"node:fs",
	"node:fs/promises",
	"node:child_process",
	"node:process",
	"node:path",
	"node:os",
] as const;

// Forbidden textual references inside src/core/. Comments inside the core
// files reference these names deliberately (to explain the rule), so we
// strip comments before scanning.
const FORBIDDEN_PROCESS_MEMBERS = [
	"process.argv",
	"process.exit",
	"process.stdout",
	"process.stderr",
	"process.env",
] as const;

function stripComments(source: string): string {
	// Remove /* ... */ block comments and // line comments.
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			walk(full, acc);
		} else if (stat.isFile() && entry.endsWith(".ts")) {
			acc.push(full);
		}
	}
	return acc;
}

test("src/core/ contains no forbidden Node.js module imports", () => {
	const coreDir = resolve(process.cwd(), "src/core");
	const files = walk(coreDir);
	assert.ok(files.length > 0, "src/core/ should contain TypeScript files");

	const violations: string[] = [];
	for (const file of files) {
		const source = stripComments(readFileSync(file, "utf8"));
		for (const mod of FORBIDDEN_IMPORTS) {
			// Match import "...", import X from "...", or from "..." in any form.
			const re = new RegExp(
				`from\\s+["']${mod.replace("/", "\\/")}["']|import\\s+["']${mod.replace("/", "\\/")}["']`,
			);
			if (re.test(source)) {
				violations.push(`${file}: imports ${mod}`);
			}
		}
	}
	assert.deepEqual(
		violations,
		[],
		`src/core/ files must not import filesystem/process/child_process:\n${violations.join("\n")}`,
	);
});

test("src/core/ contains no process.* side-effect accesses", () => {
	const coreDir = resolve(process.cwd(), "src/core");
	const files = walk(coreDir);
	const violations: string[] = [];
	for (const file of files) {
		const source = stripComments(readFileSync(file, "utf8"));
		for (const member of FORBIDDEN_PROCESS_MEMBERS) {
			if (source.includes(member)) {
				violations.push(`${file}: references ${member}`);
			}
		}
	}
	assert.deepEqual(
		violations,
		[],
		`src/core/ files must not touch process I/O:\n${violations.join("\n")}`,
	);
});

test("src/core/ does not import from src/bin/", () => {
	const coreDir = resolve(process.cwd(), "src/core");
	const files = walk(coreDir);
	const violations: string[] = [];
	for (const file of files) {
		const source = stripComments(readFileSync(file, "utf8"));
		if (/from\s+["'][^"']*\.\.\/bin\//.test(source)) {
			violations.push(file);
		}
	}
	assert.deepEqual(
		violations,
		[],
		`src/core/ must not import from src/bin/:\n${violations.join("\n")}`,
	);
});
