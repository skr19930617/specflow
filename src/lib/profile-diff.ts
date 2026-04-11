import type { ProfileSchema } from "./profile-schema.js";

// ---------------------------------------------------------------------------
// Task 4.1-4.3: Profile diffing
// ---------------------------------------------------------------------------

// --- Types ---

export type DiffAction = "unchanged" | "conflict" | "proposed" | "preserved";

export interface FieldDiff {
	readonly path: string;
	readonly action: DiffAction;
	readonly existingValue: unknown;
	readonly newValue: unknown;
}

export interface ProfileDiffResult {
	readonly diffs: readonly FieldDiff[];
	readonly hasChanges: boolean;
}

// --- Internal helpers ---

/** Sort-normalize an array for stable comparison. Returns null when input is null. */
function sortNormalized(
	arr: readonly string[] | null,
): readonly string[] | null {
	if (arr === null) {
		return null;
	}
	return [...arr].sort();
}

/** Serialize a value to a canonical JSON string for comparison. */
function canonical(value: unknown): string {
	return JSON.stringify(value);
}

// --- Task 4.2: Diff action rules ---

/**
 * Determine the diff action for a single field.
 *
 * - existing === detected (by canonical comparison) -> unchanged
 * - Both non-null but different                     -> conflict
 * - existing is null, detected is non-null           -> proposed
 * - existing is non-null, detected is null           -> preserved
 */
function classifyAction(existing: unknown, detected: unknown): DiffAction {
	if (canonical(existing) === canonical(detected)) {
		return "unchanged";
	}
	if (existing === null && detected !== null) {
		return "proposed";
	}
	if (existing !== null && detected === null) {
		return "preserved";
	}
	return "conflict";
}

function createFieldDiff(
	path: string,
	existing: unknown,
	detected: unknown,
): FieldDiff {
	return {
		path,
		action: classifyAction(existing, detected),
		existingValue: existing,
		newValue: detected,
	};
}

// --- Task 4.3: Diff flattening helpers ---

/** Diff each child key of an object field individually, producing dotted paths. */
function diffObjectField(
	parentPath: string,
	existing: Readonly<Record<string, unknown>>,
	detected: Readonly<Record<string, unknown>>,
): readonly FieldDiff[] {
	const keys = new Set([...Object.keys(existing), ...Object.keys(detected)]);
	const result: FieldDiff[] = [];
	for (const key of keys) {
		const existingVal = key in existing ? existing[key] : null;
		const detectedVal = key in detected ? detected[key] : null;
		result.push(
			createFieldDiff(`${parentPath}.${key}`, existingVal, detectedVal),
		);
	}
	return result;
}

/** Diff an array field after sort-normalizing both sides. */
function diffArrayField(
	path: string,
	existing: readonly string[] | null,
	detected: readonly string[] | null,
): FieldDiff {
	const sortedExisting = sortNormalized(existing);
	const sortedDetected = sortNormalized(detected);
	return createFieldDiff(path, sortedExisting, sortedDetected);
}

// --- Nullable array field names (top-level) ---

const NULLABLE_ARRAY_FIELDS: readonly (keyof ProfileSchema)[] = [
	"forbiddenEditZones",
	"contractSensitiveModules",
	"codingConventions",
	"verificationExpectations",
] as const;

// --- Task 4.1: diffProfiles ---

/**
 * Compare two ProfileSchema instances field by field.
 *
 * - `commands` and `directories` are flattened into child-key diffs.
 * - Array fields are sort-normalized before comparison.
 * - Top-level primitives are compared directly.
 *
 * Returns all diffs in a single flat list with dotted paths.
 */
export function diffProfiles(
	existing: ProfileSchema,
	detected: ProfileSchema,
): ProfileDiffResult {
	const diffs: FieldDiff[] = [];

	// Top-level primitives
	diffs.push(
		createFieldDiff(
			"schemaVersion",
			existing.schemaVersion,
			detected.schemaVersion,
		),
	);
	diffs.push(
		createFieldDiff("toolchain", existing.toolchain, detected.toolchain),
	);

	// languages: sort-normalize before comparing
	diffs.push(
		diffArrayField(
			"languages",
			existing.languages as readonly string[],
			detected.languages as readonly string[],
		),
	);

	// commands: flatten per child key
	diffs.push(
		...diffObjectField(
			"commands",
			existing.commands as unknown as Record<string, unknown>,
			detected.commands as unknown as Record<string, unknown>,
		),
	);

	// directories: flatten per child key
	diffs.push(
		...diffObjectField(
			"directories",
			existing.directories as unknown as Record<string, unknown>,
			detected.directories as unknown as Record<string, unknown>,
		),
	);

	// Nullable array fields: sort-normalize
	for (const field of NULLABLE_ARRAY_FIELDS) {
		diffs.push(
			diffArrayField(
				field,
				existing[field] as readonly string[] | null,
				detected[field] as readonly string[] | null,
			),
		);
	}

	const hasChanges = diffs.some((d) => d.action !== "unchanged");

	return { diffs, hasChanges };
}
