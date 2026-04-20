// Capability → spec-file resolution.
//
// D6: each `cap` in `bundle.owner_capabilities` is resolved to
//   (baseline?)  openspec/specs/<cap>/spec.md
//   (delta?)     openspec/changes/<CHANGE_ID>/specs/<cap>/spec.md
// At least one of the two SHALL exist. If both are missing, the dispatcher
// fails fast before dispatching any subagent in the window (`preflightWindow`).

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { CapabilitySpecs } from "./types.js";

export interface ResolvedCapability {
	readonly kind: "ok";
	readonly specs: CapabilitySpecs;
}

export interface UnresolvedCapability {
	readonly kind: "missing";
	readonly capability: string;
	readonly baselinePath: string;
	readonly deltaPath: string;
}

export type CapabilityResolution = ResolvedCapability | UnresolvedCapability;

export class UnsafeCapabilityNameError extends Error {
	readonly capability: string;
	constructor(capability: string) {
		super(
			`Capability name '${capability}' is unsafe: must not contain path separators or '..' segments, ` +
				`and must not be empty. Reject at preflight before dispatching any subagent.`,
		);
		this.name = "UnsafeCapabilityNameError";
		this.capability = capability;
	}
}

// R3-F05 defence: capability names resolve to `openspec/specs/<cap>/spec.md`
// and `openspec/changes/<changeId>/specs/<cap>/spec.md`. A malformed graph
// could set `owner_capabilities: ["../../etc/passwd"]` and try to read
// arbitrary files. Constrain the capability identifier to a safe shape AND
// verify the resolved absolute path stays under `repoRoot`.
const SAFE_IDENT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function assertSafeCapability(capability: string): void {
	if (!SAFE_IDENT_RE.test(capability)) {
		throw new UnsafeCapabilityNameError(capability);
	}
}

function assertInsideRepo(
	absolute: string,
	repoRoot: string,
	capability: string,
): void {
	const root = resolve(repoRoot);
	const abs = resolve(absolute);
	if (abs !== root && !abs.startsWith(root + sep)) {
		throw new UnsafeCapabilityNameError(capability);
	}
}

/**
 * Symlink defence: if `absolute` exists, resolve the realpath of both the
 * target and the repo root and assert the target stays inside the repo.
 * Catches the case where a symlinked spec file points outside the repository.
 */
function assertRealpathInsideRepo(
	absolute: string,
	repoRoot: string,
	capability: string,
): void {
	if (!existsSync(absolute)) return;
	try {
		const realAbs = realpathSync(absolute);
		const realRoot = realpathSync(resolve(repoRoot));
		if (realAbs !== realRoot && !realAbs.startsWith(realRoot + sep)) {
			throw new UnsafeCapabilityNameError(capability);
		}
	} catch (err) {
		if (err instanceof UnsafeCapabilityNameError) throw err;
		throw new UnsafeCapabilityNameError(capability);
	}
}

export function resolveCapability(
	capability: string,
	changeId: string,
	repoRoot: string,
): CapabilityResolution {
	assertSafeCapability(capability);
	const baselinePath = join(repoRoot, "openspec/specs", capability, "spec.md");
	const deltaPath = join(
		repoRoot,
		"openspec/changes",
		changeId,
		"specs",
		capability,
		"spec.md",
	);
	// Defence in depth: even with a syntactically safe identifier, assert the
	// resolved absolute paths stay inside the repository. ALSO follow symlinks
	// via realpath so a hostile symlink inside the repo cannot exfiltrate files.
	assertInsideRepo(baselinePath, repoRoot, capability);
	assertInsideRepo(deltaPath, repoRoot, capability);
	assertRealpathInsideRepo(baselinePath, repoRoot, capability);
	assertRealpathInsideRepo(deltaPath, repoRoot, capability);
	const baselineExists = existsSync(baselinePath);
	const deltaExists = existsSync(deltaPath);
	if (!baselineExists && !deltaExists) {
		return {
			kind: "missing",
			capability,
			baselinePath,
			deltaPath,
		};
	}
	const specs: CapabilitySpecs = {
		capability,
		...(baselineExists ? { baseline: readFileSync(baselinePath, "utf8") } : {}),
		...(deltaExists ? { delta: readFileSync(deltaPath, "utf8") } : {}),
	};
	return { kind: "ok", specs };
}
