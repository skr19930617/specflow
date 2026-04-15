import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { DiffSummary, ReviewLedger } from "../types/contracts.js";
import type { ChangeArtifactStore } from "./artifact-store.js";
import { ChangeArtifactType, changeRef } from "./artifact-types.js";
import { atomicWriteText } from "./fs.js";
import { currentBranch, recentChanges } from "./git.js";
import { extractJsonFromMarkdown } from "./json.js";
import { resolveCommand, tryExec } from "./process.js";
import {
	actionableCount,
	unresolvedCriticalHighCount,
} from "./review-ledger.js";

export interface ReviewConfig {
	readonly diffWarnThreshold: number;
	readonly maxAutofixRounds: number;
}

export type ReviewAgentName = "codex" | "claude";

export const REVIEW_AGENTS: readonly ReviewAgentName[] = ["codex", "claude"];

export type MainAgentName = "claude" | "codex" | "copilot";

export const MAIN_AGENTS: readonly MainAgentName[] = [
	"claude",
	"codex",
	"copilot",
];

export interface MainAgentResult {
	readonly ok: boolean;
	readonly exitCode?: number;
}

export interface ReviewCallResult<T> {
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

function callCodexDriver<T>(
	cwd: string,
	promptContent: string,
): ReviewCallResult<T> {
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
	return parseRawOutput(result.status, rawOutput);
}

function callClaudeReviewDriver<T>(
	cwd: string,
	promptContent: string,
): ReviewCallResult<T> {
	const claude = resolveCommand("SPECFLOW_CLAUDE", "claude");
	const args = ["-p", "--output-format", "text", "--no-session-persistence"];
	const result = tryExec(claude, args, cwd, undefined, promptContent);
	return parseRawOutput(result.status, result.stdout);
}

function parseRawOutput<T>(
	status: number,
	rawOutput: string,
): ReviewCallResult<T> {
	if (status !== 0) {
		return {
			ok: false,
			exitCode: status,
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

export function callReviewAgent<T>(
	agent: ReviewAgentName,
	cwd: string,
	promptContent: string,
): ReviewCallResult<T> {
	switch (agent) {
		case "codex":
			return callCodexDriver<T>(cwd, promptContent);
		case "claude":
			return callClaudeReviewDriver<T>(cwd, promptContent);
	}
}

export function loadConfigEnv(projectRoot: string): void {
	const configPath = resolve(projectRoot, ".specflow/config.env");
	if (!existsSync(configPath)) {
		return;
	}
	const content = readFileSync(configPath, "utf8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) {
			continue;
		}
		const key = trimmed.slice(0, eqIndex);
		const value = trimmed.slice(eqIndex + 1);
		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

export function resolveReviewAgent(flagValue?: string): ReviewAgentName {
	const raw = flagValue ?? process.env.SPECFLOW_REVIEW_AGENT ?? "codex";
	if (raw === "codex" || raw === "claude") {
		return raw;
	}
	process.stderr.write(
		`Warning: unknown review agent '${raw}', falling back to 'codex'\n`,
	);
	return "codex";
}

export function resolveMainAgent(flagValue?: string): MainAgentName {
	const raw = flagValue ?? process.env.SPECFLOW_MAIN_AGENT ?? "claude";
	if (raw === "claude" || raw === "codex" || raw === "copilot") {
		return raw;
	}
	process.stderr.write(
		`Warning: unknown main agent '${raw}', falling back to 'claude'\n`,
	);
	return "claude";
}

export function callMainAgent(
	agent: MainAgentName,
	cwd: string,
	promptContent: string,
): MainAgentResult {
	switch (agent) {
		case "codex": {
			const codex = resolveCommand("SPECFLOW_CODEX", "codex");
			const result = tryExec(
				codex,
				["exec", "--full-auto", "--ephemeral", promptContent],
				cwd,
			);
			return { ok: result.status === 0, exitCode: result.status || undefined };
		}
		case "claude": {
			const claude = resolveCommand("SPECFLOW_CLAUDE", "claude");
			const result = tryExec(
				claude,
				["-p", "--dangerously-skip-permissions", "--no-session-persistence"],
				cwd,
				undefined,
				promptContent,
			);
			return { ok: result.status === 0, exitCode: result.status || undefined };
		}
		case "copilot": {
			const copilot = resolveCommand("SPECFLOW_COPILOT", "copilot");
			const result = tryExec(
				copilot,
				["-p", "--allow-all-tools", "-s"],
				cwd,
				undefined,
				promptContent,
			);
			return { ok: result.status === 0, exitCode: result.status || undefined };
		}
	}
}

export function renderCurrentPhase(
	changeDir: string,
	ledger: ReviewLedger,
	kind: "apply" | "design" | "proposal",
	cwd: string,
): void {
	const currentRound = Number(ledger.current_round ?? 1);
	const latestRoundSummary =
		Array.isArray(ledger.round_summaries) && ledger.round_summaries.length > 0
			? ledger.round_summaries[ledger.round_summaries.length - 1]
			: null;
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
	const openHighCritical = (ledger.findings ?? []).filter((finding) => {
		const severity = String(finding.severity ?? "");
		const status = String(finding.status ?? "");
		return (
			(severity === "high" || severity === "critical") &&
			(status === "new" || status === "open")
		);
	});
	const openHighCriticalStr =
		openHighCritical.length > 0
			? `${openHighCritical.length} 件 — "${openHighCritical.map((finding) => String(finding.title ?? "")).join('", "')}"`
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
	// Severity-aware handoff: the "Next Recommended Action" depends only on
	// critical/high unresolved findings. LOW/MEDIUM stay visible via the
	// Actionable Findings line but never shift the primary handoff.
	const blocking = unresolvedCriticalHighCount(ledger);
	const proposalMaxRounds = Number(
		ledger.max_rounds ?? latestRoundSummary?.max_rounds ?? 0,
	);
	const proposalDecision = String(
		ledger.latest_decision ?? latestRoundSummary?.decision ?? "UNKNOWN",
	);
	const proposalBlockingCount = Number(
		ledger.blocking_count ?? latestRoundSummary?.blocking_count ?? 0,
	);
	const proposalStopReasonValue =
		ledger.stop_reason ?? latestRoundSummary?.stop_reason ?? null;
	const proposalStopReason =
		proposalStopReasonValue == null ||
		String(proposalStopReasonValue).length === 0
			? "none"
			: String(proposalStopReasonValue);
	const proposalCapReached =
		proposalStopReason === "max_rounds_reached" ||
		(proposalMaxRounds > 0 && currentRound >= proposalMaxRounds);
	const nextAction =
		kind === "proposal"
			? "/specflow"
			: kind === "apply"
				? blocking > 0
					? "/specflow.fix_apply"
					: "/specflow.approve"
				: blocking > 0
					? "/specflow.fix_design"
					: "/specflow.apply";

	atomicWriteText(
		resolve(changeDir, "current-phase.md"),
		[
			`# Current Phase: ${String(ledger.feature_id ?? basename(changeDir))}`,
			"",
			`- Phase: ${phase}`,
			`- Round: ${currentRound}`,
			...(kind === "proposal"
				? [
						`- Configured Round Cap: ${proposalMaxRounds > 0 ? proposalMaxRounds : "n/a"}`,
						`- Latest Decision: ${proposalDecision}`,
						`- Gate Blocking Findings: ${proposalBlockingCount}`,
						`- Cap Reached: ${proposalCapReached ? "yes" : "no"}`,
						`- Stop Reason: ${proposalStopReason}`,
					]
				: []),
			`- Status: ${String(ledger.status ?? "in_progress")}`,
			`- Open High/Critical Findings: ${openHighCriticalStr}`,
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

// --- Store-backed helpers ---

export function validateChangeFromStore(
	store: ChangeArtifactStore,
	changeId: string,
): void {
	if (!store.changeExists(changeId)) {
		throw new Error(`Error: change not found: ${changeId}`);
	}
	if (!store.exists(changeRef(changeId, ChangeArtifactType.Proposal))) {
		throw new Error(`Error: proposal.md not found for change: ${changeId}`);
	}
}

export function readDesignArtifactsFromStore(
	store: ChangeArtifactStore,
	changeId: string,
): DesignArtifacts | null {
	const designRef = changeRef(changeId, ChangeArtifactType.Design);
	const tasksRef = changeRef(changeId, ChangeArtifactType.Tasks);
	if (!store.exists(designRef) || !store.exists(tasksRef)) {
		return null;
	}
	const proposalRef = changeRef(changeId, ChangeArtifactType.Proposal);
	const specRefs = store.list({
		changeId,
		type: ChangeArtifactType.SpecDelta,
	});
	const specs = [...specRefs]
		.map((ref) => {
			const qualifier = "qualifier" in ref ? ref.qualifier : "";
			return `--- specs/${qualifier}/spec.md ---\n${store.read(ref)}`;
		})
		.sort()
		.join("\n\n");
	return {
		proposal: store.read(proposalRef),
		design: store.read(designRef),
		tasks: store.read(tasksRef),
		specs,
	};
}

export function renderCurrentPhaseToStore(
	store: ChangeArtifactStore,
	changeId: string,
	ledger: ReviewLedger,
	kind: "apply" | "design" | "proposal",
	cwd: string,
): void {
	const currentRound = Number(ledger.current_round ?? 1);
	const latestRoundSummary =
		Array.isArray(ledger.round_summaries) && ledger.round_summaries.length > 0
			? ledger.round_summaries[ledger.round_summaries.length - 1]
			: null;
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
	const openHighCritical = (ledger.findings ?? []).filter((finding) => {
		const severity = String(finding.severity ?? "");
		const status = String(finding.status ?? "");
		return (
			(severity === "high" || severity === "critical") &&
			(status === "new" || status === "open")
		);
	});
	const openHighCriticalStr =
		openHighCritical.length > 0
			? `${openHighCritical.length} 件 — "${openHighCritical.map((finding) => String(finding.title ?? "")).join('", "')}"`
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
	// Severity-aware handoff — see renderCurrentPhase for details.
	const blocking = unresolvedCriticalHighCount(ledger);
	const proposalMaxRounds = Number(
		ledger.max_rounds ?? latestRoundSummary?.max_rounds ?? 0,
	);
	const proposalDecision = String(
		ledger.latest_decision ?? latestRoundSummary?.decision ?? "UNKNOWN",
	);
	const proposalBlockingCount = Number(
		ledger.blocking_count ?? latestRoundSummary?.blocking_count ?? 0,
	);
	const proposalStopReasonValue =
		ledger.stop_reason ?? latestRoundSummary?.stop_reason ?? null;
	const proposalStopReason =
		proposalStopReasonValue == null ||
		String(proposalStopReasonValue).length === 0
			? "none"
			: String(proposalStopReasonValue);
	const proposalCapReached =
		proposalStopReason === "max_rounds_reached" ||
		(proposalMaxRounds > 0 && currentRound >= proposalMaxRounds);
	const nextAction =
		kind === "proposal"
			? "/specflow"
			: kind === "apply"
				? blocking > 0
					? "/specflow.fix_apply"
					: "/specflow.approve"
				: blocking > 0
					? "/specflow.fix_design"
					: "/specflow.apply";

	store.write(
		changeRef(changeId, ChangeArtifactType.CurrentPhase),
		[
			`# Current Phase: ${String(ledger.feature_id ?? changeId)}`,
			"",
			`- Phase: ${phase}`,
			`- Round: ${currentRound}`,
			...(kind === "proposal"
				? [
						`- Configured Round Cap: ${proposalMaxRounds > 0 ? proposalMaxRounds : "n/a"}`,
						`- Latest Decision: ${proposalDecision}`,
						`- Gate Blocking Findings: ${proposalBlockingCount}`,
						`- Cap Reached: ${proposalCapReached ? "yes" : "no"}`,
						`- Stop Reason: ${proposalStopReason}`,
					]
				: []),
			`- Status: ${String(ledger.status ?? "in_progress")}`,
			`- Open High/Critical Findings: ${openHighCriticalStr}`,
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

export function readProposalFromStore(
	store: ChangeArtifactStore,
	changeId: string,
): string {
	return store.read(changeRef(changeId, ChangeArtifactType.Proposal));
}

export function contentHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}
