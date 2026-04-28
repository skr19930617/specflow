import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const CANONICAL_SHARED_POLICY_FILE = ".specflow/config.yaml";
export const LEGACY_SHARED_POLICY_FILE = "openspec/config.yaml";
export const LOCAL_RUNTIME_FILE = ".specflow/config.env";

const SHARED_POLICY_KEYS: readonly { path: readonly string[]; envName: string }[] =
	[
		{ path: ["apply", "subagent_dispatch", "enabled"], envName: "SPECFLOW_APPLY_SUBAGENT_DISPATCH_ENABLED" },
		{ path: ["apply", "subagent_dispatch", "threshold"], envName: "SPECFLOW_APPLY_SUBAGENT_DISPATCH_THRESHOLD" },
		{
			path: ["apply", "subagent_dispatch", "max_concurrency"],
			envName: "SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY",
		},
		{ path: ["diff_warn_threshold"], envName: "SPECFLOW_DIFF_WARN_THRESHOLD" },
		{ path: ["max_autofix_rounds"], envName: "SPECFLOW_MAX_AUTOFIX_ROUNDS" },
		{
			path: ["autofix_heartbeat_seconds"],
			envName: "SPECFLOW_AUTOFIX_HEARTBEAT_SECONDS",
		},
		{
			path: ["autofix_stale_threshold_seconds"],
			envName: "SPECFLOW_AUTOFIX_STALE_THRESHOLD_SECONDS",
		},
	];

const LOCAL_RUNTIME_ENV_KEYS: readonly string[] = [
	"SPECFLOW_MAIN_AGENT",
	"SPECFLOW_REVIEW_AGENT",
];

const BORDERLINE_OVERRIDE_KEYS: ReadonlySet<string> = new Set([
	"SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY",
]);

const emittedWarnings = new Set<string>();

export function _resetWarningCacheForTests(): void {
	emittedWarnings.clear();
}

function emitDeprecationWarning(message: string): void {
	if (emittedWarnings.has(message)) {
		return;
	}
	emittedWarnings.add(message);
	process.stderr.write(`Warning: ${message}\n`);
}

const INT_MATCHER = /^-?\d+$/;

export function parseBoolean(raw: string | null): boolean | null {
	if (raw === null) return null;
	const v = raw.toLowerCase();
	if (v === "true") return true;
	if (v === "false") return false;
	return null;
}

export function parseNonNegativeInt(raw: string | null): number | null {
	if (raw === null || !INT_MATCHER.test(raw)) return null;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) return null;
	return n;
}

export function parsePositiveInt(raw: string | null): number | null {
	const n = parseNonNegativeInt(raw);
	if (n === null || n < 1) return null;
	return n;
}

/**
 * Extract a `key: value` pair nested at `parentPath` inside a YAML document.
 * Indentation is inferred from the first indented line under the parent
 * section. Returns `null` if the key is absent or the value is empty.
 */
export function readLeafUnder(
	content: string,
	parentPath: readonly string[],
	leafKey: string,
): string | null {
	const lines = content.split(/\r?\n/);
	let cursor = 0;
	let baseIndent = 0;
	let sectionEnd = lines.length;

	for (const segment of parentPath) {
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

		const segmentEnd = (() => {
			for (let i = cursor; i < sectionEnd; i++) {
				const line = lines[i]!;
				if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
				const leading = line.match(/^ */)?.[0].length ?? 0;
				if (leading <= baseIndent) return i;
			}
			return sectionEnd;
		})();

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

	const leafPattern = new RegExp(
		`^${" ".repeat(baseIndent)}${leafKey}:\\s*(.*?)\\s*(#.*)?$`,
	);

	for (let i = cursor; i < sectionEnd; i++) {
		const match = lines[i]!.match(leafPattern);
		if (match) {
			const value = match[1] ?? "";
			return value.length > 0 ? value : null;
		}
	}
	return null;
}

/**
 * Read the canonical specflow shared-policy yaml file, returning its content
 * (empty string when absent). As a side effect, probes the legacy
 * `openspec/config.yaml` location for any specflow-owned key and the
 * canonical file for any local-runtime env key, emitting one-time
 * deprecation warnings per process for each misplaced key.
 *
 * Per `config-ownership-boundaries`: shared workflow policy lives in
 * `.specflow/config.yaml`; local runtime / operator preference lives in
 * `.specflow/config.env`. Specflow settings SHALL NOT live in
 * `openspec/config.yaml`.
 */
export function readSpecflowSharedConfig(projectRoot: string): string {
	const canonicalPath = resolve(projectRoot, CANONICAL_SHARED_POLICY_FILE);
	const legacyPath = resolve(projectRoot, LEGACY_SHARED_POLICY_FILE);

	const canonicalContent = existsSync(canonicalPath)
		? readFileSync(canonicalPath, "utf8")
		: "";
	const legacyContent = existsSync(legacyPath)
		? readFileSync(legacyPath, "utf8")
		: "";

	if (legacyContent.length > 0) {
		for (const { path } of SHARED_POLICY_KEYS) {
			const parent = path.slice(0, -1);
			const leaf = path[path.length - 1]!;
			const present = readLeafUnder(legacyContent, parent, leaf) !== null;
			if (present) {
				const human = path.join(".");
				emitDeprecationWarning(
					`specflow setting '${human}' was found in 'openspec/config.yaml'; this location is deprecated. Move it to '.specflow/config.yaml' (the canonical home for shared workflow policy).`,
				);
			}
		}
	}

	if (canonicalContent.length > 0) {
		for (const envKey of LOCAL_RUNTIME_ENV_KEYS) {
			const linePattern = new RegExp(`^\\s*${envKey}\\s*[:=]`, "m");
			if (linePattern.test(canonicalContent)) {
				emitDeprecationWarning(
					`specflow setting '${envKey}' looks like a local runtime / operator preference and was found in '.specflow/config.yaml'; this location is for shared workflow policy only. Move it to '.specflow/config.env'.`,
				);
			}
		}
	}

	return canonicalContent;
}

/**
 * Resolve an effective value for a setting that supports the borderline
 * shared→local override path. The shared default comes from yaml; an
 * operator MAY override via the corresponding `SPECFLOW_*` environment
 * variable populated by `loadConfigEnv` from `.specflow/config.env`.
 *
 * When `envName` is not in `BORDERLINE_OVERRIDE_KEYS`, the env var is
 * ignored — we do not silently allow override of every setting.
 *
 * Returns the env-var raw string when present and overridable; otherwise
 * returns `yamlValue`.
 */
export function applyBorderlineOverride(
	yamlValue: string | null,
	envName: string,
): string | null {
	if (!BORDERLINE_OVERRIDE_KEYS.has(envName)) {
		return yamlValue;
	}
	const fromEnv = process.env[envName];
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return fromEnv;
	}
	return yamlValue;
}

/** For tests: list overridable env names. */
export function _getBorderlineOverrideKeysForTests(): readonly string[] {
	return Array.from(BORDERLINE_OVERRIDE_KEYS);
}
