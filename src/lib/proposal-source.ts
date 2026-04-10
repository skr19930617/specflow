import { readFileSync } from "node:fs";
import { parseSchemaJson } from "./schemas.js";
import type { ProposalSource, SourceMetadata } from "../types/contracts.js";

export interface ProposalInstructions {
	readonly outputPath?: string;
	readonly template?: string;
	readonly instruction?: string;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function splitBody(body: string): string[] {
	const normalized = normalizeWhitespace(body);
	if (normalized.length === 0) {
		return [];
	}
	const lines = normalized
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length > 1) {
		return lines.slice(0, 3);
	}
	return normalized
		.split(/(?<=[.!?])\s+/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 3);
}

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[^\u0020-\u007E]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

export function readSourceMetadataFile(path: string): SourceMetadata {
	return parseSchemaJson<SourceMetadata>(
		"source-metadata",
		readFileSync(path, "utf8"),
		`source file ${path}`,
	);
}

export function readProposalSourceFile(path: string): ProposalSource {
	return parseSchemaJson<ProposalSource>(
		"proposal-source",
		readFileSync(path, "utf8"),
		`proposal source file ${path}`,
	);
}

export function toSourceMetadata(
	source: SourceMetadata | ProposalSource,
): SourceMetadata {
	return {
		kind: source.kind,
		provider: source.provider,
		reference: source.reference,
		title: source.title,
	};
}

export function deriveChangeId(
	source: SourceMetadata | ProposalSource,
): string {
	const candidates = [
		source.title,
		"body" in source && typeof source.body === "string" ? source.body : null,
		source.reference,
	];
	for (const candidate of candidates) {
		if (!candidate) {
			continue;
		}
		const slug = slugify(candidate);
		if (slug.length > 0) {
			return slug;
		}
	}
	return "change";
}

export function renderSeededProposal(
	changeId: string,
	source: ProposalSource,
	instructions: ProposalInstructions = {},
): string {
	const template = normalizeWhitespace(instructions.template ?? "");
	const guidance = normalizeWhitespace(instructions.instruction ?? "");
	const bodySummary = splitBody(source.body);
	const whatChanges =
		bodySummary.length > 0
			? bodySummary.map((line) => `- ${line}`)
			: [
					`- Create the initial proposal draft for \`${changeId}\`.`,
					"- Refine the detailed requirements during clarify and review.",
				];

	return [
		...(template ? [template, ""] : ["# Proposal", ""]),
		"## Why",
		"",
		`Seeded from a normalized \`${source.kind}\` source to establish the first local proposal draft for \`${changeId}\`.`,
		"",
		`- Source provider: ${source.provider ?? "unknown"}`,
		`- Source reference: ${source.reference}`,
		...(source.title ? [`- Source title: ${source.title}`] : []),
		...(bodySummary.length > 0
			? ["", "Source context:", "", ...bodySummary.map((line) => `> ${line}`)]
			: []),
		...(guidance ? ["", "## OpenSpec Guidance", "", guidance] : []),
		"",
		"## What Changes",
		"",
		...whatChanges,
		"",
		"## Capabilities",
		"",
		"### New Capabilities",
		`- \`${changeId}\`: Seed capability derived from the provided source context.`,
		"",
		"### Modified Capabilities",
		"- None identified yet.",
		"",
		"## Impact",
		"",
		`- Local change artifacts live under \`openspec/changes/${changeId}/\`.`,
		"- Additional implementation and API impact will be refined during clarify and design.",
		"",
	].join("\n");
}
