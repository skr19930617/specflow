import { resolve } from "node:path";
import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import { ReviewLedgerKind } from "../lib/artifact-types.js";
import {
	buildAutofixReviewCompletedPayload,
	buildAutofixRoundPayload,
	publishAutofixReviewCompleted,
} from "../lib/autofix-event-builder.js";
import {
	buildAutofixCountersFromRound,
	findRoundSummary,
	ledgerRoundIdFor,
	startAutofixHeartbeat,
	writeAutofixSnapshot,
	ZERO_AUTOFIX_COUNTERS,
} from "../lib/autofix-progress-snapshot.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import { withLockedPublisher } from "../lib/local-fs-observation-event-publisher.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { createLocalWorkspaceContext } from "../lib/local-workspace-context.js";
import { emitGateOpened } from "../lib/observation-event-emitter.js";
import { moduleRepoRoot, printSchemaJson, tryExec } from "../lib/process.js";
import {
	issueReviewDecisionGate,
	type ReviewPhase,
	type ReviewRoundProvenance,
} from "../lib/review-decision-gate.js";
import {
	actionableCount,
	computeScore,
	computeStatus,
	computeSummary,
	highFindingTitles,
	incrementRound,
	ledgerSnapshot,
	matchFindings,
	matchRereview,
	openHighFindings,
	patchLatestRoundGateId,
	persistMaxFindingId,
	readLedgerFromStore,
	resolvedHighFindingTitles,
	severitySummary,
	unresolvedCriticalHighCount,
	validateLedger,
	writeLedgerToStore,
} from "../lib/review-ledger.js";
import {
	buildPrompt,
	callMainAgent,
	callReviewAgent,
	diffWarningSummary,
	errorJson,
	loadConfigEnv,
	type MainAgentName,
	type ReviewAgentName,
	readPrompt,
	readProposalFromStore,
	readReviewConfig,
	renderCurrentPhaseToStore,
	resolveMainAgent,
	resolveReviewAgent,
	validateChangeFromStore,
} from "../lib/review-runtime.js";
import { findLatestRun } from "../lib/run-store-ops.js";
import type { WorkspaceContext } from "../lib/workspace-context.js";
import { resolveChangeRootForRun } from "../lib/worktree-resolver.js";
import {
	type AutofixProgressSnapshot,
	buildStartingSnapshot,
} from "../types/autofix-progress.js";
import type {
	AutofixRoundScore,
	DiffSummary,
	DivergenceWarning,
	ReviewFinding,
	ReviewLedger,
	ReviewPayload,
	ReviewResult,
} from "../types/contracts.js";
import type { ReviewFindingSnapshot } from "../types/gate-records.js";
import type {
	AutofixLoopState,
	AutofixRoundCounters,
	AutofixTerminalOutcome,
} from "../types/observation-events.js";

function notInGitRepo(): never {
	process.stdout.write('{"status":"error","error":"not_in_git_repo"}\n');
	process.exit(1);
}

function die(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

const REVIEW_EXCLUDE_GLOBS = [
	"*/review-ledger.json",
	"*/review-ledger.json.bak",
	"*/review-ledger.json.corrupt",
	"*/current-phase.md",
];

function diffFilter(ctx: WorkspaceContext): {
	diff: string;
	summary: DiffSummary | "empty";
} {
	const result = ctx.filteredDiff(REVIEW_EXCLUDE_GLOBS);
	// Deleted files and other excluded-only entries can produce a non-empty
	// summary with an empty patch body. Review should still short-circuit.
	if (result.diff === "") {
		return { diff: "", summary: "empty" };
	}
	return result;
}

async function buildReviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	diff: string,
): Promise<string> {
	return [
		readPrompt(runtimeRoot, "review_apply_prompt.md").trimEnd(),
		buildPrompt([
			["CURRENT GIT DIFF", diff],
			["PROPOSAL CONTENT", await readProposalFromStore(changeStore, changeId)],
		]),
	].join("\n\n");
}

async function buildRereviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	diff: string,
	previousFindings: readonly ReviewFinding[],
	maxFindingId: number,
): Promise<string> {
	return [
		readPrompt(runtimeRoot, "review_apply_rereview_prompt.md").trimEnd(),
		buildPrompt([
			["PREVIOUS_FINDINGS", JSON.stringify(previousFindings)],
			["MAX_FINDING_ID", String(maxFindingId)],
			["CURRENT GIT DIFF", diff],
			["PROPOSAL CONTENT", await readProposalFromStore(changeStore, changeId)],
		]),
	].join("\n\n");
}

async function buildFixPrompt(
	changeStore: ChangeArtifactStore,
	changeId: string,
	diff: string,
	findings: readonly ReviewFinding[],
): Promise<string> {
	return [
		"You are a code fixer. Based on the review findings below, fix all issues in the codebase.",
		"Apply fixes for all findings. Do not skip any.",
		"",
		buildPrompt([
			["REVIEW FINDINGS", JSON.stringify(findings)],
			["CURRENT GIT DIFF", diff],
			["PROPOSAL CONTENT", await readProposalFromStore(changeStore, changeId)],
		]),
	].join("\n");
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
	diffSummary: DiffSummary,
	diffWarnThreshold: number,
): ReviewResult {
	const publicDiffSummary = {
		total_lines: diffSummary.total_lines,
		excluded_count: diffSummary.excluded_count,
		included_count: diffSummary.included_count,
		diff_warning: diffSummary.diff_warning,
		threshold: diffWarnThreshold,
	};
	const actionable = actionableCount(ledger);
	// Gate the handoff state on the HIGH+ (critical+high) unresolved count
	// per review-orchestration spec, NOT the all-severity actionable count.
	// LOW/MEDIUM findings remain visible via severity_summary and the
	// approval-summary Remaining Risks aggregation.
	const blocking = unresolvedCriticalHighCount(ledger);
	return {
		status: "success",
		action,
		change_id: changeId,
		review: reviewPayload(reviewJson, rereviewMode, parseError, rawResponse),
		ledger: ledgerSnapshot(ledger),
		autofix: null,
		handoff: {
			state: blocking > 0 ? "review_with_findings" : "review_no_findings",
			actionable_count: actionable,
			severity_summary: severitySummary(ledger),
		},
		diff_summary: publicDiffSummary,
		error: null,
	};
}

async function runReviewPipeline(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	ctx: WorkspaceContext,
	changeStore: ChangeArtifactStore,
	action: string,
	changeId: string,
	rereviewMode: boolean,
	skipDiffCheck: boolean,
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	process.stderr.write("Running diff filter...\n");
	const rawDiff = diffFilter(ctx);
	if (rawDiff.summary === "empty") {
		return {
			...errorJson(action, changeId, "no_changes"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}
	const config = readReviewConfig(projectRoot);
	let diff = rawDiff.diff;
	let diffSummary = diffWarningSummary(
		rawDiff.summary,
		config.diffWarnThreshold,
	);
	if (diffSummary.diff_warning && !skipDiffCheck) {
		const publicDiffSummary = {
			total_lines: diffSummary.total_lines,
			excluded_count: diffSummary.excluded_count,
			included_count: diffSummary.included_count,
			diff_warning: diffSummary.diff_warning,
			threshold: config.diffWarnThreshold,
		};
		return {
			status: "warning",
			action,
			change_id: changeId,
			warning: "diff_threshold_exceeded",
			diff_summary: publicDiffSummary,
			diff_total_lines: diffSummary.total_lines,
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
			error: null,
		};
	}

	if (rereviewMode) {
		process.stderr.write(`Applying fixes via ${mainAgent}...\n`);
		const beforeFix = (
			await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Apply)
		).ledger;
		const fixFindings = (beforeFix.findings ?? []).filter((finding) => {
			const status = String(finding.status ?? "");
			return status === "new" || status === "open";
		});
		void callMainAgent(
			mainAgent,
			changeRoot,
			await buildFixPrompt(changeStore, changeId, diff, fixFindings),
		);
		const rerun = diffFilter(ctx);
		if (rerun.summary === "empty") {
			return {
				...errorJson(action, changeId, "no_changes"),
				review: null,
				ledger: null,
				autofix: null,
				handoff: null,
			};
		}
		diff = rerun.diff;
		diffSummary = diffWarningSummary(rerun.summary, config.diffWarnThreshold);
	}

	process.stderr.write(`Calling ${reviewAgent} for review...\n`);
	let prompt: string;
	if (rereviewMode) {
		const priorLedger = (
			await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Apply)
		).ledger;
		const previousFindings = (priorLedger.findings ?? []).filter(
			(finding) => String(finding.status ?? "") !== "resolved",
		);
		prompt = await buildRereviewPrompt(
			runtimeRoot,
			changeStore,
			changeId,
			diff,
			previousFindings,
			Number(priorLedger.max_finding_id ?? 0),
		);
	} else {
		prompt = await buildReviewPrompt(runtimeRoot, changeStore, changeId, diff);
	}
	const reviewResult = callReviewAgent<Record<string, unknown>>(
		reviewAgent,
		changeRoot,
		prompt,
	);

	let parseError = false;
	let rawResponse = "";
	let reviewJson: Record<string, unknown> = {
		decision: "UNKNOWN",
		findings: [],
		summary: "parse failed",
	};

	if (!reviewResult.ok) {
		if (reviewResult.exitCode) {
			return {
				...errorJson(
					action,
					changeId,
					`review_agent_exit_${reviewResult.exitCode}`,
				),
				review: null,
				ledger: null,
				autofix: null,
				handoff: null,
			};
		}
		parseError = true;
		rawResponse = reviewResult.rawResponse;
	} else if (reviewResult.payload) {
		reviewJson = reviewResult.payload;
	}

	const ledgerRead = await readLedgerFromStore(
		changeStore,
		changeId,
		ReviewLedgerKind.Apply,
	);
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
	if (validated.warnings.length > 0) {
		process.stderr.write(
			`[ledger] WARNING: Reverted high-severity findings with empty notes to 'open': ${validated.warnings.join(", ")}\n`,
		);
	}

	if (!parseError) {
		ledger = incrementRound(ledger);
		const round = Number(ledger.current_round ?? 0);
		if (rereviewMode) {
			ledger = matchRereview(ledger, reviewJson, round);
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
		await writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Apply,
			ledger,
			ledgerRead.status === "clean",
		);
		await renderCurrentPhaseToStore(
			changeStore,
			changeId,
			ledger,
			"apply",
			changeRoot,
		);
	}

	// Issue a review_decision gate if a run_id was provided.
	let gateId: string | null = null;
	if (runId && !parseError) {
		gateId = issueReviewDecisionGateOrFail(
			projectRoot,
			runId,
			changeId,
			"apply_review",
			ledger,
			reviewAgent,
		);
		// Write gate_id back into the ledger's latest round summary (D10 step 3).
		if (gateId) {
			ledger = patchLatestRoundGateId(ledger, gateId);
			await writeLedgerToStore(
				changeStore,
				changeId,
				ReviewLedgerKind.Apply,
				ledger,
				true,
			);
		}
	}

	return {
		...resultFromLedger(
			action,
			changeId,
			reviewJson,
			rereviewMode,
			parseError,
			rawResponse,
			ledger,
			diffSummary,
			config.diffWarnThreshold,
		),
		gate_id: gateId,
	};
}

async function runAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	ctx: WorkspaceContext,
	changeStore: ChangeArtifactStore,
	changeId: string,
	maxRounds: number,
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	let ledger = (
		await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Apply)
	).ledger;
	const reviewConfig = readReviewConfig(projectRoot);
	const runArtifactStore = createLocalFsRunArtifactStore(projectRoot);
	const runsRoot = resolve(projectRoot, ".specflow/runs");
	const progressEnabled = typeof runId === "string" && runId.length > 0;
	const phase = "apply_review" as const;
	let currentSnapshot: AutofixProgressSnapshot | null = null;
	let stopHeartbeat: (() => void) | null = null;

	const nowIso = () => new Date().toISOString();

	const updateSnapshot = (
		mutate: (prev: AutofixProgressSnapshot) => AutofixProgressSnapshot,
	): void => {
		if (!progressEnabled || !currentSnapshot) return;
		currentSnapshot = mutate(currentSnapshot);
		void writeAutofixSnapshot(runArtifactStore, currentSnapshot).catch(() => {
			// Swallow per authority-precedence rule (ledger > events > snapshot).
		});
	};

	const emitAutofixEvent = (args: {
		readonly loopState: AutofixLoopState;
		readonly terminalOutcome?: AutofixTerminalOutcome | null;
		readonly roundIndex: number;
		readonly counters: AutofixRoundCounters;
		readonly ledgerRoundId: string | null;
		readonly score?: number | null;
	}): void => {
		if (!progressEnabled || !runId) return;
		const payload = buildAutofixReviewCompletedPayload({
			reviewer: reviewAgent,
			score: args.score ?? null,
			autofix: buildAutofixRoundPayload({
				roundIndex: args.roundIndex,
				maxRounds,
				loopState: args.loopState,
				terminalOutcome: args.terminalOutcome ?? null,
				counters: args.counters,
				ledgerRoundId: args.ledgerRoundId,
			}),
		});
		withLockedPublisher(runsRoot, runId, (publisher) => {
			publishAutofixReviewCompleted({
				publisher,
				runId,
				changeId,
				highestSequence: publisher.highestSequence(),
				timestamp: nowIso(),
				sourcePhase: phase,
				payload,
			});
		});
	};

	if (progressEnabled && runId) {
		currentSnapshot = buildStartingSnapshot({
			runId,
			changeId,
			phase,
			maxRounds,
			now: nowIso(),
		});
		await writeAutofixSnapshot(runArtifactStore, currentSnapshot);
		stopHeartbeat = startAutofixHeartbeat({
			getCurrent: () => currentSnapshot as AutofixProgressSnapshot,
			write: (next) => {
				currentSnapshot = next;
				return writeAutofixSnapshot(runArtifactStore, next);
			},
			intervalMs: reviewConfig.autofixHeartbeatSeconds * 1000,
		});
	}

	let previousScore = computeScore(ledger);
	let previousNewHighCount = 0;
	let previousAllHighTitles = highFindingTitles(ledger);
	let previousResolvedHighTitles = resolvedHighFindingTitles(ledger);
	let consecutiveFailures = 0;
	let autofixRound = 0;
	let loopResult = "max_rounds_reached";
	let lastSuccessfulGateId: string | null = null;
	const roundScores: AutofixRoundScore[] = [];
	const divergenceWarnings: DivergenceWarning[] = [];

	while (autofixRound < maxRounds) {
		autofixRound += 1;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: Starting fix...\n`,
		);
		const prevSummary = findRoundSummary(
			ledger.round_summaries ?? [],
			autofixRound - 1,
		);
		const startCounters = prevSummary
			? buildAutofixCountersFromRound(prevSummary)
			: ZERO_AUTOFIX_COUNTERS;
		const startLedgerRoundId = ledgerRoundIdFor(prevSummary);
		updateSnapshot((prev) => ({
			...prev,
			loop_state: "in_progress",
			round_index: autofixRound,
			terminal_outcome: null,
			counters: startCounters,
			heartbeat_at: nowIso(),
			ledger_round_id: startLedgerRoundId,
		}));
		emitAutofixEvent({
			loopState: "in_progress",
			roundIndex: autofixRound,
			counters: startCounters,
			ledgerRoundId: startLedgerRoundId,
		});
		const diffResult = diffFilter(ctx);
		if (diffResult.summary === "empty") {
			loopResult = "no_changes";
			break;
		}
		const actionableFindings = (ledger.findings ?? []).filter((finding) => {
			const status = String(finding.status ?? "");
			return status === "new" || status === "open";
		});
		const fixResult = callMainAgent(
			mainAgent,
			changeRoot,
			await buildFixPrompt(
				changeStore,
				changeId,
				diffResult.diff,
				actionableFindings,
			),
		);
		if (!fixResult.ok) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: fix step failed (consecutive: ${consecutiveFailures})\n`,
			);
			if (consecutiveFailures >= 3) {
				loopResult = "consecutive_failures";
				break;
			}
			continue;
		}

		const reviewResult = await runReviewPipeline(
			runtimeRoot,
			projectRoot,
			changeRoot,
			ctx,
			changeStore,
			"fix_review",
			changeId,
			true,
			true,
			reviewAgent,
			mainAgent,
			runId,
		);
		if (reviewResult.status === "error" || reviewResult.review?.parse_error) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: re-review returned error/parse_error (consecutive: ${consecutiveFailures})\n`,
			);
			if (consecutiveFailures >= 3) {
				loopResult = "consecutive_failures";
				break;
			}
			continue;
		}

		consecutiveFailures = 0;
		// Track the gate_id emitted by this round's review pipeline.
		lastSuccessfulGateId = reviewResult.gate_id ?? null;
		ledger = (
			await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Apply)
		).ledger;
		const currentScore = computeScore(ledger);
		const unresolvedHigh = unresolvedCriticalHighCount(ledger);
		const currentAllHighTitles = highFindingTitles(ledger);
		const currentNewHighCount = currentAllHighTitles.filter(
			(title) => !previousAllHighTitles.includes(title),
		).length;

		roundScores.push({
			round: autofixRound,
			score: currentScore,
			unresolved_high: unresolvedHigh,
			new_high: currentNewHighCount,
		});

		if (unresolvedHigh === 0) {
			loopResult = "success";
			process.stderr.write(
				`Auto-fix Round ${autofixRound}: success (unresolved high = 0)\n`,
			);
			break;
		}

		if (currentScore > previousScore) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "quality_gate_degradation",
				detail: `+${currentScore - previousScore}`,
			});
			process.stderr.write(
				`Warning: quality gate degradation +${currentScore - previousScore}\n`,
			);
		}

		const currentResolvedHighTitles = resolvedHighFindingTitles(ledger);
		const newlyResolved = currentResolvedHighTitles.filter(
			(title) => !previousResolvedHighTitles.includes(title),
		);
		const unresolvedTitles = openHighFindings(ledger).map((finding) =>
			String(finding.title ?? ""),
		);
		const reemerged = newlyResolved.find((title) =>
			unresolvedTitles.some((candidate) =>
				candidate.toLowerCase().includes(title.toLowerCase()),
			),
		);
		if (reemerged) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "finding_re_emergence",
				detail: reemerged,
			});
			process.stderr.write(`Warning: finding re-emergence: ${reemerged}\n`);
		}

		if (autofixRound >= 2 && currentNewHighCount > previousNewHighCount) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "new_high_increase",
				detail: `+${currentNewHighCount - previousNewHighCount}`,
			});
			process.stderr.write(
				`Warning: new high increase +${currentNewHighCount - previousNewHighCount}\n`,
			);
		}

		previousScore = currentScore;
		previousNewHighCount = currentNewHighCount;
		previousAllHighTitles = currentAllHighTitles;
		previousResolvedHighTitles = currentResolvedHighTitles;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: unresolved_high=${unresolvedHigh}, score=${currentScore}\n`,
		);
		const endSummary = findRoundSummary(
			ledger.round_summaries ?? [],
			autofixRound,
		);
		const endCounters = endSummary
			? buildAutofixCountersFromRound(endSummary)
			: ZERO_AUTOFIX_COUNTERS;
		const endLedgerRoundId =
			ledgerRoundIdFor(endSummary) ?? lastSuccessfulGateId;
		updateSnapshot((prev) => ({
			...prev,
			loop_state: "awaiting_review",
			round_index: autofixRound,
			terminal_outcome: null,
			counters: endCounters,
			heartbeat_at: nowIso(),
			ledger_round_id: endLedgerRoundId,
		}));
		emitAutofixEvent({
			loopState: "awaiting_review",
			roundIndex: autofixRound,
			counters: endCounters,
			ledgerRoundId: endLedgerRoundId,
			score: currentScore,
		});
	}

	// Gate emission is handled per-round inside runReviewPipeline (which
	// receives runId). We only propagate the gate_id from the last
	// *successful* review round — no unconditional emission at loop exit.
	const gateId = lastSuccessfulGateId;

	const actionable = actionableCount(ledger);
	// Severity-aware handoff: the loop state is "clean" when no
	// critical/high findings remain. LOW/MEDIUM may still be present and
	// are reported via severity_summary and actionable_count.
	const blocking = unresolvedCriticalHighCount(ledger);
	const handoffState =
		blocking === 0 ? "loop_no_findings" : "loop_with_findings";
	const terminalLoopState: AutofixLoopState =
		blocking === 0 ? "terminal_success" : "terminal_failure";
	const terminalOutcome: AutofixTerminalOutcome =
		blocking === 0
			? "loop_no_findings"
			: loopResult === "max_rounds_reached" ||
					loopResult === "no_progress" ||
					loopResult === "consecutive_failures"
				? (loopResult as AutofixTerminalOutcome)
				: "loop_with_findings";
	const terminalSummary = findRoundSummary(
		ledger.round_summaries ?? [],
		autofixRound,
	);
	const terminalCounters = terminalSummary
		? buildAutofixCountersFromRound(terminalSummary)
		: ZERO_AUTOFIX_COUNTERS;
	const terminalLedgerRoundId =
		ledgerRoundIdFor(terminalSummary) ?? lastSuccessfulGateId;
	updateSnapshot((prev) => ({
		...prev,
		loop_state: terminalLoopState,
		round_index: autofixRound,
		terminal_outcome: terminalOutcome,
		counters: terminalCounters,
		heartbeat_at: nowIso(),
		ledger_round_id: terminalLedgerRoundId,
	}));
	emitAutofixEvent({
		loopState: terminalLoopState,
		terminalOutcome,
		roundIndex: autofixRound,
		counters: terminalCounters,
		ledgerRoundId: terminalLedgerRoundId,
		score: previousScore,
	});
	stopHeartbeat?.();

	return {
		status: "success",
		action: "autofix_loop",
		change_id: changeId,
		review: null,
		ledger: ledgerSnapshot(ledger),
		autofix: {
			total_rounds: autofixRound,
			result: loopResult,
			round_scores: roundScores,
			divergence_warnings: divergenceWarnings,
		},
		handoff: {
			state: handoffState,
			actionable_count: actionable,
			severity_summary: severitySummary(ledger),
		},
		gate_id: gateId,
		error: null,
	};
}

async function cmdReview(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	ctx: WorkspaceContext,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	let changeId = "";
	let skipDiffCheck = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--skip-diff-check") {
			skipDiffCheck = true;
			continue;
		}
		if (arg === "--review-agent" || arg === "--run-id") {
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			die(`Error: unknown option '${arg}'`);
		}
		if (!changeId) {
			changeId = arg;
			continue;
		}
		die(`Error: unexpected argument '${arg}'`);
	}
	if (!changeId) {
		die(
			"Usage: specflow-review-apply review <CHANGE_ID> [--skip-diff-check] [--run-id <id>]",
		);
	}
	await validateChangeFromStore(changeStore, changeId);
	return await runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeRoot,
		ctx,
		changeStore,
		"review",
		changeId,
		false,
		skipDiffCheck,
		reviewAgent,
		mainAgent,
		runId,
	);
}

async function cmdFixReview(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	ctx: WorkspaceContext,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	let changeId = "";
	let skipDiffCheck = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--autofix") {
			continue;
		}
		if (arg === "--skip-diff-check") {
			skipDiffCheck = true;
			continue;
		}
		if (arg === "--review-agent" || arg === "--run-id") {
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			die(`Error: unknown option '${arg}'`);
		}
		if (!changeId) {
			changeId = arg;
			continue;
		}
		die(`Error: unexpected argument '${arg}'`);
	}
	if (!changeId) {
		die(
			"Usage: specflow-review-apply fix-review <CHANGE_ID> [--autofix] [--skip-diff-check] [--run-id <id>]",
		);
	}
	await validateChangeFromStore(changeStore, changeId);
	return await runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeRoot,
		ctx,
		changeStore,
		"fix_review",
		changeId,
		true,
		skipDiffCheck,
		reviewAgent,
		mainAgent,
		runId,
	);
}

async function cmdAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	ctx: WorkspaceContext,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	let changeId = "";
	let maxRounds = "";
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--max-rounds") {
			maxRounds =
				args[index + 1] ?? die("Error: --max-rounds requires a value");
			index += 1;
			continue;
		}
		if (arg === "--review-agent" || arg === "--run-id") {
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			die(`Error: unknown option '${arg}'`);
		}
		if (!changeId) {
			changeId = arg;
			continue;
		}
		die(`Error: unexpected argument '${arg}'`);
	}
	if (!changeId) {
		die(
			"Usage: specflow-review-apply autofix-loop <CHANGE_ID> [--max-rounds N] [--run-id <id>]",
		);
	}
	const config = readReviewConfig(projectRoot);
	const rounds = maxRounds
		? /^[0-9]+$/.test(maxRounds) &&
			Number(maxRounds) >= 1 &&
			Number(maxRounds) <= 10
			? Number(maxRounds)
			: die("Error: --max-rounds must be a number between 1 and 10")
		: config.maxAutofixRounds;
	await validateChangeFromStore(changeStore, changeId);
	return await runAutofixLoop(
		runtimeRoot,
		projectRoot,
		changeRoot,
		ctx,
		changeStore,
		changeId,
		rounds,
		reviewAgent,
		mainAgent,
		runId,
	);
}

function parseReviewAgentFlag(args: readonly string[]): string | undefined {
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--review-agent") {
			return args[index + 1];
		}
	}
	return undefined;
}

function parseRunIdFlag(args: readonly string[]): string | undefined {
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--run-id") {
			return args[index + 1];
		}
	}
	return undefined;
}

/**
 * Issue a review_decision gate for a completed apply review round.
 *
 * Gate issuance failure is a hard error — the spec requires exactly one
 * `review_decision` gate per completed review round. Callers MUST NOT
 * proceed with a successful review result when this function throws.
 *
 * The `gate_opened` event is emitted inside the event-log lock only after
 * re-reading the gate to confirm it is still `pending`, preventing emission
 * for a gate that was superseded by a concurrent review process.
 */
function issueReviewDecisionGateOrFail(
	projectRoot: string,
	runId: string,
	changeId: string,
	reviewPhase: ReviewPhase,
	ledger: ReviewLedger,
	reviewAgent: ReviewAgentName,
): string {
	const store = createLocalFsGateRecordStore(projectRoot);
	const round = Number(ledger.current_round ?? 0);
	const roundId = `${reviewPhase}-round-${round}`;
	const gateId = `review_decision-${runId}-${reviewPhase}-${round}`;
	const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	const findings: ReviewFindingSnapshot[] = (ledger.findings ?? [])
		.filter((f) => {
			const status = String(f.status ?? "");
			return status === "new" || status === "open";
		})
		.map((f) => ({
			id: String(f.id ?? ""),
			severity: (f.severity ?? "medium") as ReviewFindingSnapshot["severity"],
			status: String(f.status ?? ""),
			title: String(f.title ?? ""),
		}));
	const provenance: ReviewRoundProvenance = {
		run_id: runId,
		review_phase: reviewPhase,
		review_round_id: roundId,
		findings,
		reviewer_actor: "ai-agent",
		reviewer_actor_id: reviewAgent,
		approval_binding: "advisory",
	};
	const gate = issueReviewDecisionGate(provenance, {
		store,
		projectRoot,
		gateId,
		createdAt,
	});
	// Emit gate_opened under the event-log lock, re-reading the gate to
	// confirm it hasn't been superseded by a concurrent process (R5-F09).
	const runsRoot = resolve(projectRoot, ".specflow/runs");
	withLockedPublisher(runsRoot, runId, (publisher) => {
		const current = store.read(runId, gate.gate_id);
		if (current && current.status === "pending") {
			emitGateOpened({
				publisher,
				runId,
				changeId,
				gateId: gate.gate_id,
				gateKind: "review_decision",
				originatingPhase: reviewPhase,
				timestamp: createdAt,
				highestSequence: publisher.highestSequence(),
			});
		}
	});
	return gate.gate_id;
}

async function main(): Promise<void> {
	let ctx: WorkspaceContext;
	try {
		ctx = createLocalWorkspaceContext();
	} catch {
		notInGitRepo();
	}
	const projectRoot = ctx.projectRoot();
	loadConfigEnv(projectRoot);
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const [subcommand = "", ...args] = process.argv.slice(2);
	const reviewAgent = resolveReviewAgent(parseReviewAgentFlag(args));
	const mainAgent = resolveMainAgent();
	let runId = parseRunIdFlag(args);

	// Auto-discover run_id from the change_id when --run-id is not provided.
	// This ensures review_decision gates are always emitted when a run exists.
	const runStore = createLocalFsRunArtifactStore(projectRoot);
	if (!runId) {
		const changeId = args.find((a) => !a.startsWith("-"));
		if (changeId) {
			const latest = await findLatestRun(runStore, changeId);
			if (latest) {
				runId = latest.run_id;
			}
		}
	}

	// Resolve the change-artifact root from run-state. In worktree mode this
	// is the main-session worktree; for synthetic runs or missing runs it
	// falls back to the repo root. The helper also enforces the legacy guard
	// (worktree_path == repo_path for non-synthetic runs → fail fast).
	const changeRoot = await resolveChangeRootForRun(
		runStore,
		runId,
		projectRoot,
	);
	const changeStore = createLocalFsChangeArtifactStore(changeRoot);

	// When the change root differs from the project root (worktree mode),
	// create a workspace context rooted in the worktree so diffs are read
	// from the correct working tree.
	if (changeRoot !== projectRoot) {
		try {
			ctx = createLocalWorkspaceContext(changeRoot, changeRoot);
		} catch {
			die(
				`Error: worktree at '${changeRoot}' is not a valid git working tree.`,
			);
		}
	}

	let result: ReviewResult;
	switch (subcommand) {
		case "review":
			result = await cmdReview(
				runtimeRoot,
				projectRoot,
				changeRoot,
				ctx,
				changeStore,
				args,
				reviewAgent,
				mainAgent,
				runId,
			);
			break;
		case "fix-review":
			result = await cmdFixReview(
				runtimeRoot,
				projectRoot,
				changeRoot,
				ctx,
				changeStore,
				args,
				reviewAgent,
				mainAgent,
				runId,
			);
			break;
		case "autofix-loop":
			result = await cmdAutofixLoop(
				runtimeRoot,
				projectRoot,
				changeRoot,
				ctx,
				changeStore,
				args,
				reviewAgent,
				mainAgent,
				runId,
			);
			break;
		case "":
			die(
				"Usage: specflow-review-apply <review|fix-review|autofix-loop> <CHANGE_ID> [options]",
			);
			return;
		default:
			die(
				`Error: unknown subcommand '${subcommand}'. Use: review, fix-review, autofix-loop`,
			);
	}
	printSchemaJson("review-apply-result", result);
}

main();
