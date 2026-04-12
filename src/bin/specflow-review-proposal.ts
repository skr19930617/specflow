import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tryGit } from "../lib/git.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import {
	actionableCount,
	applyStillOpenSeverityOverrides,
	backupAndWriteLedger,
	clearLedgerFindings,
	computeStatus,
	computeSummary,
	emptyLedger,
	incrementRound,
	type LedgerConfig,
	ledgerSnapshot,
	matchFindings,
	matchRereview,
	type ProposalRoundMetadata,
	persistMaxFindingId,
	readLedger,
	setProposalReviewMetadata,
	severitySummary,
	validateLedger,
} from "../lib/review-ledger.js";
import {
	buildPrompt,
	callCodex,
	errorJson,
	readPrompt,
	readReviewConfig,
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

type ProposalStopReason = "max_rounds_reached" | "no_progress";

interface ProposalGateEvaluation {
	readonly decision: string;
	readonly blockingCount: number;
	readonly blockingSignature: string;
	readonly proposalHash: string;
	readonly stagnantRounds: number;
	readonly maxRounds: number;
	readonly stopReason: ProposalStopReason | null;
	readonly state:
		| "review_approved"
		| "review_changes_requested"
		| "review_blocked"
		| ProposalStopReason;
	readonly gateBlocked: boolean;
}

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

function hashProposal(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function normalizeDecision(reviewJson: Record<string, unknown>): string {
	return String(reviewJson.decision ?? "UNKNOWN").toUpperCase();
}

function activeProposalFindings(ledger: ReviewLedger): ReviewFinding[] {
	return (ledger.findings ?? []).filter((finding) => {
		const status = String(finding.status ?? "");
		return status === "new" || status === "open";
	});
}

function blockingFindingsForDecision(
	ledger: ReviewLedger,
	decision: string,
): ReviewFinding[] {
	const active = activeProposalFindings(ledger);
	if (decision === "APPROVE") {
		return active.filter(
			(finding) => String(finding.severity ?? "") === "high",
		);
	}
	return active;
}

function blockingSignature(
	decision: string,
	blockingFindings: readonly ReviewFinding[],
): string {
	return [
		decision,
		...blockingFindings
			.map((finding) =>
				[
					String(finding.id ?? ""),
					String(finding.file ?? ""),
					String(finding.category ?? ""),
					String(finding.severity ?? ""),
					String(finding.title ?? ""),
				].join("|"),
			)
			.sort(),
	].join("||");
}

function proposalHandoffState(
	decision: string,
	blockingCount: number,
	stopReason: ProposalStopReason | null,
): ProposalGateEvaluation["state"] {
	if (stopReason) {
		return stopReason;
	}
	if (decision === "APPROVE" && blockingCount === 0) {
		return "review_approved";
	}
	if (decision === "REQUEST_CHANGES") {
		return "review_changes_requested";
	}
	return "review_blocked";
}

function proposalMetadata(
	evaluation: ProposalGateEvaluation,
): ProposalRoundMetadata {
	return {
		decision: evaluation.decision,
		proposalHash: evaluation.proposalHash,
		blockingCount: evaluation.blockingCount,
		blockingSignature: evaluation.blockingSignature,
		stagnantRounds: evaluation.stagnantRounds,
		maxRounds: evaluation.maxRounds,
		stopReason: evaluation.stopReason,
	};
}

function evaluateProposalGate(
	ledger: ReviewLedger,
	decision: string,
	proposalHash: string,
	maxRounds: number,
	rereviewMode: boolean,
): ProposalGateEvaluation {
	const blockingFindings = blockingFindingsForDecision(ledger, decision);
	const blockingCount = blockingFindings.length;
	const nextSignature = blockingSignature(decision, blockingFindings);
	const gateBlocked = !(decision === "APPROVE" && blockingCount === 0);
	const previousRound =
		Array.isArray(ledger.round_summaries) && ledger.round_summaries.length > 0
			? ledger.round_summaries[ledger.round_summaries.length - 1]
			: null;
	const sameHash =
		previousRound !== null &&
		String(previousRound.proposal_hash ?? "") === proposalHash;
	const sameBlocking =
		previousRound !== null &&
		String(previousRound.decision ?? "") === decision &&
		String(previousRound.blocking_signature ?? "") === nextSignature &&
		Number(previousRound.blocking_count ?? -1) === blockingCount;
	const stagnantRounds =
		rereviewMode && gateBlocked && (sameHash || sameBlocking)
			? Number(previousRound?.stagnant_rounds ?? 0) + 1
			: 0;
	const stopReason: ProposalStopReason | null =
		gateBlocked && Number(ledger.current_round ?? 0) >= maxRounds
			? "max_rounds_reached"
			: rereviewMode && gateBlocked && stagnantRounds >= 2
				? "no_progress"
				: null;

	return {
		decision,
		blockingCount,
		blockingSignature: nextSignature,
		proposalHash,
		stagnantRounds,
		maxRounds,
		stopReason,
		state: proposalHandoffState(decision, blockingCount, stopReason),
		gateBlocked,
	};
}

function hydrateProposalGateFromLedger(
	ledger: ReviewLedger,
	proposalHash: string,
	maxRounds: number,
): ProposalGateEvaluation {
	const latestRound =
		Array.isArray(ledger.round_summaries) && ledger.round_summaries.length > 0
			? ledger.round_summaries[ledger.round_summaries.length - 1]
			: null;
	const decision = String(
		ledger.latest_decision ?? latestRound?.decision ?? "UNKNOWN",
	).toUpperCase();
	const blockingFindings = blockingFindingsForDecision(ledger, decision);
	const blockingCount =
		typeof ledger.blocking_count === "number"
			? ledger.blocking_count
			: typeof latestRound?.blocking_count === "number"
				? latestRound.blocking_count
				: blockingFindings.length;
	const signature =
		typeof ledger.blocking_signature === "string" &&
		ledger.blocking_signature.length > 0
			? ledger.blocking_signature
			: typeof latestRound?.blocking_signature === "string" &&
					latestRound.blocking_signature.length > 0
				? latestRound.blocking_signature
				: blockingSignature(decision, blockingFindings);
	const stopReason =
		ledger.stop_reason === "max_rounds_reached" ||
		ledger.stop_reason === "no_progress"
			? ledger.stop_reason
			: latestRound?.stop_reason === "max_rounds_reached" ||
					latestRound?.stop_reason === "no_progress"
				? latestRound.stop_reason
				: null;
	const gateBlocked = !(decision === "APPROVE" && blockingCount === 0);
	return {
		decision,
		blockingCount,
		blockingSignature: signature,
		proposalHash,
		stagnantRounds: Number(
			ledger.stagnant_rounds ?? latestRound?.stagnant_rounds ?? 0,
		),
		maxRounds,
		stopReason,
		state: proposalHandoffState(decision, blockingCount, stopReason),
		gateBlocked,
	};
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
	review: ReviewPayload | null,
	ledger: ReviewLedger,
	handoff: ReviewResult["handoff"],
	rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null,
): ReviewResult {
	return {
		status: "success",
		action,
		change_id: changeId,
		review,
		ledger: ledgerSnapshot(ledger),
		autofix: null,
		handoff,
		rereview_classification: rereviewClassification,
		error: null,
	};
}

function buildProposalHandoff(
	ledger: ReviewLedger,
	evaluation: ProposalGateEvaluation,
): NonNullable<ReviewResult["handoff"]> {
	return {
		state: evaluation.state,
		actionable_count: actionableCount(ledger),
		severity_summary: severitySummary(ledger),
		decision: evaluation.decision,
		blocking_count: evaluation.blockingCount,
		max_rounds: evaluation.maxRounds,
		stop_reason: evaluation.stopReason,
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
	const proposalContent = readProposal(changeDir);
	const proposalHash = hashProposal(proposalContent);
	const config = readReviewConfig(projectRoot);
	const maxRounds = config.maxAutofixRounds;

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

	if (rereviewMode && Number(ledger.current_round ?? 0) >= maxRounds) {
		const preflight = hydrateProposalGateFromLedger(
			ledger,
			proposalHash,
			maxRounds,
		);
		if (preflight.gateBlocked) {
			const stopped: ProposalGateEvaluation = {
				...preflight,
				stopReason: "max_rounds_reached",
				state: "max_rounds_reached",
			};
			ledger = setProposalReviewMetadata(ledger, proposalMetadata(stopped));
			backupAndWriteLedger(
				changeDir,
				ledger,
				LEDGER_CONFIG,
				ledgerRead.status === "clean",
			);
			renderCurrentPhase(changeDir, ledger, "proposal", projectRoot);
			return resultFromLedger(
				action,
				changeId,
				null,
				ledger,
				buildProposalHandoff(ledger, stopped),
				null,
			);
		}
	}

	process.stderr.write("Calling Codex for proposal review...\n");
	const prompt = rereviewMode
		? buildRereviewPrompt(
				runtimeRoot,
				changeDir,
				(ledger.findings ?? []).filter(
					(finding) => String(finding.status ?? "") !== "resolved",
				),
				Number(ledger.max_finding_id ?? 0),
			)
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

	let rereviewClassification: {
		resolved: string[];
		still_open: string[];
		new_findings: string[];
	} | null = null;
	if (!parseError) {
		let candidate = incrementRound(ledger);
		const round = Number(candidate.current_round ?? 0);
		if (rereviewMode) {
			if (reviewJson.ledger_error === true) {
				candidate = clearLedgerFindings(candidate);
			}
			candidate = matchRereview(candidate, reviewJson, round);
			candidate = applyStillOpenSeverityOverrides(
				candidate,
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
			candidate = matchFindings(
				candidate,
				Array.isArray(reviewJson.findings)
					? (reviewJson.findings as ReviewFinding[])
					: [],
				round,
			);
		}

		const evaluation = evaluateProposalGate(
			candidate,
			normalizeDecision(reviewJson),
			proposalHash,
			maxRounds,
			rereviewMode,
		);

		if (evaluation.stopReason === "no_progress") {
			ledger = setProposalReviewMetadata(ledger, proposalMetadata(evaluation));
			backupAndWriteLedger(
				changeDir,
				ledger,
				LEDGER_CONFIG,
				ledgerRead.status === "clean",
			);
			renderCurrentPhase(changeDir, ledger, "proposal", projectRoot);
			return resultFromLedger(
				action,
				changeId,
				reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
				ledger,
				buildProposalHandoff(ledger, evaluation),
				rereviewClassification,
			);
		}

		candidate = computeSummary(candidate, round, proposalMetadata(evaluation));
		candidate = computeStatus(candidate);
		candidate = persistMaxFindingId(candidate);
		backupAndWriteLedger(
			changeDir,
			candidate,
			LEDGER_CONFIG,
			ledgerRead.status === "clean",
		);
		renderCurrentPhase(changeDir, candidate, "proposal", projectRoot);
		ledger = candidate;
		return resultFromLedger(
			action,
			changeId,
			reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
			ledger,
			buildProposalHandoff(ledger, evaluation),
			rereviewClassification,
		);
	}

	return resultFromLedger(
		action,
		changeId,
		reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
		ledger,
		null,
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
