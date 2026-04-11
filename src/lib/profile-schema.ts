import { atomicWriteText, readText } from "./fs.js";
import { parseJson } from "./json.js";

// ---------------------------------------------------------------------------
// Task 1.1: TypeScript types
// ---------------------------------------------------------------------------

export interface ProfileCommands {
	readonly build: string | null;
	readonly test: string | null;
	readonly lint: string | null;
	readonly format: string | null;
}

export interface ProfileDirectories {
	readonly source: readonly string[] | null;
	readonly test: readonly string[] | null;
	readonly generated: readonly string[] | null;
}

export interface ProfileSchema {
	readonly schemaVersion: string;
	readonly languages: readonly string[];
	readonly toolchain: string;
	readonly commands: ProfileCommands;
	readonly directories: ProfileDirectories;
	readonly forbiddenEditZones: readonly string[] | null;
	readonly contractSensitiveModules: readonly string[] | null;
	readonly codingConventions: readonly string[] | null;
	readonly verificationExpectations: readonly string[] | null;
}

// ---------------------------------------------------------------------------
// Task 1.2: Schema version constant and utilities
// ---------------------------------------------------------------------------

export const CURRENT_PROFILE_SCHEMA_VERSION = "1";

export function sniffSchemaVersion(raw: unknown): string | null {
	if (
		raw !== null &&
		typeof raw === "object" &&
		!Array.isArray(raw) &&
		"schemaVersion" in raw &&
		typeof (raw as Record<string, unknown>).schemaVersion === "string"
	) {
		return (raw as Record<string, unknown>).schemaVersion as string;
	}
	return null;
}

export function compareSchemaVersion(
	version: string,
	current: string,
): "current" | "older" | "newer" {
	const v = Number.parseInt(version, 10);
	const c = Number.parseInt(current, 10);
	if (v === c) {
		return "current";
	}
	return v < c ? "older" : "newer";
}

// ---------------------------------------------------------------------------
// Task 1.3: Validation
// ---------------------------------------------------------------------------

const COMMANDS_KEYS: ReadonlySet<string> = new Set([
	"build",
	"test",
	"lint",
	"format",
]);

const DIRECTORIES_KEYS: ReadonlySet<string> = new Set([
	"source",
	"test",
	"generated",
]);

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
	"schemaVersion",
	"languages",
	"toolchain",
	"commands",
	"directories",
	"forbiddenEditZones",
	"contractSensitiveModules",
	"codingConventions",
	"verificationExpectations",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function push(errors: string[], path: string, message: string): void {
	errors.push(`${path} ${message}`);
}

function validateNullableStringArray(
	value: unknown,
	path: string,
	errors: string[],
): void {
	if (value === null) {
		return;
	}
	if (!Array.isArray(value)) {
		push(errors, path, "must be an array of strings or null.");
		return;
	}
	for (let i = 0; i < value.length; i += 1) {
		if (typeof value[i] !== "string") {
			push(errors, `${path}[${i}]`, "must be a string.");
		}
	}
}

function validateCommands(
	value: unknown,
	path: string,
	errors: string[],
): void {
	if (!isRecord(value)) {
		push(errors, path, "must be an object.");
		return;
	}
	for (const key of Object.keys(value)) {
		if (!COMMANDS_KEYS.has(key)) {
			push(errors, `${path}.${key}`, "is an unknown key.");
		}
	}
	for (const key of COMMANDS_KEYS) {
		if (!(key in value)) {
			push(errors, `${path}.${key}`, "is required.");
			continue;
		}
		const v = value[key];
		if (v !== null && typeof v !== "string") {
			push(errors, `${path}.${key}`, "must be a string or null.");
		}
	}
}

function validateDirectories(
	value: unknown,
	path: string,
	errors: string[],
): void {
	if (!isRecord(value)) {
		push(errors, path, "must be an object.");
		return;
	}
	for (const key of Object.keys(value)) {
		if (!DIRECTORIES_KEYS.has(key)) {
			push(errors, `${path}.${key}`, "is an unknown key.");
		}
	}
	for (const key of DIRECTORIES_KEYS) {
		if (!(key in value)) {
			push(errors, `${path}.${key}`, "is required.");
			continue;
		}
		validateNullableStringArray(value[key], `${path}.${key}`, errors);
	}
}

export function validateProfile(value: unknown): string[] {
	const errors: string[] = [];

	if (!isRecord(value)) {
		push(errors, "$", "must be an object.");
		return errors;
	}

	for (const key of Object.keys(value)) {
		if (!TOP_LEVEL_KEYS.has(key)) {
			push(errors, `$.${key}`, "is an unknown key.");
		}
	}

	// Check for missing top-level keys
	for (const key of TOP_LEVEL_KEYS) {
		if (!(key in value)) {
			push(errors, `$.${key}`, "is required.");
		}
	}

	// schemaVersion
	if ("schemaVersion" in value) {
		if (
			typeof value.schemaVersion !== "string" ||
			!/^[1-9]\d*$/.test(value.schemaVersion)
		) {
			push(errors, "$.schemaVersion", "must be a monotonic integer string.");
		}
	}

	// languages
	if ("languages" in value) {
		if (!Array.isArray(value.languages) || value.languages.length === 0) {
			push(errors, "$.languages", "must be a non-empty array of strings.");
		} else if (value.languages.length !== 1) {
			push(errors, "$.languages", "must contain exactly one language in v1.");
		} else {
			for (let i = 0; i < value.languages.length; i += 1) {
				if (typeof value.languages[i] !== "string") {
					push(errors, `$.languages[${i}]`, "must be a string.");
				}
			}
		}
	}

	// toolchain
	if ("toolchain" in value) {
		if (typeof value.toolchain !== "string" || value.toolchain === "") {
			push(errors, "$.toolchain", "must be a non-empty string.");
		}
	}

	// commands
	if ("commands" in value) {
		validateCommands(value.commands, "$.commands", errors);
	}

	// directories
	if ("directories" in value) {
		validateDirectories(value.directories, "$.directories", errors);
	}

	// Nullable string array fields
	const nullableArrayFields = [
		"forbiddenEditZones",
		"contractSensitiveModules",
		"codingConventions",
		"verificationExpectations",
	] as const;

	for (const field of nullableArrayFields) {
		if (field in value) {
			validateNullableStringArray(value[field], `$.${field}`, errors);
		}
	}

	return errors;
}

// ---------------------------------------------------------------------------
// Task 1.4: Load/write utilities
// ---------------------------------------------------------------------------

export function createBlankProfile(
	languages: readonly string[],
	toolchain: string,
): ProfileSchema {
	return {
		schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
		languages: [...languages],
		toolchain,
		commands: {
			build: null,
			test: null,
			lint: null,
			format: null,
		},
		directories: {
			source: null,
			test: null,
			generated: null,
		},
		forbiddenEditZones: null,
		contractSensitiveModules: null,
		codingConventions: null,
		verificationExpectations: null,
	};
}

export function writeProfile(filePath: string, profile: ProfileSchema): void {
	const errors = validateProfile(profile);
	if (errors.length > 0) {
		throw new Error(
			`Profile validation failed before write: ${errors.join(" ")}`,
		);
	}
	atomicWriteText(filePath, `${JSON.stringify(profile, null, 2)}\n`);
}

export function loadProfileForSetup(
	filePath: string,
): { profile: ProfileSchema; migrated: boolean } | { error: string } {
	let raw: string;
	try {
		raw = readText(filePath);
	} catch {
		return { error: `Failed to read profile file: ${filePath}` };
	}

	let parsed: unknown;
	try {
		parsed = parseJson<unknown>(raw, filePath);
	} catch {
		return {
			error: `Profile is not valid JSON: ${filePath}`,
		};
	}

	if (!isRecord(parsed)) {
		return { error: "Profile root must be a JSON object." };
	}

	const version = sniffSchemaVersion(parsed);
	if (version === null) {
		return { error: "Profile is missing schemaVersion." };
	}

	const comparison = compareSchemaVersion(
		version,
		CURRENT_PROFILE_SCHEMA_VERSION,
	);
	let migrated = false;
	let record = parsed;

	if (comparison === "older") {
		record = migrateProfile(record, version);
		migrated = true;
	} else if (comparison === "newer") {
		return {
			error: `Profile schemaVersion "${version}" is newer than the supported version "${CURRENT_PROFILE_SCHEMA_VERSION}". Please upgrade your tooling.`,
		};
	}

	const errors = validateProfile(record);
	if (errors.length > 0) {
		return {
			error: `Profile validation failed: ${errors.join(" ")}`,
		};
	}

	return { profile: record as unknown as ProfileSchema, migrated };
}

export function readProfileStrict(
	filePath: string,
): { profile: ProfileSchema } | { error: string } {
	let raw: string;
	try {
		raw = readText(filePath);
	} catch {
		return { error: `Failed to read profile file: ${filePath}` };
	}

	let parsed: unknown;
	try {
		parsed = parseJson<unknown>(raw, filePath);
	} catch {
		return {
			error: `Profile is not valid JSON: ${filePath}`,
		};
	}

	if (!isRecord(parsed)) {
		return { error: "Profile root must be a JSON object." };
	}

	const version = sniffSchemaVersion(parsed);
	if (version === null) {
		return { error: "Profile is missing schemaVersion." };
	}

	const comparison = compareSchemaVersion(
		version,
		CURRENT_PROFILE_SCHEMA_VERSION,
	);
	if (comparison !== "current") {
		const direction = comparison === "older" ? "older" : "newer";
		return {
			error: `Profile schemaVersion "${version}" is ${direction} than the current version "${CURRENT_PROFILE_SCHEMA_VERSION}". Run the setup command to migrate your profile.`,
		};
	}

	const errors = validateProfile(parsed);
	if (errors.length > 0) {
		return {
			error: `Profile validation failed: ${errors.join(" ")}`,
		};
	}

	return { profile: parsed as unknown as ProfileSchema };
}

// ---------------------------------------------------------------------------
// Task 1.5: Migration helpers
// ---------------------------------------------------------------------------

export function migrateProfile(
	raw: Record<string, unknown>,
	fromVersion: string,
): Record<string, unknown> {
	if (fromVersion === CURRENT_PROFILE_SCHEMA_VERSION) {
		return { ...raw };
	}
	throw new Error(
		`Cannot migrate profile from unknown schemaVersion "${fromVersion}".`,
	);
}
