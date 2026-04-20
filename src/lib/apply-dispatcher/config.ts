// apply-dispatcher config — reads `apply.subagent_dispatch.*` from
// openspec/config.yaml with safe defaults, and exposes the guard that gates
// whether the dispatcher engages for a given change.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DispatchConfig {
	readonly enabled: boolean;
	readonly threshold: number;
	readonly maxConcurrency: number;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
	enabled: false,
	threshold: 5,
	maxConcurrency: 3,
};

const INT_MATCHER = /^-?\d+$/;

/**
 * Extract a `key: value` pair nested at `parentPath` inside a YAML document.
 * We don't pull in a YAML dependency; instead we reproduce the same
 * regex/line-scanning pattern used by `review-runtime.ts` for top-level keys,
 * extended to handle two levels of indented sections.
 *
 * Indentation is inferred from the first indented line under the parent section
 * (must be a consistent multiple of the initial indent).
 */
function readLeafUnder(
	content: string,
	parentPath: readonly string[],
	leafKey: string,
): string | null {
	const lines = content.split(/\r?\n/);
	let cursor = 0;
	let baseIndent = 0;
	// R3-F07: track the end of the enclosing section so deeper descent cannot
	// leak into an unrelated top-level key. For the very outer scan (no parent
	// yet) the bound is the end of the document.
	let sectionEnd = lines.length;

	for (const segment of parentPath) {
		// Find `segment:` at exactly `baseIndent` leading spaces, WITHIN the
		// current section only (do not cross `sectionEnd`).
		const headerPattern = new RegExp(
			`^${" ".repeat(baseIndent)}${segment}:\\s*(#.*)?$`,
		);
		let headerIdx = -1;
		for (let i = cursor; i < sectionEnd; i++) {
			if (headerPattern.test(lines[i]!)) {
				headerIdx = i;
				break;
			}
		}
		if (headerIdx === -1) return null;
		cursor = headerIdx + 1;

		// Compute the end of THIS segment's section: the first line at `cursor`
		// or later whose indent is ≤ baseIndent (i.e., a sibling or outer key).
		// Lines indented more than baseIndent belong to this section and bound
		// where we may search for deeper segments or leaves.
		const segmentEnd = (() => {
			for (let i = cursor; i < sectionEnd; i++) {
				const line = lines[i]!;
				if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
				const leading = line.match(/^ */)?.[0].length ?? 0;
				if (leading <= baseIndent) return i;
			}
			return sectionEnd;
		})();

		// Infer child indent from the first non-blank non-comment line inside
		// THIS segment's section.
		let childIndent = -1;
		for (let i = cursor; i < segmentEnd; i++) {
			const line = lines[i]!;
			if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
			const leading = line.match(/^ */)?.[0].length ?? 0;
			childIndent = leading;
			break;
		}
		if (childIndent === -1) return null;
		baseIndent = childIndent;
		sectionEnd = segmentEnd;
	}

	// Now look for the leaf key at baseIndent, within the current section only.
	const leafPattern = new RegExp(
		`^${" ".repeat(baseIndent)}${leafKey}:\\s*(.*?)\\s*(#.*)?$`,
	);

	for (let i = cursor; i < sectionEnd; i++) {
		const match = lines[i]!.match(leafPattern);
		if (match) {
			const value = match[1] ?? "";
			// Treat empty strings (bare `key:`) as absent so callers fall back.
			return value.length > 0 ? value : null;
		}
	}
	return null;
}

function parseBoolean(raw: string | null): boolean | null {
	if (raw === null) return null;
	const v = raw.toLowerCase();
	if (v === "true") return true;
	if (v === "false") return false;
	return null;
}

function parseNonNegativeInt(raw: string | null): number | null {
	if (raw === null || !INT_MATCHER.test(raw)) return null;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) return null;
	return n;
}

function parsePositiveInt(raw: string | null): number | null {
	const n = parseNonNegativeInt(raw);
	if (n === null || n < 1) return null;
	return n;
}

/**
 * Read `apply.subagent_dispatch.*` from `openspec/config.yaml`. All fields are
 * optional; missing / malformed values fall back to `DEFAULT_DISPATCH_CONFIG`
 * rather than throwing. This mirrors the policy used by `readReviewConfig` so
 * that operators are never blocked by a stale or partial config.
 */
export function readDispatchConfig(projectRoot: string): DispatchConfig {
	const configPath = resolve(projectRoot, "openspec/config.yaml");
	if (!existsSync(configPath)) {
		return DEFAULT_DISPATCH_CONFIG;
	}
	return parseDispatchConfig(readFileSync(configPath, "utf8"));
}

/** Pure parser for testing without filesystem access. */
export function parseDispatchConfig(content: string): DispatchConfig {
	const parentPath = ["apply", "subagent_dispatch"] as const;
	const enabled =
		parseBoolean(readLeafUnder(content, parentPath, "enabled")) ??
		DEFAULT_DISPATCH_CONFIG.enabled;
	const threshold =
		parseNonNegativeInt(readLeafUnder(content, parentPath, "threshold")) ??
		DEFAULT_DISPATCH_CONFIG.threshold;
	const maxConcurrency =
		parsePositiveInt(readLeafUnder(content, parentPath, "max_concurrency")) ??
		DEFAULT_DISPATCH_CONFIG.maxConcurrency;
	return { enabled, threshold, maxConcurrency };
}

/**
 * The dispatcher SHALL engage for a change only when both are true:
 *   1. `apply.subagent_dispatch.enabled` is `true`
 *   2. `task-graph.json` exists for the change (CLI-mandatory path)
 *
 * When either condition fails, `/specflow.apply` stays on its pre-feature
 * behavior: the CLI-mandatory path if the graph is present (main-agent inline
 * execution), or the legacy tasks.md fallback if the graph is absent.
 */
export function shouldUseDispatcher(
	config: DispatchConfig,
	taskGraphExists: boolean,
): boolean {
	return config.enabled && taskGraphExists;
}
