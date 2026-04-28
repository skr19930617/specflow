// apply-dispatcher config — reads `apply.subagent_dispatch.*` from
// `.specflow/config.yaml` (the canonical home for shared workflow policy,
// per `config-ownership-boundaries`) with safe defaults, and exposes the
// guard that gates whether the dispatcher engages for a given change.
//
// Specflow settings stored in the legacy `openspec/config.yaml` location
// are detected and ignored, with a one-time per-process deprecation
// warning emitted via `readSpecflowSharedConfig`.

import {
	applyBorderlineOverride,
	parseBoolean,
	parseNonNegativeInt,
	parsePositiveInt,
	readLeafUnder,
	readSpecflowSharedConfig,
} from "../specflow-config.js";

export interface DispatchConfig {
	readonly enabled: boolean;
	readonly threshold: number;
	readonly maxConcurrency: number;
}

/**
 * Default dispatch configuration. `enabled` is `true` per
 * `bundle-subagent-execution`'s "enabled by default, explicit opt-out"
 * semantics: when `apply.subagent_dispatch.enabled` is absent from
 * `.specflow/config.yaml`, the dispatcher engages whenever its other
 * eligibility guards are satisfied (`task-graph.json` present, at least
 * one bundle with `size_score > threshold`).
 */
export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
	enabled: true,
	threshold: 5,
	maxConcurrency: 3,
};

/**
 * Read `apply.subagent_dispatch.*` from `.specflow/config.yaml`. All fields
 * are optional; missing / malformed values fall back to
 * `DEFAULT_DISPATCH_CONFIG` rather than throwing. Legacy entries in
 * `openspec/config.yaml` are detected via `readSpecflowSharedConfig` and
 * surface as one-time deprecation warnings; their values are NOT honored.
 *
 * `max_concurrency` is classified as a borderline setting per
 * `config-ownership-boundaries` and may be overridden per-operator via
 * `SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY` populated from
 * `.specflow/config.env`.
 */
export function readDispatchConfig(projectRoot: string): DispatchConfig {
	const content = readSpecflowSharedConfig(projectRoot);
	return parseDispatchConfig(content);
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
	// Borderline-setting precedence: (valid env override) > (yaml value) > (default).
	// An *invalid* env override (e.g., non-numeric) SHALL NOT discard the yaml
	// value — fall back to yaml, then to the default. This preserves the
	// shared-default for the rest of the team while letting an operator
	// recover gracefully from a malformed local override.
	const yamlMaxConcurrency = readLeafUnder(content, parentPath, "max_concurrency");
	const overriddenMaxConcurrency = applyBorderlineOverride(
		yamlMaxConcurrency,
		"SPECFLOW_APPLY_SUBAGENT_DISPATCH_MAX_CONCURRENCY",
	);
	const maxConcurrency =
		parsePositiveInt(overriddenMaxConcurrency) ??
		parsePositiveInt(yamlMaxConcurrency) ??
		DEFAULT_DISPATCH_CONFIG.maxConcurrency;
	return { enabled, threshold, maxConcurrency };
}

/**
 * The dispatcher SHALL engage for a change only when both are true:
 *   1. `apply.subagent_dispatch.enabled` is `true` (now the default)
 *   2. `task-graph.json` exists for the change (CLI-mandatory path)
 *
 * When either condition fails, `/specflow.apply` stays on its non-dispatch
 * behavior: the CLI-mandatory inline path if the graph is present
 * (main-agent inline execution), or the legacy tasks.md fallback if the
 * graph is absent.
 */
export function shouldUseDispatcher(
	config: DispatchConfig,
	taskGraphExists: boolean,
): boolean {
	return config.enabled && taskGraphExists;
}
