// Context-package assembly and window-wide preflight.
//
// `assembleContextPackage` (D5) produces the closed six-category payload handed
// to a subagent:
//   1. full proposal.md
//   2. full design.md
//   3. per-capability baseline and/or delta specs
//   4. bundle slice of task-graph.json (bundle + direct dep outputs)
//   5. rendered section of tasks.md for this bundle
//   6. contents of the bundle's declared input artifacts
//
// `preflightWindow` (review P1) walks every bundle in a subagent-dispatched
// window BEFORE any `specflow-advance-bundle` transition or subagent spawn,
// and fails fast if any capability is unresolvable. This prevents the dispatch
// protocol from leaving early siblings in `in_progress` when a later bundle has
// a missing capability.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Bundle, TaskGraph } from "../task-planner/types.js";
import { resolveCapability } from "./capability-resolution.js";
import type {
	BundleSlice,
	CapabilitySpecs,
	ContextPackage,
	ContextPackageInput,
} from "./types.js";

/**
 * R3-F05 defence: subagent context must never read files outside the repo,
 * even when the task graph is malformed or hostile. Any `inputs` reference
 * whose normalized absolute path escapes `repoRoot` is a fail-fast contract
 * violation — the dispatcher aborts before dispatching any subagent in the
 * current window (same recovery surface as a missing capability).
 */
export class UnsafePathError extends Error {
	readonly bundleId: string;
	readonly reference: string;
	readonly resolvedPath: string;
	constructor(bundleId: string, reference: string, resolvedPath: string) {
		super(
			`Bundle '${bundleId}' references '${reference}', which resolves to '${resolvedPath}' — outside the repository root. ` +
				`Inputs SHALL be repo-relative and SHALL NOT escape the repo. The apply SHALL NOT dispatch any subagent in the current window.`,
		);
		this.name = "UnsafePathError";
		this.bundleId = bundleId;
		this.reference = reference;
		this.resolvedPath = resolvedPath;
	}
}

/**
 * Resolve `ref` against `repoRoot` and confirm the result is inside `repoRoot`.
 * Rejects `..` traversal, absolute paths that land outside the repo, AND
 * symbolic links that point outside the repo. The `repoRoot` itself is
 * accepted. Callers pass `bundleId` so the error surfaces the offending bundle.
 *
 * Symlink defence: when the file exists, resolve the full realpath of both
 * the target and the repoRoot and re-check containment. This catches the case
 * where a hostile task graph references an in-repo path whose realpath is
 * actually outside the repo (e.g., `node_modules/.cache → /etc/passwd`).
 */
function resolveRepoRelative(
	repoRoot: string,
	ref: string,
	bundleId: string,
): string {
	const absolute = resolve(repoRoot, ref);
	const root = resolve(repoRoot);
	// Lexical check: reject absolute-or-traversal refs that land outside repo.
	if (absolute !== root && !absolute.startsWith(root + sep)) {
		throw new UnsafePathError(bundleId, ref, absolute);
	}
	// Symlink check: only if the path exists. For a not-yet-existing input we
	// cannot realpath; the lexical check above is the only safeguard. A hostile
	// symlink can only reach a target that exists.
	if (existsSync(absolute)) {
		let realAbs: string;
		let realRoot: string;
		try {
			realAbs = realpathSync(absolute);
			realRoot = realpathSync(root);
		} catch {
			// If realpath itself fails (permission denied, race), refuse to read.
			throw new UnsafePathError(bundleId, ref, absolute);
		}
		if (realAbs !== realRoot && !realAbs.startsWith(realRoot + sep)) {
			throw new UnsafePathError(bundleId, ref, realAbs);
		}
	}
	return absolute;
}

export class MissingCapabilityError extends Error {
	readonly bundleId: string;
	readonly capability: string;
	readonly baselinePath: string;
	readonly deltaPath: string;
	constructor(
		bundleId: string,
		capability: string,
		baselinePath: string,
		deltaPath: string,
	) {
		super(
			`Bundle '${bundleId}' owner_capability '${capability}' resolves to ` +
				`neither a baseline spec (${baselinePath}) nor a spec-delta (${deltaPath}). ` +
				`At least one SHALL exist. The apply SHALL NOT dispatch any subagent in ` +
				`the current window — fix the task graph or create the missing spec.`,
		);
		this.name = "MissingCapabilityError";
		this.bundleId = bundleId;
		this.capability = capability;
		this.baselinePath = baselinePath;
		this.deltaPath = deltaPath;
	}
}

function changeRoot(repoRoot: string, changeId: string): string {
	return join(repoRoot, "openspec/changes", changeId);
}

function readFileOrEmpty(path: string): string {
	if (!existsSync(path)) return "";
	return readFileSync(path, "utf8");
}

function extractBundleSection(tasksMd: string, bundleIndex: number): string {
	// tasks.md is rendered as a series of `## <N>. <title>` sections. The
	// target bundle's section runs from its header (one-based `bundleIndex + 1`)
	// up to (but not including) the next `## ` header or EOF.
	const lines = tasksMd.split(/\r?\n/);
	const target = bundleIndex + 1;
	const headerRe = /^##\s+(\d+)\./;

	let start = -1;
	let end = lines.length;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i]!.match(headerRe);
		if (!m) continue;
		const n = Number(m[1]);
		if (n === target && start === -1) {
			start = i;
			continue;
		}
		if (start !== -1 && n !== target) {
			end = i;
			break;
		}
	}
	if (start === -1) return "";
	return lines.slice(start, end).join("\n").replace(/\s+$/, "\n");
}

function sliceBundle(taskGraph: TaskGraph, bundle: Bundle): BundleSlice {
	const dependency_outputs = bundle.depends_on.map((depId) => {
		const dep = taskGraph.bundles.find((b) => b.id === depId);
		return {
			bundleId: depId,
			outputs: dep ? Array.from(dep.outputs) : [],
		};
	});
	return { bundle, dependency_outputs };
}

function readBundleInputs(
	bundle: Bundle,
	repoRoot: string,
): readonly ContextPackageInput[] {
	return bundle.inputs.map((ref) => {
		// Artifact references are repo-relative. Missing files surface as empty
		// content rather than an error; the subagent still sees the reference so
		// it can decide how to react. Unlike owner_capabilities (which must map
		// to a spec), a missing input is not a hard failure — a bundle may list
		// a file that it is about to create.
		//
		// R3-F05: reject path traversal BEFORE touching the filesystem. A
		// malformed task graph with `../../etc/passwd` must fail fast rather
		// than silently read the file into the subagent payload.
		const abs = resolveRepoRelative(repoRoot, ref, bundle.id);
		const content = existsSync(abs) ? readFileSync(abs, "utf8") : "";
		return { path: ref, content };
	});
}

/**
 * Validate every bundle in the window can be context-packaged, without doing
 * any real IO beyond the capability preflight and input-path validation.
 * Throws `MissingCapabilityError` on the first unresolvable capability and
 * `UnsafePathError` on the first input reference that escapes the repo.
 * Callers SHALL invoke this before advancing any bundle to `in_progress`
 * or spawning any subagent.
 *
 * R3-F05: validates BOTH capabilities AND input paths so that no bundle is
 * ever advanced to `in_progress` when a later bundle has a malicious or
 * malformed path reference.
 */
export function preflightWindow(
	window: readonly Bundle[],
	changeId: string,
	repoRoot: string,
): void {
	for (const bundle of window) {
		for (const capability of bundle.owner_capabilities) {
			const resolution = resolveCapability(capability, changeId, repoRoot);
			if (resolution.kind === "missing") {
				throw new MissingCapabilityError(
					bundle.id,
					capability,
					resolution.baselinePath,
					resolution.deltaPath,
				);
			}
		}
		// R3-F05: reject input paths that escape the repo BEFORE any assembly
		// or mutation. resolveRepoRelative throws UnsafePathError on traversal
		// or absolute paths outside repoRoot.
		for (const ref of bundle.inputs) {
			resolveRepoRelative(repoRoot, ref, bundle.id);
		}
	}
}

/**
 * Build the closed six-category context package for `bundle`. Must be called
 * AFTER `preflightWindow` has succeeded for the containing window.
 */
export function assembleContextPackage(
	bundle: Bundle,
	changeId: string,
	taskGraph: TaskGraph,
	repoRoot: string,
): ContextPackage {
	const root = changeRoot(repoRoot, changeId);

	const proposal = readFileOrEmpty(join(root, "proposal.md"));
	const design = readFileOrEmpty(join(root, "design.md"));
	const tasksMd = readFileOrEmpty(join(root, "tasks.md"));

	const bundleIndex = taskGraph.bundles.findIndex((b) => b.id === bundle.id);
	const tasksSection = extractBundleSection(tasksMd, bundleIndex);

	const specs: CapabilitySpecs[] = [];
	for (const capability of bundle.owner_capabilities) {
		const resolution = resolveCapability(capability, changeId, repoRoot);
		if (resolution.kind === "missing") {
			// Defence in depth — preflight SHOULD have caught this.
			throw new MissingCapabilityError(
				bundle.id,
				capability,
				resolution.baselinePath,
				resolution.deltaPath,
			);
		}
		specs.push(resolution.specs);
	}

	return {
		bundleId: bundle.id,
		proposal,
		design,
		specs,
		bundleSlice: sliceBundle(taskGraph, bundle),
		tasksSection,
		inputs: readBundleInputs(bundle, repoRoot),
	};
}
