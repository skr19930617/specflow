// Spec consistency verification: parse a change's proposal.md + delta specs,
// deterministically resolve impacted baseline specs, pair delta clauses with
// baseline clauses, and detect REMOVED-clause ripple candidates across the
// full baseline catalog.
//
// This module is pure I/O-over-fs: it reads files and returns a structured
// VerifyReport. The semantic judgement of whether a pairing is an actual
// incompatibility is left to the /specflow agent.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export const VERIFY_SCHEMA_VERSION = 1;

export interface Pairing {
	readonly capability: string;
	readonly delta_path: string;
	readonly delta_anchor: string;
	readonly baseline_path: string;
	readonly baseline_anchor: string;
	readonly delta_excerpt: string;
	readonly baseline_excerpt: string;
}

export interface RippleCandidate {
	readonly removed_requirement: string;
	readonly baseline_path: string;
	readonly line: number;
	readonly excerpt: string;
}

export type VerifyErrorCode = "missing_baseline" | "unparseable_baseline";

export interface VerifyError {
	readonly code: VerifyErrorCode;
	readonly capability: string;
	readonly parse_reason?: string;
}

export type VerifyReason = "no_modified_capabilities";

export interface VerifyReport {
	readonly schema_version: typeof VERIFY_SCHEMA_VERSION;
	readonly change_id: string;
	readonly modified_capabilities: readonly string[];
	readonly pairings: readonly Pairing[];
	readonly ripple_candidates: readonly RippleCandidate[];
	readonly reason?: VerifyReason;
	readonly error?: VerifyError;
}

export interface VerifyOk {
	readonly ok: true;
	readonly report: VerifyReport;
}

export interface VerifyErr {
	readonly ok: false;
	readonly report: VerifyReport;
}

export type VerifyResult = VerifyOk | VerifyErr;

interface VerifyEnv {
	readonly repoRoot: string;
	readonly changeId: string;
}

function changeDir(env: VerifyEnv): string {
	return join(env.repoRoot, "openspec", "changes", env.changeId);
}

function baselineSpecPath(env: VerifyEnv, capability: string): string {
	return join(env.repoRoot, "openspec", "specs", capability, "spec.md");
}

function baselineSpecsDir(env: VerifyEnv): string {
	return join(env.repoRoot, "openspec", "specs");
}

/**
 * Parse the `## Modified Capabilities` list from a proposal.md. Each bullet
 * may begin with "- `name`:" or "- name:" — we strip backticks and any
 * trailing description. Lines that look like placeholder hints
 * (e.g. "- None identified yet.") are dropped.
 */
export function parseModifiedCapabilities(proposalMd: string): string[] {
	const lines = proposalMd.split("\n");
	let inSection = false;
	let inCapabilitiesRoot = false;
	const names: string[] = [];
	for (const line of lines) {
		if (/^##\s+Capabilities\s*$/.test(line)) {
			inCapabilitiesRoot = true;
			inSection = false;
			continue;
		}
		if (inCapabilitiesRoot && /^###\s+Modified Capabilities\s*$/.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection && /^###?\s+/.test(line)) {
			break;
		}
		if (inCapabilitiesRoot && /^##\s+/.test(line)) {
			break;
		}
		if (!inSection) continue;
		const match = line.match(/^\s*-\s+`?([A-Za-z0-9][A-Za-z0-9_-]*)`?\s*:/);
		if (match) {
			names.push(match[1]);
		}
	}
	return names;
}

export interface ParsedRequirement {
	readonly name: string;
	readonly normalizedName: string;
	readonly headerLine: number;
	readonly normativeLine: string;
	readonly scenarios: readonly ParsedScenario[];
}

export interface ParsedScenario {
	readonly name: string;
	readonly bullets: readonly string[];
}

export interface ParsedSpec {
	readonly requirements: readonly ParsedRequirement[];
}

function normalizeName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse a baseline or delta spec file into requirements + scenarios. Delta
 * specs use `## ADDED Requirements`, `## MODIFIED Requirements`, etc. as
 * group headers; those are treated as structural separators and do NOT
 * become requirements themselves. Only `### Requirement: <name>` blocks
 * become requirements.
 */
export function parseSpec(content: string): ParsedSpec {
	const lines = content.split("\n");
	const requirements: ParsedRequirement[] = [];
	let current: {
		name: string;
		headerLine: number;
		bodyLines: string[];
		scenarios: ParsedScenario[];
		activeScenario: { name: string; bullets: string[] } | null;
	} | null = null;

	const flushRequirement = () => {
		if (!current) return;
		if (current.activeScenario) {
			current.scenarios.push({
				name: current.activeScenario.name,
				bullets: [...current.activeScenario.bullets],
			});
		}
		const normativeLine =
			current.bodyLines.find((l) => l.trim().length > 0) ?? "";
		requirements.push({
			name: current.name,
			normalizedName: normalizeName(current.name),
			headerLine: current.headerLine,
			normativeLine: normativeLine.trim(),
			scenarios: current.scenarios,
		});
		current = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const reqMatch = line.match(/^###\s+Requirement:\s+(.+?)\s*$/);
		if (reqMatch) {
			flushRequirement();
			current = {
				name: reqMatch[1],
				headerLine: i + 1,
				bodyLines: [],
				scenarios: [],
				activeScenario: null,
			};
			continue;
		}
		if (!current) continue;
		const scenarioMatch = line.match(/^####\s+Scenario:\s+(.+?)\s*$/);
		if (scenarioMatch) {
			if (current.activeScenario) {
				current.scenarios.push({
					name: current.activeScenario.name,
					bullets: [...current.activeScenario.bullets],
				});
			}
			current.activeScenario = { name: scenarioMatch[1], bullets: [] };
			continue;
		}
		if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
			// Left the requirement block via a new ## or ### header.
			flushRequirement();
			continue;
		}
		if (current.activeScenario) {
			const bulletMatch = line.match(/^\s*-\s+(.+)$/);
			if (bulletMatch) {
				current.activeScenario.bullets.push(bulletMatch[1].trim());
			}
		} else {
			current.bodyLines.push(line);
		}
	}
	flushRequirement();

	return { requirements };
}

/**
 * Extract the names of requirements appearing under `## REMOVED Requirements`
 * in a delta spec. The group header bounds the scan; any `### Requirement:`
 * inside it until the next `## ` is considered removed.
 */
export function parseRemovedRequirements(content: string): string[] {
	const lines = content.split("\n");
	const removed: string[] = [];
	let inRemoved = false;
	for (const line of lines) {
		if (/^##\s+REMOVED Requirements\s*$/.test(line)) {
			inRemoved = true;
			continue;
		}
		if (inRemoved && /^##\s+/.test(line)) {
			inRemoved = false;
			continue;
		}
		if (!inRemoved) continue;
		const match = line.match(/^###\s+Requirement:\s+(.+?)\s*$/);
		if (match) {
			removed.push(match[1]);
		}
	}
	return removed;
}

function loadDeltaSpecs(env: VerifyEnv): {
	readonly capability: string;
	readonly path: string;
	readonly parsed: ParsedSpec;
	readonly raw: string;
}[] {
	const deltaRoot = join(changeDir(env), "specs");
	if (!existsSync(deltaRoot)) return [];
	const result: {
		capability: string;
		path: string;
		parsed: ParsedSpec;
		raw: string;
	}[] = [];
	const entries = readdirSync(deltaRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const specPath = join(deltaRoot, entry.name, "spec.md");
		if (!existsSync(specPath)) continue;
		const raw = readFileSync(specPath, "utf8");
		result.push({
			capability: entry.name,
			path: relative(env.repoRoot, specPath),
			parsed: parseSpec(raw),
			raw,
		});
	}
	return result;
}

/**
 * Enumerate pairings between a delta spec's requirements and the
 * corresponding baseline requirements. A pairing exists when a
 * baseline requirement has the same normalized name as a delta
 * requirement; each scenario on either side also emits a pairing.
 */
function enumeratePairings(
	capability: string,
	deltaPath: string,
	delta: ParsedSpec,
	baselinePath: string,
	baseline: ParsedSpec,
): Pairing[] {
	const pairings: Pairing[] = [];
	const baselineByName = new Map<string, ParsedRequirement>();
	for (const req of baseline.requirements) {
		baselineByName.set(req.normalizedName, req);
	}
	for (const req of delta.requirements) {
		const match = baselineByName.get(req.normalizedName);
		if (!match) continue;
		pairings.push({
			capability,
			delta_path: deltaPath,
			delta_anchor: `Requirement: ${req.name}`,
			baseline_path: baselinePath,
			baseline_anchor: `Requirement: ${match.name}`,
			delta_excerpt: req.normativeLine,
			baseline_excerpt: match.normativeLine,
		});
		const baselineScenariosByName = new Map<string, ParsedScenario>();
		for (const sc of match.scenarios) {
			baselineScenariosByName.set(normalizeName(sc.name), sc);
		}
		for (const ds of req.scenarios) {
			const bs = baselineScenariosByName.get(normalizeName(ds.name));
			if (!bs) continue;
			pairings.push({
				capability,
				delta_path: deltaPath,
				delta_anchor: `Requirement: ${req.name} / Scenario: ${ds.name}`,
				baseline_path: baselinePath,
				baseline_anchor: `Requirement: ${match.name} / Scenario: ${bs.name}`,
				delta_excerpt: ds.bullets.join(" | "),
				baseline_excerpt: bs.bullets.join(" | "),
			});
		}
	}
	return pairings;
}

/**
 * Walk every baseline spec file and look for lines that literally contain
 * one of the removed requirement titles. Only a ±3-line window around each
 * match is included. Returns one RippleCandidate per match.
 */
function findRippleCandidates(
	env: VerifyEnv,
	removedTitles: readonly string[],
): RippleCandidate[] {
	if (removedTitles.length === 0) return [];
	const root = baselineSpecsDir(env);
	if (!existsSync(root)) return [];
	const specPaths: string[] = [];
	const capabilities = readdirSync(root, { withFileTypes: true });
	for (const cap of capabilities) {
		if (!cap.isDirectory()) continue;
		const specPath = join(root, cap.name, "spec.md");
		if (existsSync(specPath)) specPaths.push(specPath);
	}
	const out: RippleCandidate[] = [];
	for (const title of removedTitles) {
		for (const specPath of specPaths) {
			const content = readFileSync(specPath, "utf8");
			// Skip the baseline spec we would be about to archive into
			// (the capability directory name that matches the removed title's
			// owning delta). This is cheap and avoids trivially matching the
			// about-to-be-modified baseline itself.
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (!lines[i].includes(title)) continue;
				const start = Math.max(0, i - 3);
				const end = Math.min(lines.length, i + 4);
				const excerpt = lines.slice(start, end).join("\n");
				out.push({
					removed_requirement: title,
					baseline_path: relative(env.repoRoot, specPath),
					line: i + 1,
					excerpt,
				});
			}
		}
	}
	return out;
}

function buildErrorReport(
	env: VerifyEnv,
	modifiedCapabilities: readonly string[],
	error: VerifyError,
): VerifyReport {
	return {
		schema_version: VERIFY_SCHEMA_VERSION,
		change_id: env.changeId,
		modified_capabilities: modifiedCapabilities,
		pairings: [],
		ripple_candidates: [],
		error,
	};
}

export function runVerify(env: VerifyEnv): VerifyResult {
	const proposalPath = join(changeDir(env), "proposal.md");
	if (!existsSync(proposalPath)) {
		const err: VerifyError = {
			code: "missing_baseline",
			capability: "<proposal.md>",
			parse_reason: `proposal.md not found at ${proposalPath}`,
		};
		return {
			ok: false,
			report: buildErrorReport(env, [], err),
		};
	}
	const proposal = readFileSync(proposalPath, "utf8");
	const modified = parseModifiedCapabilities(proposal);

	if (modified.length === 0) {
		return {
			ok: true,
			report: {
				schema_version: VERIFY_SCHEMA_VERSION,
				change_id: env.changeId,
				modified_capabilities: [],
				pairings: [],
				ripple_candidates: [],
				reason: "no_modified_capabilities",
			},
		};
	}

	// Resolve baselines; stop on first error to keep the blocking contract
	// simple and deterministic.
	const baselines: { capability: string; path: string; parsed: ParsedSpec }[] =
		[];
	for (const cap of modified) {
		const path = baselineSpecPath(env, cap);
		if (!existsSync(path)) {
			return {
				ok: false,
				report: buildErrorReport(env, modified, {
					code: "missing_baseline",
					capability: cap,
				}),
			};
		}
		let raw: string;
		try {
			raw = readFileSync(path, "utf8");
		} catch (reason) {
			return {
				ok: false,
				report: buildErrorReport(env, modified, {
					code: "unparseable_baseline",
					capability: cap,
					parse_reason: `read failed: ${(reason as Error).message}`,
				}),
			};
		}
		const parsed = parseSpec(raw);
		if (parsed.requirements.length === 0 && !/^##\s+Requirements/m.test(raw)) {
			return {
				ok: false,
				report: buildErrorReport(env, modified, {
					code: "unparseable_baseline",
					capability: cap,
					parse_reason:
						"baseline spec has no `### Requirement:` blocks under `## Requirements`",
				}),
			};
		}
		baselines.push({
			capability: cap,
			path: relative(env.repoRoot, path),
			parsed,
		});
	}

	const deltas = loadDeltaSpecs(env);
	const deltaByCap = new Map<
		string,
		{ path: string; parsed: ParsedSpec; raw: string }
	>();
	for (const d of deltas) {
		deltaByCap.set(d.capability, d);
	}

	const pairings: Pairing[] = [];
	const removedTitles: string[] = [];
	for (const baseline of baselines) {
		const delta = deltaByCap.get(baseline.capability);
		if (!delta) continue;
		pairings.push(
			...enumeratePairings(
				baseline.capability,
				delta.path,
				delta.parsed,
				baseline.path,
				baseline.parsed,
			),
		);
		for (const title of parseRemovedRequirements(delta.raw)) {
			removedTitles.push(title);
		}
	}

	const ripple_candidates = findRippleCandidates(env, removedTitles);

	return {
		ok: true,
		report: {
			schema_version: VERIFY_SCHEMA_VERSION,
			change_id: env.changeId,
			modified_capabilities: modified,
			pairings,
			ripple_candidates,
		},
	};
}

export function verifyChange(repoRoot: string, changeId: string): VerifyResult {
	return runVerify({ repoRoot, changeId });
}

// ---------------------------------------------------------------------------
// Accepted-conflict writer: appends a row to the `## Accepted Spec Conflicts`
// section of `design.md`, creating the file if necessary. The writer ONLY
// touches that section; all other content is preserved byte-for-byte.
// ---------------------------------------------------------------------------

const ACCEPTED_SECTION_HEADER = "## Accepted Spec Conflicts";
const ACCEPTED_TABLE_HEADER =
	"| id | capability | delta_clause | baseline_clause | rationale | accepted_at |";
const ACCEPTED_TABLE_DIVIDER = "| --- | --- | --- | --- | --- | --- |";

export interface AcceptedConflictRow {
	readonly capability: string;
	readonly delta_clause: string;
	readonly baseline_clause: string;
	readonly rationale: string;
	/** ISO-8601 UTC timestamp, e.g. `2026-04-17T12:34:56Z`. */
	readonly accepted_at: string;
}

function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function nextAcceptedId(existing: string): string {
	const matches = Array.from(existing.matchAll(/\|\s*AC(\d+)\s*\|/g));
	let max = 0;
	for (const m of matches) {
		const n = Number.parseInt(m[1], 10);
		if (Number.isFinite(n) && n > max) max = n;
	}
	return `AC${max + 1}`;
}

export interface AppendAcceptedConflictResult {
	readonly id: string;
	readonly updatedContent: string;
}

/**
 * Compute the updated design.md content with the new accepted-conflict row.
 * Pure function — does not touch the filesystem. If `existing` is undefined
 * or empty, a new `## Accepted Spec Conflicts` section is created.
 */
export function appendAcceptedConflictContent(
	existing: string | undefined,
	row: AcceptedConflictRow,
): AppendAcceptedConflictResult {
	const base = existing ?? "";
	const id = nextAcceptedId(base);
	const rowLine = `| ${id} | ${escapeCell(row.capability)} | ${escapeCell(
		row.delta_clause,
	)} | ${escapeCell(row.baseline_clause)} | ${escapeCell(row.rationale)} | ${escapeCell(row.accepted_at)} |`;

	const headerIdx = base.indexOf(ACCEPTED_SECTION_HEADER);
	if (headerIdx === -1) {
		const prefix =
			base.length === 0 || base.endsWith("\n\n")
				? base
				: base.endsWith("\n")
					? `${base}\n`
					: `${base}\n\n`;
		const section = [
			ACCEPTED_SECTION_HEADER,
			"",
			ACCEPTED_TABLE_HEADER,
			ACCEPTED_TABLE_DIVIDER,
			rowLine,
			"",
		].join("\n");
		return { id, updatedContent: `${prefix}${section}` };
	}

	// Section already exists. Find the table within it and append a row at
	// the end of the table block. The section ends at the next `## ` header
	// or EOF. Only the accepted-conflicts section is rewritten; everything
	// outside it is preserved exactly.
	const sectionStart = headerIdx;
	const after = base.slice(headerIdx + ACCEPTED_SECTION_HEADER.length);
	const nextHeaderMatch = after.match(/\n## (?!# )/);
	const sectionEnd =
		nextHeaderMatch && nextHeaderMatch.index !== undefined
			? headerIdx + ACCEPTED_SECTION_HEADER.length + nextHeaderMatch.index
			: base.length;

	const before = base.slice(0, sectionStart);
	const sectionBody = base.slice(sectionStart, sectionEnd);
	const afterSection = base.slice(sectionEnd);

	const lines = sectionBody.split("\n");
	let lastTableLineIdx = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].startsWith("|")) {
			lastTableLineIdx = i;
			break;
		}
	}

	let newSectionBody: string;
	if (lastTableLineIdx === -1) {
		// Header present but no table yet — inject a full table.
		const rebuilt = [
			ACCEPTED_SECTION_HEADER,
			"",
			ACCEPTED_TABLE_HEADER,
			ACCEPTED_TABLE_DIVIDER,
			rowLine,
			"",
		].join("\n");
		newSectionBody = rebuilt;
	} else {
		const updatedLines = [
			...lines.slice(0, lastTableLineIdx + 1),
			rowLine,
			...lines.slice(lastTableLineIdx + 1),
		];
		newSectionBody = updatedLines.join("\n");
	}

	return { id, updatedContent: `${before}${newSectionBody}${afterSection}` };
}
