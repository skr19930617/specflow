import { GLOBAL_INVARIANTS } from "./agent-context-template.js";
import type { ProfileSchema } from "./profile-schema.js";
import { CURRENT_PROFILE_SCHEMA_VERSION } from "./profile-schema.js";

// ---------------------------------------------------------------------------
// Task 5.1: Types
// ---------------------------------------------------------------------------

export type WriteDisposition = "safe-write" | "confirmation-required" | "abort";

export interface RenderResult {
	readonly nextContent: string;
	readonly warning: string | null;
	readonly diffPreview: string | null;
	readonly writeDisposition: WriteDisposition;
}

export interface ParsedClaudeMd {
	readonly managedContent: string | null;
	readonly unmanagedBefore: string;
	readonly unmanagedAfter: string;
	readonly hasMarkers: boolean;
	readonly markerAnomaly: string | null;
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

const MARKER_START = "<!-- specflow:managed:start -->";
const MARKER_END = "<!-- specflow:managed:end -->";

// ---------------------------------------------------------------------------
// Task 5.2: parseClaudeMd
// ---------------------------------------------------------------------------

export function parseClaudeMd(content: string): ParsedClaudeMd {
	const startIndices = allIndicesOf(content, MARKER_START);
	const endIndices = allIndicesOf(content, MARKER_END);

	const anomaly = detectMarkerAnomaly(startIndices, endIndices, content);
	if (anomaly !== null) {
		return {
			managedContent: null,
			unmanagedBefore: "",
			unmanagedAfter: content,
			hasMarkers: false,
			markerAnomaly: anomaly,
		};
	}

	if (startIndices.length === 0 && endIndices.length === 0) {
		return {
			managedContent: null,
			unmanagedBefore: "",
			unmanagedAfter: content,
			hasMarkers: false,
			markerAnomaly: null,
		};
	}

	const startIdx = startIndices[0];
	const endIdx = endIndices[0];
	const managedStart = startIdx + MARKER_START.length;
	const rawManaged = content.slice(managedStart, endIdx);
	const managed = stripSurroundingNewlines(rawManaged);

	return {
		managedContent: managed,
		unmanagedBefore: content.slice(0, startIdx),
		unmanagedAfter: content.slice(endIdx + MARKER_END.length),
		hasMarkers: true,
		markerAnomaly: null,
	};
}

// ---------------------------------------------------------------------------
// Task 5.3: renderManagedBlock
// ---------------------------------------------------------------------------

export function renderManagedBlock(profile: ProfileSchema): string {
	const sections: string[] = [];

	sections.push(renderContractDiscipline());
	sections.push(renderProjectProfile(profile));

	const optional = renderOptionalSections(profile);
	if (optional !== null) {
		sections.push(optional);
	}

	return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Task 5.4: renderClaudeMd
// ---------------------------------------------------------------------------

export function renderClaudeMd(
	profile: ProfileSchema,
	existingContent: string | null,
): RenderResult {
	const managed = renderManagedBlock(profile);
	const wrappedBlock = wrapInMarkers(managed);

	if (existingContent === null) {
		return {
			nextContent: wrappedBlock,
			warning: null,
			diffPreview: null,
			writeDisposition: "safe-write",
		};
	}

	const parsed = parseClaudeMd(existingContent);

	if (parsed.markerAnomaly !== null) {
		return {
			nextContent: existingContent,
			warning: `Marker anomaly detected: ${parsed.markerAnomaly}. Manual repair required.`,
			diffPreview: null,
			writeDisposition: "abort",
		};
	}

	if (parsed.hasMarkers) {
		const nextContent = composeManagedDocument(
			parsed.unmanagedBefore,
			wrappedBlock,
			parsed.unmanagedAfter,
		);
		return {
			nextContent,
			warning: null,
			diffPreview: null,
			writeDisposition: "safe-write",
		};
	}

	return renderLegacyMigration(wrappedBlock, existingContent);
}

// ---------------------------------------------------------------------------
// Task 5.5: Legacy migration
// ---------------------------------------------------------------------------

function renderLegacyMigration(
	wrappedBlock: string,
	existingContent: string,
): RenderResult {
	const nextContent = prependManagedBlock(wrappedBlock, existingContent);

	const diffPreview = buildLegacyDiffPreview(wrappedBlock, existingContent);

	return {
		nextContent,
		warning:
			"Existing CLAUDE.md has no specflow markers. " +
			"A managed block will be prepended and existing content preserved as unmanaged.",
		diffPreview,
		writeDisposition: "confirmation-required",
	};
}

// ---------------------------------------------------------------------------
// Task 5.6: renderClaudeMdStrict
// ---------------------------------------------------------------------------

export function renderClaudeMdStrict(
	profile: ProfileSchema,
	existingContent: string | null,
): RenderResult {
	if (profile.schemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
		return {
			nextContent: existingContent ?? "",
			warning:
				`Profile schemaVersion "${profile.schemaVersion}" does not match ` +
				`the current version "${CURRENT_PROFILE_SCHEMA_VERSION}". ` +
				"Run the setup command to migrate your profile before rendering.",
			diffPreview: null,
			writeDisposition: "abort",
		};
	}

	return renderClaudeMd(profile, existingContent);
}

// ---------------------------------------------------------------------------
// Internal helpers: marker utilities
// ---------------------------------------------------------------------------

function allIndicesOf(haystack: string, needle: string): readonly number[] {
	const indices: number[] = [];
	let pos = 0;
	while (pos < haystack.length) {
		const idx = haystack.indexOf(needle, pos);
		if (idx === -1) break;
		indices.push(idx);
		pos = idx + needle.length;
	}
	return indices;
}

function detectMarkerAnomaly(
	startIndices: readonly number[],
	endIndices: readonly number[],
	content: string,
): string | null {
	if (startIndices.length > 1 || endIndices.length > 1) {
		return "Duplicate markers found.";
	}
	if (startIndices.length === 1 && endIndices.length === 0) {
		return "Start marker found without matching end marker.";
	}
	if (startIndices.length === 0 && endIndices.length === 1) {
		return "End marker found without matching start marker.";
	}
	if (startIndices.length === 1 && endIndices.length === 1) {
		const startPos = content.indexOf(MARKER_START);
		const endPos = content.indexOf(MARKER_END);
		if (endPos < startPos) {
			return "End marker appears before start marker.";
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Internal helpers: string composition
// ---------------------------------------------------------------------------

function stripSurroundingNewlines(text: string): string {
	let start = 0;
	let end = text.length;
	if (text[start] === "\n") start += 1;
	if (end > start && text[end - 1] === "\n") end -= 1;
	return text.slice(start, end);
}

function wrapInMarkers(managed: string): string {
	return `${MARKER_START}\n${managed}\n${MARKER_END}`;
}

function composeManagedDocument(
	before: string,
	wrappedBlock: string,
	after: string,
): string {
	return `${before}${wrappedBlock}${after}`;
}

function prependManagedBlock(
	wrappedBlock: string,
	existingContent: string,
): string {
	if (existingContent === "") {
		return wrappedBlock;
	}
	return `${wrappedBlock}\n\n${existingContent}`;
}

// ---------------------------------------------------------------------------
// Internal helpers: rendering sections
// ---------------------------------------------------------------------------

function renderContractDiscipline(): string {
	const items = GLOBAL_INVARIANTS.contractDiscipline;
	const bullets = items.map((item) => `- ${item}`).join("\n");
	return `## Contract Discipline\n\n${bullets}`;
}

function renderProjectProfile(profile: ProfileSchema): string {
	const lines: string[] = [];
	lines.push(`- **Languages:** ${profile.languages.join(", ")}`);
	lines.push(`- **Toolchain:** ${profile.toolchain}`);

	appendCommandField(lines, "Build", profile.commands.build);
	appendCommandField(lines, "Test", profile.commands.test);
	appendCommandField(lines, "Lint", profile.commands.lint);
	appendCommandField(lines, "Format", profile.commands.format);

	appendDirectoryField(lines, "Source", profile.directories.source);
	appendDirectoryField(lines, "Test dirs", profile.directories.test);
	appendDirectoryField(lines, "Generated", profile.directories.generated);

	return `## Project Profile\n\n${lines.join("\n")}`;
}

function renderOptionalSections(profile: ProfileSchema): string | null {
	const parts: string[] = [];

	if (profile.forbiddenEditZones !== null) {
		parts.push(
			renderStringListSection(
				"Forbidden Edit Zones",
				profile.forbiddenEditZones,
			),
		);
	}

	if (profile.contractSensitiveModules !== null) {
		parts.push(
			renderStringListSection(
				"Contract-Sensitive Modules",
				profile.contractSensitiveModules,
			),
		);
	}

	if (profile.codingConventions !== null) {
		parts.push(
			renderStringListSection("Coding Conventions", profile.codingConventions),
		);
	}

	if (profile.verificationExpectations !== null) {
		parts.push(
			renderStringListSection(
				"Verification Expectations",
				profile.verificationExpectations,
			),
		);
	}

	return parts.length > 0 ? parts.join("\n\n") : null;
}

function renderStringListSection(
	heading: string,
	items: readonly string[],
): string {
	const bullets = items.map((item) => `- ${item}`).join("\n");
	return `## ${heading}\n\n${bullets}`;
}

function appendCommandField(
	lines: string[],
	label: string,
	value: string | null,
): void {
	if (value !== null) {
		lines.push(`- **${label}:** \`${value}\``);
	}
}

function appendDirectoryField(
	lines: string[],
	label: string,
	dirs: readonly string[] | null,
): void {
	if (dirs !== null) {
		lines.push(`- **${label}:** ${dirs.join(", ")}`);
	}
}

// ---------------------------------------------------------------------------
// Internal helpers: diff preview
// ---------------------------------------------------------------------------

function buildLegacyDiffPreview(
	wrappedBlock: string,
	existingContent: string,
): string {
	const previewLines: string[] = [];
	previewLines.push("--- CLAUDE.md (before)");
	previewLines.push("+++ CLAUDE.md (after)");
	previewLines.push("@@ migration: prepend managed block @@");

	for (const line of wrappedBlock.split("\n")) {
		previewLines.push(`+ ${line}`);
	}

	previewLines.push("+");

	for (const line of existingContent.split("\n")) {
		previewLines.push(`  ${line}`);
	}

	return previewLines.join("\n");
}
