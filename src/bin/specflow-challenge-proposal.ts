import type { ChangeArtifactStore } from "../lib/artifact-store.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { moduleRepoRoot, printSchemaJson } from "../lib/process.js";
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
import type { ChallengeResult } from "../types/contracts.js";

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

function buildChallengePrompt(
	runtimeRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
): string {
	return [
		readPrompt(runtimeRoot, "challenge_proposal_prompt.md").trimEnd(),
		buildPrompt([
			["PROPOSAL CONTENT", readProposalFromStore(changeStore, changeId)],
		]),
	].join("\n\n");
}

function runChallenge(
	runtimeRoot: string,
	projectRoot: string,
	changeStore: ChangeArtifactStore,
	changeId: string,
	agent: ReviewAgentName,
): ChallengeResult {
	process.stderr.write("Reading proposal...\n");
	try {
		validateChangeFromStore(changeStore, changeId);
	} catch {
		return {
			...errorJson("challenge", changeId, "missing_proposal"),
			challenges: [],
			summary: "",
		};
	}

	process.stderr.write(`Calling ${agent} for proposal challenge...\n`);
	const prompt = buildChallengePrompt(runtimeRoot, changeStore, changeId);
	const agentResult = callReviewAgent<ChallengePayload>(
		agent,
		projectRoot,
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

function main(): void {
	const projectRoot = ensureGitRepo();
	loadConfigEnv(projectRoot);
	const changeStore = createLocalFsChangeArtifactStore(projectRoot);
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const [subcommand = "", ...args] = process.argv.slice(2);
	const agent = resolveReviewAgent(parseReviewAgentFlag(args));

	if (subcommand !== "challenge") {
		die("Usage: specflow-challenge-proposal challenge <CHANGE_ID> [options]");
	}

	const changeId = args[0];
	if (!changeId) {
		die("Usage: specflow-challenge-proposal challenge <CHANGE_ID>");
	}

	const result = runChallenge(
		runtimeRoot,
		projectRoot,
		changeStore,
		changeId,
		agent,
	);
	printSchemaJson("challenge-proposal-result", result);
}

main();
