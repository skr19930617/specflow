import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { DiffSummary, ReviewLedger } from "../types/contracts.js";
import { atomicWriteText } from "./fs.js";
import { currentBranch, recentChanges } from "./git.js";
import { extractJsonFromMarkdown } from "./json.js";
import { resolveCommand, tryExec } from "./process.js";
import { actionableCount } from "./review-ledger.js";

export interface ReviewConfig {
	readonly diffWarnThreshold: number;
	readonly maxAutofixRounds: number;
}

export interface CodexCallResult<T> {
	readonly ok: boolean;
	readonly exitCode?: number;
	readonly payload?: T;
	readonly rawResponse: string;
}

export interface DesignArtifacts {
	readonly proposal: string;
	readonly design: string;
	readonly tasks: string;
	readonly specs: string;
}

function configValue(content: string, key: string): string | null {
	const match = content.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
	return match ? match[1].trim() : null;
}

function readIntegerConfig(
	content: string,
	key: string,
	fallback: number,
	options: { min?: number; max?: number } = {},
): number {
	const raw = configValue(content, key);
	if (raw === null || raw.length === 0) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed)) {
		return fallback;
	}
	if (options.min !== undefined && parsed < options.min) {
		return fallback;
	}
	if (options.max !== undefined && parsed > options.max) {
		return fallback;
	}
	return parsed;
}

export function readReviewConfig(projectRoot: string): ReviewConfig {
	const configPath = resolve(projectRoot, "openspec/config.yaml");
	if (!existsSync(configPath)) {
		return {
			diffWarnThreshold: 1000,
			maxAutofixRounds: 4,
		};
	}
	const content = readFileSync(configPath, "utf8");
	return {
		diffWarnThreshold: readIntegerConfig(content, "diff_warn_threshold", 1000, {
			min: 0,
		}),
		maxAutofixRounds: readIntegerConfig(content, "max_autofix_rounds", 4, {
			min: 1,
			max: 10,
		}),
	};
}

export function validateChangeDir(
	projectRoot: string,
	changeId: string,
): string {
	const changeDir = resolve(projectRoot, "openspec/changes", changeId);
	if (!existsSync(changeDir)) {
		throw new Error(`Error: change directory not found: ${changeDir}`);
	}
	if (!existsSync(resolve(changeDir, "proposal.md"))) {
		throw new Error(`Error: proposal.md not found in ${changeDir}`);
	}
	return changeDir;
}

export function errorJson(action: string, changeId: string, error: string) {
	return {
		status: "error",
		action,
		change_id: changeId,
		error,
	};
}

export function resolvePromptPath(
	runtimeRoot: string,
	promptFile: string,
): string {
	const installed = resolve(
		process.env.HOME ?? "",
		".config/specflow/global/prompts",
		promptFile,
	);
	if (existsSync(installed)) {
		return installed;
	}
	const local = resolve(runtimeRoot, "dist/package/global/prompts", promptFile);
	if (existsSync(local)) {
		return local;
	}
	throw new Error(`Error: prompt not found: ${promptFile}`);
}

export function readPrompt(runtimeRoot: string, promptFile: string): string {
	return readFileSync(resolvePromptPath(runtimeRoot, promptFile), "utf8");
}

export function buildPrompt(parts: readonly [string, string][]): string {
	return parts
		.filter(([, content]) => content.length > 0)
		.map(([label, content]) => `${label}:\n${content}`)
		.join("\n\n");
}

export function callCodex<T>(
	cwd: string,
	promptContent: string,
): CodexCallResult<T> {
	const codex = resolveCommand("SPECFLOW_CODEX", "codex");
	const outputPath = join(
		tmpdir(),
		`specflow-codex-output-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);
	const result = tryExec(
		codex,
		["exec", "--full-auto", "--ephemeral", "-o", outputPath, promptContent],
		cwd,
	);
	let rawOutput = "";
	if (existsSync(outputPath)) {
		rawOutput = readFileSync(outputPath, "utf8");
		rmSync(outputPath, { force: true });
	}
	if (result.status !== 0) {
		return {
			ok: false,
			exitCode: result.status,
			rawResponse: rawOutput,
		};
	}
	if (!rawOutput.trim()) {
		return {
			ok: false,
			rawResponse: "",
		};
	}
	const parsed = extractJsonFromMarkdown<T>(rawOutput.trim());
	if (parsed === null) {
		return {
			ok: false,
			rawResponse: rawOutput.trim(),
		};
	}
	return {
		ok: true,
		payload: parsed,
		rawResponse: rawOutput.trim(),
	};
}

export function renderCurrentPhase(
	changeDir: string,
	ledger: ReviewLedger,
	kind: "apply" | "design" | "proposal",
	cwd: string,
): void {
	const currentRound = Number(ledger.current_round ?? 1);
	const phase =
		kind === "proposal"
			? currentRound <= 1
				? "proposal-review"
				: "proposal-fix-review"
			: kind === "apply"
				? currentRound <= 1
					? "impl-review"
					: "fix-review"
				: currentRound <= 1
					? "design-review"
					: "design-fix-review";
	const openHigh = (ledger.findings ?? []).filter((finding) => {
		const severity = String(finding.severity ?? "");
		const status = String(finding.status ?? "");
		return severity === "high" && (status === "new" || status === "open");
	});
	const openHighStr =
		openHigh.length > 0
			? `${openHigh.length} 件 — "${openHigh.map((finding) => String(finding.title ?? "")).join('", "')}"`
			: "0 件";
	const acceptedRisks =
		(ledger.findings ?? [])
			.filter((finding) => {
				const status = String(finding.status ?? "");
				return status === "accepted_risk" || status === "ignored";
			})
			.map(
				(finding) =>
					`${String(finding.title ?? "")} (${String(finding.status ?? "")}, notes: "${String(finding.notes ?? "")}")`,
			)
			.join("\n") || "none";
	const actionable = actionableCount(ledger);
	const nextAction =
		kind === "proposal"
			? actionable > 0
				? "/specflow"
				: "/specflow"
			: kind === "apply"
				? actionable > 0
					? "/specflow.fix_apply"
					: "/specflow.approve"
				: actionable > 0
					? "/specflow.fix_design"
					: "/specflow.apply";

	atomicWriteText(
		resolve(changeDir, "current-phase.md"),
		[
			`# Current Phase: ${String(ledger.feature_id ?? basename(changeDir))}`,
			"",
			`- Phase: ${phase}`,
			`- Round: ${currentRound}`,
			`- Status: ${String(ledger.status ?? "in_progress")}`,
			`- Open High Findings: ${openHighStr}`,
			`- Actionable Findings: ${actionable}`,
			`- Accepted Risks: ${acceptedRisks}`,
			"- Latest Changes:",
			recentChanges(cwd),
			`- Next Recommended Action: ${nextAction}`,
			"",
		].join("\n"),
	);
	process.stderr.write("current-phase.md updated\n");
}

export function readDesignArtifacts(changeDir: string): DesignArtifacts | null {
	const proposalPath = resolve(changeDir, "proposal.md");
	const designPath = resolve(changeDir, "design.md");
	const tasksPath = resolve(changeDir, "tasks.md");
	if (!existsSync(designPath) || !existsSync(tasksPath)) {
		return null;
	}
	const specsDir = resolve(changeDir, "specs");
	const specs: string[] = [];
	const specFiles: string[] = [];
	if (existsSync(specsDir)) {
		const stack = [specsDir];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) {
				continue;
			}
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const entryPath = resolve(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(entryPath);
					continue;
				}
				if (entry.isFile() && entry.name === "spec.md") {
					specFiles.push(entryPath);
				}
			}
		}
	}
	for (const specFile of specFiles.sort()) {
		const relative = specFile.replace(`${changeDir}/`, "");
		specs.push(`--- ${relative} ---\n${readFileSync(specFile, "utf8")}`);
	}
	return {
		proposal: readFileSync(proposalPath, "utf8"),
		design: readFileSync(designPath, "utf8"),
		tasks: readFileSync(tasksPath, "utf8"),
		specs: specs.join("\n\n"),
	};
}

export function writeJsonTemp(prefix: string, value: string): string {
	const target = join(
		tmpdir(),
		`${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	writeFileSync(target, value, "utf8");
	return target;
}

export function warnValidationRevert(ids: readonly string[]): void {
	if (ids.length === 0) {
		return;
	}
	process.stderr.write(
		`[ledger] WARNING: Reverted high-severity findings with empty notes to 'open': ${ids.join(", ")}\n`,
	);
}

export function unresolvedHighCount(ledger: ReviewLedger): number {
	return (ledger.findings ?? []).filter((finding) => {
		const severity = String(finding.severity ?? "");
		const status = String(finding.status ?? "");
		return severity === "high" && (status === "new" || status === "open");
	}).length;
}

export function allHighTitles(ledger: ReviewLedger): string[] {
	return (ledger.findings ?? [])
		.filter((finding) => String(finding.severity ?? "") === "high")
		.map((finding) => String(finding.title ?? ""));
}

export function resolvedHighTitles(ledger: ReviewLedger): string[] {
	return (ledger.findings ?? [])
		.filter(
			(finding) =>
				String(finding.severity ?? "") === "high" &&
				String(finding.status ?? "") === "resolved",
		)
		.map((finding) => String(finding.title ?? ""));
}

export function newHighCount(
	current: readonly string[],
	previous: readonly string[],
): number {
	return current.filter((value) => !previous.includes(value)).length;
}

export function reemergedTitle(
	newlyResolved: readonly string[],
	unresolved: readonly string[],
): string | null {
	const unresolvedLower = unresolved.map((value) => value.toLowerCase());
	for (const value of newlyResolved) {
		const lower = value.toLowerCase();
		if (unresolvedLower.some((candidate) => candidate.includes(lower))) {
			return value;
		}
	}
	return null;
}

export function diffWarningSummary(
	summary: DiffSummary,
	threshold: number,
): DiffSummary {
	return {
		...summary,
		diff_warning: summary.total_lines > threshold,
	};
}

export function baseBranchLog(cwd: string): string {
	return recentChanges(cwd);
}

export function detectProjectName(targetPath: string): string {
	return basename(targetPath);
}

export function repoInitMessage(branch: string): string {
	return branch ? branch : currentBranch(process.cwd());
}
