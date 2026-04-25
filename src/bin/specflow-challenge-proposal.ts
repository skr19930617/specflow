import { resolve } from "node:path";
import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsGateRecordStore } from "../lib/local-fs-gate-record-store.js";
import { withLockedPublisher } from "../lib/local-fs-observation-event-publisher.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import { emitGateOpened } from "../lib/observation-event-emitter.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
import {
	issueReviewDecisionGate,
	type ReviewRoundProvenance,
} from "../lib/review-decision-gate.js";
import {
	buildPrompt,
	callReviewAgent,
	errorJson,
	loadConfigEnv,
	type ReviewAgentName,
	readPrompt,
	readProposalFromStore,
	resolveReviewAgent,
	validateChangeFromStore,
} from "../lib/review-runtime.js";
import { findLatestRun } from "../lib/run-store-ops.js";
import { resolveChangeRootForRun } from "../lib/worktree-resolver.js";
import type { ChallengeResult } from "../types/contracts.js";
import type { ReviewFindingSnapshot } from "../types/gate-records.js";

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

interface ChallengePayload {
	readonly challenges?: readonly {
		readonly id?: string;
		readonly category?: string;
		readonly question?: string;
		readonly context?: string;
	}[];
	readonly summary?: string;
}

async function buildChallengePrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
): Promise<string> {
	return [
		readPrompt(runtimeRoot, "challenge_proposal_prompt.md").trimEnd(),
		buildPrompt([
			["PROPOSAL CONTENT", await readProposalFromStore(changeStore, changeId)],
		]),
	].join("\n\n");
}

async function runChallenge(
	runtimeRoot: string,
	projectRoot: string,
	changeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	agent: ReviewAgentName,
): Promise<ChallengeResult> {
	process.stderr.write("Reading proposal...\n");
	try {
		await validateChangeFromStore(changeStore, changeId);
	} catch {
		return {
			...errorJson("challenge", changeId, "missing_proposal"),
			challenges: [],
			summary: "",
		};
	}

	process.stderr.write(`Calling ${agent} for proposal challenge...\n`);
	const prompt = await buildChallengePrompt(runtimeRoot, changeStore, changeId);
	const agentResult = callReviewAgent<ChallengePayload>(
		agent,
		changeRoot,
		prompt,
	);

	if (!agentResult.ok) {
		if (agentResult.exitCode) {
			return {
				...errorJson(
					"challenge",
					changeId,
					`challenge_agent_exit_${agentResult.exitCode}`,
				),
				challenges: [],
				summary: "",
			};
		}
		return {
			status: "success",
			action: "challenge",
			change_id: changeId,
			challenges: [],
			summary: "",
			error: null,
			parse_error: true,
			raw_response: agentResult.rawResponse,
		};
	}

	const payload = agentResult.payload;
	const challenges = Array.isArray(payload?.challenges)
		? payload.challenges.map((item) => ({
				id: String(item.id ?? ""),
				category: String(item.category ?? ""),
				question: String(item.question ?? ""),
				context: String(item.context ?? ""),
			}))
		: [];

	return {
		status: "success",
		action: "challenge",
		change_id: changeId,
		challenges,
		summary: String(payload?.summary ?? ""),
		error: null,
	};
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
 * Issue a review_decision gate for a completed proposal challenge round.
 *
 * Gate issuance failure is a hard error — the spec requires exactly one
 * `review_decision` gate per completed review round. Callers MUST NOT
 * proceed with a successful challenge result when this function throws.
 *
 * The `gate_opened` event is emitted inside the event-log lock only after
 * re-reading the gate to confirm it is still `pending`, preventing emission
 * for a gate that was superseded by a concurrent review process.
 */
function issueChallengeGateOrFail(
	projectRoot: string,
	runId: string,
	changeId: string,
	challenges: readonly {
		id: string;
		category: string;
		question: string;
		context: string;
	}[],
	reviewAgent: ReviewAgentName,
): string {
	const store = createLocalFsGateRecordStore(projectRoot);
	// Derive the next round number from existing proposal_challenge gates
	// so re-running the challenge CLI creates distinct gates per round.
	const existingGates = store.list(runId);
	const challengeRound =
		existingGates.filter(
			(g) =>
				g.gate_kind === "review_decision" &&
				g.originating_phase === "proposal_challenge",
		).length + 1;
	const gateId = `review_decision-${runId}-challenge-${challengeRound}`;
	const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	const findings: ReviewFindingSnapshot[] = challenges.map((c) => ({
		id: c.id,
		severity: "medium" as const,
		status: "new",
		title: c.question,
	}));
	const provenance: ReviewRoundProvenance = {
		run_id: runId,
		review_phase: "proposal_challenge",
		review_round_id: `proposal_challenge-round-${challengeRound}`,
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
				originatingPhase: "proposal_challenge",
				timestamp: createdAt,
				highestSequence: publisher.highestSequence(),
			});
		}
	});
	return gate.gate_id;
}

async function main(): Promise<void> {
	const projectRoot = ensureGitRepo();
	loadConfigEnv(projectRoot);
	const runStore = createLocalFsRunArtifactStore(projectRoot);
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const [subcommand = "", ...args] = process.argv.slice(2);
	const agent = resolveReviewAgent(parseReviewAgentFlag(args));
	let runId = parseRunIdFlag(args);

	if (subcommand !== "challenge") {
		die(
			"Usage: specflow-challenge-proposal challenge <CHANGE_ID> [--run-id <id>] [options]",
		);
	}

	const changeId = args.find((a) => !a.startsWith("-"));
	if (!changeId) {
		die(
			"Usage: specflow-challenge-proposal challenge <CHANGE_ID> [--run-id <id>]",
		);
	}

	// Auto-discover run_id when --run-id is not provided.
	if (!runId) {
		const latest = await findLatestRun(runStore, changeId);
		if (latest) {
			runId = latest.run_id;
		}
	}

	const changeRoot = await resolveChangeRootForRun(
		runStore,
		runId,
		projectRoot,
	);
	const changeStore = createLocalFsChangeArtifactStore(changeRoot);

	const result = await runChallenge(
		runtimeRoot,
		projectRoot,
		changeRoot,
		changeStore,
		changeId,
		agent,
	);

	// Issue a review_decision gate if a run_id was provided and the
	// challenge succeeded with actual challenges.
	let gateId: string | null = null;
	if (runId && result.status === "success" && result.challenges.length > 0) {
		gateId = issueChallengeGateOrFail(
			projectRoot,
			runId,
			changeId,
			result.challenges,
			agent,
		);
	}

	printSchemaJson("challenge-proposal-result", { ...result, gate_id: gateId });
}

main();
