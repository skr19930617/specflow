// Compile-time + static-grep drift guard for the core / local adapter split.
//
// Part 1 (compile-time): asserts the CoreRunState / LocalRunState partition
// stays disjoint and exhaustive, asserts AdapterFields enforces disjointness
// with CoreRunState, and asserts every `*Deps` type in `src/core/types.ts`
// excludes store and workspace members.
//
// Part 2 (static grep at runtime): scans `src/core/**/*.ts` for banned
// imports and identifiers that would reintroduce local-adapter or I/O
// coupling into the pure core runtime. Test files live exclusively under
// `src/tests/` per repo convention, so the glob is limited to non-test
// production files.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { AdvanceDeps, WorkflowDefinition } from "../core/advance.js";
import type { AdapterFields, RunStateOf } from "../core/run-core.js";
import type {
	CoreRunState,
	LocalRunState,
	RunState,
} from "../types/contracts.js";

// --- Part 1a: Partition disjointness + exhaustiveness ---------------------

type AssertEqual<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

const _disjoint: AssertEqual<keyof CoreRunState & keyof LocalRunState, never> =
	true;

const _exhaustive: AssertEqual<
	keyof RunState,
	keyof CoreRunState | keyof LocalRunState
> = true;

void _disjoint;
void _exhaustive;

// --- Part 1b: AdapterFields type-level behavior --------------------------

// Colliding adapter resolves to `never`.
const _collides: AssertEqual<AdapterFields<{ run_id: string }>, never> = true;
void _collides;

// LocalRunState satisfies AdapterFields and resolves to itself.
const _localOk: AssertEqual<AdapterFields<LocalRunState>, LocalRunState> = true;
void _localOk;

// Custom disjoint adapter resolves to itself.
type CustomAdapter = { sessionId: string; dbConnId: number };
const _customOk: AssertEqual<
	AdapterFields<CustomAdapter>,
	CustomAdapter
> = true;
void _customOk;

// Non-object types are rejected (resolve to `never`).
const _primitive: AssertEqual<AdapterFields<string>, never> = true;
void _primitive;

// RunStateOf<LocalRunState> equals RunState.
const _roundtrip: AssertEqual<RunStateOf<LocalRunState>, RunState> = true;
void _roundtrip;

// --- Part 1c: *Deps types exclude store and workspace members ------------

// AdvanceDeps is the only surviving *Deps (holds just the pure
// WorkflowDefinition). Assert it has no store or workspace members.
type AdvanceDepsKeys = keyof AdvanceDeps;
const _advanceDepsNoStores: AssertEqual<
	AdvanceDepsKeys & ("runs" | "changes" | "records" | "workspace"),
	never
> = true;
void _advanceDepsNoStores;

// AdvanceDeps should only expose the `workflow` field today.
const _advanceDepsShape: AssertEqual<AdvanceDepsKeys, "workflow"> = true;
void _advanceDepsShape;

// WorkflowDefinition stays a pure data type — asserting its presence in the
// AdvanceDeps shape is enough.
type _WorkflowStillPure = WorkflowDefinition;

// --- Part 2: Static grep for banned imports and identifiers ---------------

const LOCAL_RUN_STATE_KEY_TOKENS = [
	"project_id:",
	"repo_name:",
	"repo_path:",
	"branch_name:",
	"worktree_path:",
	"base_commit:",
	"base_branch:",
	"cleanup_pending:",
	"last_summary_path:",
] as const;

const BANNED_IMPORT_SUBSTRINGS = [
	'from "../lib/workspace-context',
	'from "../lib/local-workspace-context',
] as const;

const BANNED_STORE_CALLS = [
	"deps.runs.read",
	"deps.runs.write",
	"deps.runs.exists",
	"deps.runs.list",
	"deps.changes.read",
	"deps.changes.exists",
	"deps.changes.write",
	"deps.changes.list",
	"deps.records.write",
	"deps.records.read",
	"deps.records.list",
	"deps.records.delete",
] as const;

const CORE_DIR = resolve(process.cwd(), "src/core");

function listCoreProductionFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = resolve(dir, entry);
		const info = statSync(full);
		if (info.isDirectory()) {
			out.push(...listCoreProductionFiles(full));
			continue;
		}
		if (!entry.endsWith(".ts")) continue;
		// Defense-in-depth: repo convention places tests under src/tests/, but
		// filter out any stray `.test.ts` / `.spec.ts` if they ever appear.
		if (entry.endsWith(".test.ts") || entry.endsWith(".spec.ts")) continue;
		out.push(full);
	}
	return out;
}

test("src/core/**/*.ts does not import WorkspaceContext", () => {
	for (const file of listCoreProductionFiles(CORE_DIR)) {
		const body = readFileSync(file, "utf8");
		for (const needle of BANNED_IMPORT_SUBSTRINGS) {
			assert.ok(
				!body.includes(needle),
				`${file} contains banned import substring '${needle}'. Core modules must not depend on workspace-context or any local adapter module.`,
			);
		}
	}
});

test("src/core/**/*.ts does not reference LocalRunState field names as object keys", () => {
	for (const file of listCoreProductionFiles(CORE_DIR)) {
		const body = readFileSync(file, "utf8");
		for (const token of LOCAL_RUN_STATE_KEY_TOKENS) {
			assert.ok(
				!body.includes(token),
				`${file} contains LocalRunState field token '${token}'. Core modules must not reference local-adapter field names — pass them through TAdapter instead.`,
			);
		}
	}
});

test("src/core/**/*.ts does not call deps.{runs,changes,records} store methods", () => {
	for (const file of listCoreProductionFiles(CORE_DIR)) {
		const body = readFileSync(file, "utf8");
		for (const call of BANNED_STORE_CALLS) {
			assert.ok(
				!body.includes(call),
				`${file} contains banned store call '${call}'. Core modules must not touch the artifact stores — move I/O to the wiring layer.`,
			);
		}
	}
});

test("src/core/**/*.ts does not reference RunStateCoreFields", () => {
	for (const file of listCoreProductionFiles(CORE_DIR)) {
		const body = readFileSync(file, "utf8");
		assert.ok(
			!body.includes("RunStateCoreFields"),
			`${file} references RunStateCoreFields. The alias was removed in favor of CoreRunState / RunState — update the import.`,
		);
	}
});
