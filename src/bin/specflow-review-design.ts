import { resolve } from "node:path";
import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import {
	ChangeArtifactType,
	changeRef,
	ReviewLedgerKind,
} from "../lib/artifact-types.js";
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
import { validatePlanningHeadings } from "../lib/design-planning-validation.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import { withLockedPublisher } from "../lib/local-fs-observation-event-publisher.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { emitGateOpened } from "../lib/observation-event-emitter.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import {
	issueReviewDecisionGate,
	type ReviewPhase,
	type ReviewRoundProvenance,
} from "../lib/review-decision-gate.js";
import {
	actionableCount,
	applyStillOpenSeverityOverrides,
	clearLedgerFindings,
	computeScore,
	computeStatus,
	computeSummary,
	emptyLedger,
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
	contentHash,
	errorJson,
	loadConfigEnv,
	type MainAgentName,
	type ReviewAgentName,
	readDesignArtifactsFromStore,
	readPrompt,
	readReviewConfig,
	renderCurrentPhaseToStore,
	resolveMainAgent,
	resolveReviewAgent,
	validateChangeFromStore,
} from "../lib/review-runtime.js";
import { findLatestRun } from "../lib/run-store-ops.js";
import {
	type AutofixProgressSnapshot,
	buildStartingSnapshot,
} from "../types/autofix-progress.js";
import type {
	AutofixRoundScore,
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

async function buildReviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
): Promise<string> {
	const artifacts = await readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	const parts: [string, string][] = [["PROPOSAL CONTENT", artifacts.proposal]];
	if (artifacts.specs) {
		parts.push(["SPEC FILES", artifacts.specs]);
	}
	parts.push(
		["DESIGN CONTENT", artifacts.design],
		["TASKS CONTENT", artifacts.tasks],
	);
	return [
		readPrompt(runtimeRoot, "review_design_prompt.md").trimEnd(),
		buildPrompt(parts),
	].join("\n\n");
}

async function buildRereviewPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	previousFindings: readonly ReviewFinding[],
	maxFindingId: number,
): Promise<string> {
	const artifacts = await readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	const parts: [string, string][] = [
		["PREVIOUS_FINDINGS", JSON.stringify(previousFindings)],
		["MAX_FINDING_ID", String(maxFindingId)],
		["PROPOSAL CONTENT", artifacts.proposal],
	];
	if (artifacts.specs) {
		parts.push(["SPEC FILES", artifacts.specs]);
	}
	parts.push(
		["DESIGN CONTENT", artifacts.design],
		["TASKS CONTENT", artifacts.tasks],
	);
	return [
		readPrompt(runtimeRoot, "review_design_rereview_prompt.md").trimEnd(),
		buildPrompt(parts),
	].join("\n\n");
}

async function buildFixPrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	findings: readonly ReviewFinding[],
): Promise<string> {
	const artifacts = await readDesignArtifactsFromStore(changeStore, changeId);
	if (!artifacts) {
		throw new Error("missing_artifacts");
	}
	let prefix =
		"You are a design and tasks fixer. Based on the review findings below, fix all issues in the design and task documents.\nApply fixes for all findings. Do not skip any. Modify design.md and tasks.md as needed.";
	try {
		prefix = readPrompt(runtimeRoot, "fix_design_prompt.md").trimEnd();
	} catch {
		// Keep fallback prompt.
	}
	return [
		prefix,
		buildPrompt([
			["REVIEW FINDINGS", JSON.stringify(findings)],
			["PROPOSAL CONTENT", artifacts.proposal],
			["DESIGN CONTENT", artifacts.design],
			["TASKS CONTENT", artifacts.tasks],
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
	// Severity-aware gate: only critical/high unresolved findings block
	// the design review handoff. See review-orchestration spec.
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
		rereview_classification: rereviewClassification,
		error: null,
	};
}

async function artifactHash(
	changeStore: ChangeArtifactStore,
	changeId: string,
	type: typeof ChangeArtifactType.Design | typeof ChangeArtifactType.Tasks,
): Promise<string> {
	const ref = changeRef(changeId, type);
	if (!(await changeStore.exists(ref))) {
		return "";
	}
	return contentHash(await changeStore.read(ref));
}

async function buildTaskPlannableFindings(
	changeStore: ChangeArtifactStore,
	changeId: string,
	startId: number,
): Promise<ReviewFinding[]> {
	const designRef = changeRef(changeId, ChangeArtifactType.Design);
	if (!(await changeStore.exists(designRef))) {
		return [];
	}
	const designContent = await changeStore.read(designRef);
	const result = validatePlanningHeadings(designContent);
	if (result.valid) {
		return [];
	}
	const findings: ReviewFinding[] = [];
	let nextId = startId;
	for (const heading of result.missing) {
		findings.push({
			id: `TP${nextId}`,
			title: `Missing planning section: ${heading}`,
			file: "design.md",
			category: "task-plannable",
			severity: "high",
			status: "new",
			detail: `The mandatory planning section "${heading}" is missing from design.md. Add it as a ## heading with non-empty content (use "N/A" with justification if not applicable).`,
		} satisfies ReviewFinding);
		nextId += 1;
	}
	for (const heading of result.empty) {
		findings.push({
			id: `TP${nextId}`,
			title: `Empty planning section: ${heading}`,
			file: "design.md",
			category: "task-plannable",
			severity: "high",
			status: "new",
			detail: `The planning section "${heading}" exists but has no content. Add meaningful content or "N/A" with justification.`,
		} satisfies ReviewFinding);
		nextId += 1;
	}
	return findings;
}

async function runReviewPipeline(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	action: string,
	changeId: string,
	rereviewMode: boolean,
	reviewAgent: ReviewAgentName,
	runId?: string,
): Promise<ReviewResult> {
	process.stderr.write("Reading artifacts...\n");
	if (!(await readDesignArtifactsFromStore(changeStore, changeId))) {
		return {
			...errorJson(action, changeId, "missing_artifacts"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}

	process.stderr.write(`Calling ${reviewAgent} for design review...\n`);
	let prompt: string;
	if (rereviewMode) {
		const priorLedger = (
			await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Design)
		).ledger;
		const previousFindings = (priorLedger.findings ?? []).filter(
			(finding) => String(finding.status ?? "") !== "resolved",
		);
		prompt = await buildRereviewPrompt(
			runtimeRoot,
			changeStore,
			changeId,
			previousFindings,
			Number(priorLedger.max_finding_id ?? 0),
		);
	} else {
		prompt = await buildReviewPrompt(runtimeRoot, changeStore, changeId);
	}
	const reviewAgentResult = callReviewAgent<Record<string, unknown>>(
		reviewAgent,
		projectRoot,
		prompt,
	);

	let parseError = false;
	let rawResponse = "";
	let reviewJson: Record<string, unknown> = {
		decision: "UNKNOWN",
		findings: [],
		summary: "parse failed",
	};

	if (!reviewAgentResult.ok) {
		if (reviewAgentResult.exitCode) {
			return {
				...errorJson(
					action,
					changeId,
					`review_agent_exit_${reviewAgentResult.exitCode}`,
				),
				review: null,
				ledger: null,
				autofix: null,
				handoff: null,
			};
		}
		parseError = true;
		rawResponse = reviewAgentResult.rawResponse;
	} else if (reviewAgentResult.payload) {
		reviewJson = reviewAgentResult.payload;
	}

	const ledgerRead = await readLedgerFromStore(
		changeStore,
		changeId,
		ReviewLedgerKind.Design,
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
			const llmFindings = Array.isArray(reviewJson.findings)
				? (reviewJson.findings as ReviewFinding[])
				: [];
			const maxLlmId = llmFindings.reduce((max, f) => {
				const num = Number(String(f.id ?? "").replace(/\D/g, ""));
				return Number.isNaN(num) ? max : Math.max(max, num);
			}, 0);
			const tpFindings = await buildTaskPlannableFindings(
				changeStore,
				changeId,
				maxLlmId + 1,
			);
			ledger = matchFindings(ledger, [...llmFindings, ...tpFindings], round);
		}
		ledger = computeSummary(ledger, round);
		ledger = computeStatus(ledger);
		ledger = persistMaxFindingId(ledger);
		await writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			ledger,
			ledgerRead.status === "clean",
		);
		await renderCurrentPhaseToStore(
			changeStore,
			changeId,
			ledger,
			"design",
			projectRoot,
		);
	}

	// Issue a review_decision gate if a run_id was provided. Gate issuance
	// failure is a hard error — the spec requires exactly one gate per round.
	let gateId: string | null = null;
	if (runId && !parseError) {
		gateId = issueReviewDecisionGateOrFail(
			projectRoot,
			runId,
			changeId,
			"design_review",
			ledger,
			reviewAgent,
		);
		// Write gate_id back into the ledger's latest round summary (D10 step 3).
		if (gateId) {
			ledger = patchLatestRoundGateId(ledger, gateId);
			await writeLedgerToStore(
				changeStore,
				changeId,
				ReviewLedgerKind.Design,
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
			rereviewClassification,
		),
		gate_id: gateId,
	};
}

async function runAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	maxRounds: number,
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	if (!(await readDesignArtifactsFromStore(changeStore, changeId))) {
		return {
			...errorJson("autofix_loop", changeId, "missing_artifacts"),
			review: null,
			ledger: null,
			autofix: null,
			handoff: null,
		};
	}

	const ledgerRead = await readLedgerFromStore(
		changeStore,
		changeId,
		ReviewLedgerKind.Design,
	);
	let ledger = ledgerRead.ledger;
	if (ledgerRead.status === "prompt_user") {
		process.stderr.write(
			"Warning: corrupt ledger, auto-reinitializing for autofix mode\n",
		);
		ledger = emptyLedger(changeId, "design");
	}

	const reviewConfig = readReviewConfig(projectRoot);
	const runArtifactStore = createLocalFsRunArtifactStore(projectRoot);
	const runsRoot = resolve(projectRoot, ".specflow/runs");
	// Progress snapshot + heartbeat are only active when a runId is
	// available. Without a runId we cannot key the snapshot nor emit
	// review_completed events through the per-run publisher.
	const progressEnabled = typeof runId === "string" && runId.length > 0;
	const phase = "design_review" as const;
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
	let consecutiveNoChange = 0;
	let consecutiveFailures = 0;
	let autofixRound = 0;
	let loopResult = "max_rounds_reached";
	let lastSuccessfulGateId: string | null = null;
	const roundScores: AutofixRoundScore[] = [];
	const divergenceWarnings: DivergenceWarning[] = [];

	while (autofixRound < maxRounds) {
		autofixRound += 1;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: Starting design fix...\n`,
		);
		// Round-start emission: counters come from the PREVIOUS round's
		// ledger summary (or zeros on round 1). See D9.
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
		const actionableFindings = (ledger.findings ?? []).filter((finding) => {
			const status = String(finding.status ?? "");
			return status === "new" || status === "open";
		});
		const preFixHash =
			(await artifactHash(changeStore, changeId, ChangeArtifactType.Design)) +
			(await artifactHash(changeStore, changeId, ChangeArtifactType.Tasks));
		const fixResult = callMainAgent(
			mainAgent,
			projectRoot,
			await buildFixPrompt(
				runtimeRoot,
				changeStore,
				changeId,
				actionableFindings,
			),
		);
		if (!fixResult.ok) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: fix step failed (consecutive failures: ${consecutiveFailures})\n`,
			);
			if (consecutiveFailures >= 3) {
				loopResult = "consecutive_failures";
				break;
			}
			continue;
		}
		const postFixHash =
			(await artifactHash(changeStore, changeId, ChangeArtifactType.Design)) +
			(await artifactHash(changeStore, changeId, ChangeArtifactType.Tasks));
		if (preFixHash === postFixHash) {
			consecutiveNoChange += 1;
			process.stderr.write(
				`Warning: no artifact changes detected (consecutive: ${consecutiveNoChange})\n`,
			);
			if (consecutiveNoChange >= 2) {
				loopResult = "no_progress";
				break;
			}
		} else {
			consecutiveNoChange = 0;
		}

		const reviewResult = await runReviewPipeline(
			runtimeRoot,
			projectRoot,
			changeStore,
			"fix_review",
			changeId,
			true,
			reviewAgent,
			runId,
		);
		if (reviewResult.status === "error" || reviewResult.review?.parse_error) {
			consecutiveFailures += 1;
			process.stderr.write(
				`Warning: re-review returned error/parse_error (consecutive failures: ${consecutiveFailures})\n`,
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
			await readLedgerFromStore(changeStore, changeId, ReviewLedgerKind.Design)
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
		}

		if (autofixRound >= 2 && currentNewHighCount > previousNewHighCount) {
			divergenceWarnings.push({
				round: autofixRound,
				type: "new_high_increase",
				detail: `+${currentNewHighCount - previousNewHighCount}`,
			});
		}

		previousScore = currentScore;
		previousNewHighCount = currentNewHighCount;
		previousAllHighTitles = currentAllHighTitles;
		previousResolvedHighTitles = currentResolvedHighTitles;
		process.stderr.write(
			`Auto-fix Round ${autofixRound}/${maxRounds}: unresolved_high=${unresolvedHigh}, score=${currentScore}\n`,
		);
		// Round-end emission: counters from the CURRENT round's summary. See D9.
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
	// Severity-aware handoff: loop is "clean" when no critical/high remain.
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
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	runId?: string,
): Promise<ReviewResult> {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-design review <CHANGE_ID> [--reset-ledger] [--run-id <id>]",
		);
	}
	const reset = args.includes("--reset-ledger");
	try {
		await validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	if (reset) {
		await writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			emptyLedger(changeId, "design"),
			false,
		);
		process.stderr.write("Ledger reset to empty\n");
	}
	return await runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeStore,
		"review",
		changeId,
		false,
		reviewAgent,
		runId,
	);
}

async function cmdFixReview(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	runId?: string,
): Promise<ReviewResult> {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-design fix-review <CHANGE_ID> [--reset-ledger] [--autofix] [--run-id <id>]",
		);
	}
	const reset = args.includes("--reset-ledger");
	try {
		await validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	if (reset) {
		await writeLedgerToStore(
			changeStore,
			changeId,
			ReviewLedgerKind.Design,
			emptyLedger(changeId, "design"),
			false,
		);
		process.stderr.write("Ledger reset to empty\n");
	}
	return await runReviewPipeline(
		runtimeRoot,
		projectRoot,
		changeStore,
		"fix_review",
		changeId,
		true,
		reviewAgent,
		runId,
	);
}

async function cmdAutofixLoop(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	args: readonly string[],
	reviewAgent: ReviewAgentName,
	mainAgent: MainAgentName,
	runId?: string,
): Promise<ReviewResult> {
	const changeId = args[0];
	if (!changeId) {
		die(
			"Usage: specflow-review-design autofix-loop <CHANGE_ID> [--max-rounds N] [--run-id <id>]",
		);
	}
	let maxRounds = "";
	for (let index = 1; index < args.length; index += 1) {
		if (args[index] === "--max-rounds") {
			maxRounds = args[index + 1] ?? "";
			break;
		}
	}
	const config = readReviewConfig(projectRoot);
	const rounds = maxRounds ? Number(maxRounds) : config.maxAutofixRounds;
	try {
		await validateChangeFromStore(changeStore, changeId);
	} catch (error) {
		die(String((error as Error).message));
	}
	return await runAutofixLoop(
		runtimeRoot,
		projectRoot,
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
 * Issue a review_decision gate for a completed review round.
 *
 * Gate issuance failure is a hard error — the spec requires exactly one
 * `review_decision` gate per completed review round, and failure to create
 * or observe it is a contract violation. Callers MUST NOT proceed with a
 * successful review result when this function throws.
 *
 * The `gate_opened` event is emitted inside the event-log lock only after
 * re-reading the gate to confirm it is still `pending`. This prevents
 * emitting `gate_opened` for a gate that was superseded by a concurrent
 * review process between the gate write and the event emission.
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
		// If the gate is no longer pending (superseded), skip emission —
		// the superseding process owns the observation stream for this slot.
	});
	return gate.gate_id;
}

async function main(): Promise<void> {
	const projectRoot = ensureGitRepo();
	loadConfigEnv(projectRoot);
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const changeStore = createLocalFsChangeArtifactStore(projectRoot);
	const [subcommand, ...args] = process.argv.slice(2);
	const reviewAgent = resolveReviewAgent(parseReviewAgentFlag(args));
	const mainAgent = resolveMainAgent();
	let runId = parseRunIdFlag(args);
	if (!subcommand) {
		process.stderr.write(`Usage: specflow-review-design <subcommand> <CHANGE_ID> [options]

Subcommands:
  review        Initial design review
  fix-review    Re-review after fixes
  autofix-loop  Auto-fix loop

`);
		process.exit(1);
	}

	// Auto-discover run_id from the change_id when --run-id is not provided.
	// This ensures review_decision gates are always emitted when a run exists.
	if (!runId) {
		const changeId = args.find((a) => !a.startsWith("-"));
		if (changeId) {
			const runStore = createLocalFsRunArtifactStore(projectRoot);
			const latest = await findLatestRun(runStore, changeId);
			if (latest) {
				runId = latest.run_id;
			}
		}
	}

	let result: ReviewResult;
	switch (subcommand) {
		case "review":
			result = await cmdReview(
				runtimeRoot,
				projectRoot,
				changeStore,
				args,
				reviewAgent,
				runId,
			);
			break;
		case "fix-review":
			result = await cmdFixReview(
				runtimeRoot,
				projectRoot,
				changeStore,
				args,
				reviewAgent,
				runId,
			);
			break;
		case "autofix-loop":
			result = await cmdAutofixLoop(
				runtimeRoot,
				projectRoot,
				changeStore,
				args,
				reviewAgent,
				mainAgent,
				runId,
			);
			break;
		default:
			die(
				`Error: unknown subcommand '${subcommand}'. Available: review, fix-review, autofix-loop`,
			);
	}
	printSchemaJson("review-design-result", result);
}

main();
