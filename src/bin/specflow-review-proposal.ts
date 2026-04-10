import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import { tryGit } from "../lib/git.js";
import {
	actionableCount,
	applyStillOpenSeverityOverrides,
	backupAndWriteLedger,
	clearLedgerFindings,
	computeStatus,
	computeSummary,
	emptyLedger,
	incrementRound,
	ledgerSnapshot,
	matchFindings,
	matchRereview,
	persistMaxFindingId,
	readLedger,
	severitySummary,
	validateLedger,
	type LedgerConfig,
} from "../lib/review-ledger.js";
import {
	buildPrompt,
	callCodex,
	errorJson,
	readPrompt,
	renderCurrentPhase,
} from "../lib/review-runtime.js";
import type {
	ReviewFinding,
	ReviewLedger,
	ReviewPayload,
	ReviewResult,
} from "../types/contracts.js";

const LEDGER_CONFIG: LedgerConfig = {
	filename: "review-ledger-proposal.json",
	defaultPhase: "proposal",
};

function notInGitRepo(): never {
	process.stdout.write('{"status":"error","error":"not_in_git_repo"}\n');
	process.exit(1);
}

function ensureGitRepo(): string {
	const result = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
	if (result.status !== 0) {
		notInGitRepo();
	}
	return result.stdout.trim();
}

function die(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function readProposal(changeDir: string): string {
	return readFileSync(resolve(changeDir, "proposal.md"), "utf8");
}

function buildReviewPrompt(runtimeRoot: string, changeDir: string): string {
	return [
		readPrompt(runtimeRoot, "review_proposal_prompt.md").trimEnd(),
		buildPrompt([["PROPOSAL CONTENT", readProposal(changeDir)]]),
	].join("\n\n");
}

function buildRereviewPrompt(
	runtimeRoot: string,
	changeDir: string,
	previousFindings: readonly ReviewFinding[],
	maxFindingId: number,
): string {
	return [
		readPrompt(runtimeRoot, "review_proposal_rereview_prompt.md").trimEnd(),
		buildPrompt([
			["PREVIOUS_FINDINGS", JSON.stringify(previousFindings)],
			["MAX_FINDING_ID", String(maxFindingId)],
			["PROPOSAL CONTENT", readProposal(changeDir)],
		]),
	].join("\n\n");
}

function reviewPayload(
	reviewJson: Record<string, unknown>,
	rereviewMode: boolean,
	parseError: boolean,
	rawResponse: string,
): ReviewPayload {
	return {
		decision: String(reviewJson.decision ?? "UNKNOWN"),
		summary: String(reviewJson.summary ?? ""),
		findings: Array.isArray(reviewJson.findings)
			? (reviewJson.findings as ReviewFinding[])
			: [],
		rereview_mode: rereviewMode,
		parse_error: parseError,
		raw_response: parseError ? rawResponse : null,
	};
}

function resultFromLedger(
	action: string,
	changeId: string,
	reviewJson: Record<string, unknown>,
	rereviewMode: boolean,
	parseError: boolean,
	rawResponse: string,
	ledger: ReviewLedger,
	rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null,
): ReviewResult {
	const actionable = actionableCount(ledger);
	return {
		status: "success",
		action,
		change_id: changeId,
		review: reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
		ledger: ledgerSnapshot(ledger),
		autofix: null,
		handoff: {
			state: actionable > 0 ? "review_with_findings" : "review_no_findings",
			actionable_count: actionable,
			severity_summary: severitySummary(ledger),
		},
		rereview_classification: rereviewClassification,
		error: null,
	};
}

function runReviewPipeline(
	runtimeRoot: string,
	projectRoot: string,
	changeDir: string,
	action: string,
	changeId: string,
	rereviewMode: boolean,
): ReviewResult {
	process.stderr.write("Reading proposal...\n");
	if (!existsSync(resolve(changeDir, "proposal.md"))) {
		return {
			...errorJson(action, changeId, "missing_proposal"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}

	process.stderr.write("Calling Codex for proposal review...\n");
	const prompt = rereviewMode
		? (() => {
				const priorLedger = readLedger(changeDir, LEDGER_CONFIG).ledger;
				const previousFindings = (priorLedger.findings ?? []).filter(
					(finding) => String(finding.status ?? "") !== "resolved",
				);
				return buildRereviewPrompt(
					runtimeRoot,
					changeDir,
					previousFindings,
					Number(priorLedger.max_finding_id ?? 0),
				);
			})()
		: buildReviewPrompt(runtimeRoot, changeDir);
	const codexResult = callCodex<Record<string, unknown>>(projectRoot, prompt);

	let parseError = false;
	let rawResponse = "";
	let reviewJson: Record<string, unknown> = {
		decision: "UNKNOWN",
		findings: [],
		summary: "parse failed",
	};

	if (!codexResult.ok) {
		if (codexResult.exitCode) {
			return {
				...errorJson(action, changeId, `codex_exit_${codexResult.exitCode}`),
				review: null,
				ledger: null,
				autofix: null,
				handoff: null,
			};
		}
		parseError = true;
		rawResponse = codexResult.rawResponse;
	} else if (codexResult.payload) {
		reviewJson = codexResult.payload;
	}

	const ledgerRead = readLedger(changeDir, LEDGER_CONFIG);
	if (ledgerRead.status === "prompt_user") {
		return {
			status: "success",
			action,
			change_id: changeId,
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
			ledger_recovery: "prompt_user",
			error: null,
		};
	}

	let ledger = ledgerRead.ledger;
	const validated = validateLedger(ledger);
	ledger = validated.ledger;

	let rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null = null;
	if (!parseError) {
		ledger = incrementRound(ledger);
		const round = Number(ledger.current_round ?? 0);
		if (rereviewMode) {
			if (reviewJson.ledger_error === true) {
				ledger = clearLedgerFindings(ledger);
			}
			ledger = matchRereview(ledger, reviewJson, round);
			ledger = applyStillOpenSeverityOverrides(
				ledger,
				reviewJson.still_open_previous_findings,
			);
			rereviewClassification = {
				resolved: Array.isArray(reviewJson.resolved_previous_findings)
					? reviewJson.resolved_previous_findings.map((value) =>
							String((value as { id?: unknown }).id ?? value),
						)
					: [],
				still_open: Array.isArray(reviewJson.still_open_previous_findings)
					? reviewJson.still_open_previous_findings.map((value) =>
							String((value as { id?: unknown }).id ?? value),
						)
					: [],
				new_findings: Array.isArray(reviewJson.new_findings)
					? (reviewJson.new_findings as ReviewFinding[]).map((finding) =>
							String(finding.id ?? ""),
						)
					: [],
			};
		} else {
			ledger = matchFindings(
				ledger,
				Array.isArray(reviewJson.findings)
					? (reviewJson.findings as ReviewFinding[])
					: [],
				round,
			);
		}
		ledger = computeSummary(ledger, round);
		ledger = computeStatus(ledger);
		ledger = persistMaxFindingId(ledger);
		backupAndWriteLedger(
			changeDir,
			ledger,
			LEDGER_CONFIG,
			ledgerRead.status === "clean",
		);
		renderCurrentPhase(changeDir, ledger, "proposal", projectRoot);
	}

	return resultFromLedger(
		action,
		changeId,
		reviewJson,
		rereviewMode,
		parseError,
		rawResponse,
		ledger,
		rereviewClassification,
	);
}

function resetLedger(changeDir: string, changeId: string): void {
	const ledger = emptyLedger(changeId, LEDGER_CONFIG.defaultPhase);
	const path = resolve(changeDir, LEDGER_CONFIG.filename);
	writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
	process.stderr.write("Ledger reset to empty\n");
}

function ensureChangeDir(projectRoot: string, changeId: string): string {
	const changeDir = resolve(projectRoot, "openspec/changes", changeId);
	if (
		!existsSync(changeDir) ||
		!existsSync(resolve(changeDir, "proposal.md"))
	) {
		die(`Error: change directory not found: ${changeDir}`);
	}
	return changeDir;
}

function cmdReview(
	runtimeRoot: string,
	projectRoot: string,
	args: readonly string[],
): ReviewResult {
	const changeId = args[0];
	if (!changeId) {
		die("Usage: specflow-review-proposal review <CHANGE_ID> [--reset-ledger]");
	}
	const changeDir = ensureChangeDir(projectRoot, changeId);
	if (args.includes("--reset-ledger")) {
		resetLedger(changeDir, changeId);
	}
	return runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeDir,
		"review",
		changeId,
		false,
	);
}

function cmdFixReview(
	runtimeRoot: string,
	projectRoot: string,
	args: readonly string[],
): ReviewResult {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-proposal fix-review <CHANGE_ID> [--reset-ledger]",
		);
	}
	const changeDir = ensureChangeDir(projectRoot, changeId);
	if (args.includes("--reset-ledger")) {
		resetLedger(changeDir, changeId);
	}
	return runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeDir,
		"fix_review",
		changeId,
		true,
	);
}

function main(): void {
	const projectRoot = ensureGitRepo();
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const [subcommand = "", ...args] = process.argv.slice(2);
	let result: ReviewResult;
	switch (subcommand) {
		case "review":
			result = cmdReview(runtimeRoot, projectRoot, args);
			break;
		case "fix-review":
			result = cmdFixReview(runtimeRoot, projectRoot, args);
			break;
		case "":
			die(
				"Usage: specflow-review-proposal <review|fix-review> <CHANGE_ID> [options]",
			);
			return;
		default:
			die(`Error: unknown subcommand '${subcommand}'. Use: review, fix-review`);
	}
	printSchemaJson("review-proposal-result", result);
}

main();
