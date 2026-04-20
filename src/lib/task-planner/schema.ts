// Task graph JSON schema validation.

import type { TaskGraph } from "./types.js";

export interface ValidationResult {
	readonly valid: boolean;
	readonly errors: readonly string[];
}

const VALID_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;

function isNonEmptyString(v: unknown): v is string {
	return typeof v === "string" && v.length > 0;
}

function isStringArray(v: unknown): v is readonly string[] {
	return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function hasCircularDependencies(
	bundles: readonly { id: string; depends_on: readonly string[] }[],
): string | null {
	const visited = new Set<string>();
	const visiting = new Set<string>();
	const bundleMap = new Map(bundles.map((b) => [b.id, b]));

	function dfs(id: string, path: readonly string[]): string | null {
		if (visiting.has(id)) {
			return `Circular dependency: ${[...path, id].join(" → ")}`;
		}
		if (visited.has(id)) return null;

		visiting.add(id);
		const bundle = bundleMap.get(id);
		if (bundle) {
			for (const dep of bundle.depends_on) {
				const cycle = dfs(dep, [...path, id]);
				if (cycle) return cycle;
			}
		}
		visiting.delete(id);
		visited.add(id);
		return null;
	}

	for (const b of bundles) {
		const cycle = dfs(b.id, []);
		if (cycle) return cycle;
	}
	return null;
}

export function validateTaskGraph(input: unknown): ValidationResult {
	const errors: string[] = [];

	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { valid: false, errors: ["Root must be a non-null object"] };
	}

	const obj = input as Record<string, unknown>;

	// Top-level required fields
	if (!isNonEmptyString(obj.version)) {
		errors.push("Missing or invalid 'version' (expected non-empty string)");
	}
	if (!isNonEmptyString(obj.change_id)) {
		errors.push("Missing or invalid 'change_id' (expected non-empty string)");
	}
	if (!isNonEmptyString(obj.generated_at)) {
		errors.push(
			"Missing or invalid 'generated_at' (expected non-empty string)",
		);
	}
	if (!isNonEmptyString(obj.generated_from)) {
		errors.push(
			"Missing or invalid 'generated_from' (expected non-empty string)",
		);
	}

	if (!Array.isArray(obj.bundles)) {
		errors.push("Missing or invalid 'bundles' (expected array)");
		return { valid: false, errors };
	}

	const bundleIds = new Set<string>();
	const allBundleIds = new Set<string>();

	// Collect all bundle IDs first for reference validation
	for (const b of obj.bundles as unknown[]) {
		if (typeof b === "object" && b !== null && "id" in b) {
			const bundle = b as Record<string, unknown>;
			if (isNonEmptyString(bundle.id)) {
				allBundleIds.add(bundle.id);
			}
		}
	}

	for (let i = 0; i < (obj.bundles as unknown[]).length; i++) {
		const b = (obj.bundles as unknown[])[i];
		const prefix = `bundles[${i}]`;

		if (typeof b !== "object" || b === null) {
			errors.push(`${prefix}: expected object`);
			continue;
		}

		const bundle = b as Record<string, unknown>;

		// Required string fields
		if (!isNonEmptyString(bundle.id)) {
			errors.push(`${prefix}.id: expected non-empty string`);
		} else {
			if (bundleIds.has(bundle.id)) {
				errors.push(`${prefix}.id: duplicate bundle ID '${bundle.id}'`);
			}
			bundleIds.add(bundle.id);
		}

		if (!isNonEmptyString(bundle.title)) {
			errors.push(`${prefix}.title: expected non-empty string`);
		}
		if (!isNonEmptyString(bundle.goal)) {
			errors.push(`${prefix}.goal: expected non-empty string`);
		}

		// Status
		if (
			typeof bundle.status !== "string" ||
			!VALID_STATUSES.includes(bundle.status as (typeof VALID_STATUSES)[number])
		) {
			errors.push(
				`${prefix}.status: expected one of ${VALID_STATUSES.join(", ")}`,
			);
		}

		// Optional size_score: when present, SHALL be a non-negative integer AND
		// SHALL equal `bundle.tasks.length`. The dispatcher contract (see
		// `bundle-subagent-execution` spec) defines `size_score = tasks.length`;
		// persisting a mismatched value would let a stale or corrupted graph
		// silently misroute bundles between inline and subagent dispatch.
		if (bundle.size_score !== undefined) {
			const score = bundle.size_score;
			if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
				errors.push(
					`${prefix}.size_score: expected non-negative integer when present`,
				);
			} else if (Array.isArray(bundle.tasks)) {
				const taskCount = (bundle.tasks as unknown[]).length;
				if (score !== taskCount) {
					errors.push(
						`${prefix}.size_score (${score}) must equal bundle.tasks.length (${taskCount})`,
					);
				}
			}
		}

		// String arrays
		if (!isStringArray(bundle.depends_on)) {
			errors.push(`${prefix}.depends_on: expected string array`);
		} else {
			for (const dep of bundle.depends_on as string[]) {
				if (!allBundleIds.has(dep)) {
					errors.push(
						`${prefix}.depends_on: references non-existent bundle '${dep}'`,
					);
				}
			}
		}
		if (!isStringArray(bundle.inputs)) {
			errors.push(`${prefix}.inputs: expected string array`);
		}
		if (!isStringArray(bundle.outputs)) {
			errors.push(`${prefix}.outputs: expected string array`);
		}
		if (!isStringArray(bundle.owner_capabilities)) {
			errors.push(`${prefix}.owner_capabilities: expected string array`);
		}

		// Tasks array
		if (!Array.isArray(bundle.tasks)) {
			errors.push(`${prefix}.tasks: expected array`);
		} else {
			const taskIds = new Set<string>();
			for (let j = 0; j < (bundle.tasks as unknown[]).length; j++) {
				const t = (bundle.tasks as unknown[])[j];
				const tPrefix = `${prefix}.tasks[${j}]`;

				if (typeof t !== "object" || t === null) {
					errors.push(`${tPrefix}: expected object`);
					continue;
				}

				const task = t as Record<string, unknown>;
				if (!isNonEmptyString(task.id)) {
					errors.push(`${tPrefix}.id: expected non-empty string`);
				} else {
					if (taskIds.has(task.id)) {
						errors.push(`${tPrefix}.id: duplicate task ID '${task.id}'`);
					}
					taskIds.add(task.id);
				}
				if (!isNonEmptyString(task.title)) {
					errors.push(`${tPrefix}.title: expected non-empty string`);
				}
				if (
					typeof task.status !== "string" ||
					!VALID_STATUSES.includes(
						task.status as (typeof VALID_STATUSES)[number],
					)
				) {
					errors.push(
						`${tPrefix}.status: expected one of ${VALID_STATUSES.join(", ")}`,
					);
				}
			}
		}
	}

	// Cycle detection (only if we have valid bundle structures)
	if (errors.length === 0) {
		const bundlesForCycleCheck = (obj.bundles as Record<string, unknown>[]).map(
			(b) => ({
				id: b.id as string,
				depends_on: b.depends_on as string[],
			}),
		);
		const cycleError = hasCircularDependencies(bundlesForCycleCheck);
		if (cycleError) {
			errors.push(cycleError);
		}
	}

	return { valid: errors.length === 0, errors };
}

export function assertValidTaskGraph(
	input: unknown,
): asserts input is TaskGraph {
	const result = validateTaskGraph(input);
	if (!result.valid) {
		throw new Error(`Invalid TaskGraph: ${result.errors.join("; ")}`);
	}
}
