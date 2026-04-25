// specflow-generate-task-graph — CLI for generating task-graph.json from design.md.
// Usage: specflow-generate-task-graph <CHANGE_ID> [--max-retries N]

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ChangeArtifactType, changeRef } from "../lib/artifact-types.js";
import { tryGit } from "../lib/git.js";
import { createLocalFsChangeArtifactStore } from "../lib/local-fs-change-artifact-store.js";
import { createLocalFsRunArtifactStore } from "../lib/local-fs-run-artifact-store.js";
import {
	callReviewAgent,
	loadConfigEnv,
	resolveReviewAgent,
} from "../lib/review-runtime.js";
import { findLatestRun } from "../lib/run-store-ops.js";
import { withSizeScore } from "../lib/task-planner/enrich.js";
import { renderTasksMd } from "../lib/task-planner/render.js";
import { validateTaskGraph } from "../lib/task-planner/schema.js";
import type { TaskGraph } from "../lib/task-planner/types.js";
import { resolveChangeRootForRun } from "../lib/worktree-resolver.js";

function die(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

/**
 * R3-F06: mirror the library generator's sanitisation so the CLI's validation
 * path is tolerant of LLM-emitted stale `size_score` fields. The canonical
 * value is applied post-validation by `withSizeScore`.
 */
function stripSizeScore(graph: unknown): unknown {
	if (typeof graph !== "object" || graph === null || Array.isArray(graph)) {
		return graph;
	}
	const obj = graph as Record<string, unknown>;
	if (!Array.isArray(obj.bundles)) return obj;
	return {
		...obj,
		bundles: (obj.bundles as unknown[]).map((b) => {
			if (typeof b !== "object" || b === null) return b;
			const { size_score: _dropped, ...rest } = b as Record<string, unknown>;
			return rest;
		}),
	};
}

function ensureGitRepo(): string {
	const result = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
	if (result.status !== 0) {
		die("Not in a git repository");
	}
	return result.stdout.trim();
}

function getSpecNames(projectRoot: string): readonly string[] {
	const specsDir = resolve(projectRoot, "openspec/specs");
	if (!existsSync(specsDir)) return [];
	return readdirSync(specsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name);
}

function buildPrompt(
	designContent: string,
	changeId: string,
	specNames: readonly string[],
): string {
	return `You are a task planner that converts a software design document into a structured task graph.

Output a JSON object with this exact structure:
{
  "version": "1.0",
  "change_id": "${changeId}",
  "bundles": [
    {
      "id": "<kebab-case-id>",
      "title": "<human-readable title>",
      "goal": "<one-sentence goal>",
      "depends_on": ["<bundle-id>"],
      "inputs": ["<artifact reference>"],
      "outputs": ["<artifact reference>"],
      "status": "pending",
      "tasks": [
        { "id": "<N>", "title": "<task description>", "status": "pending" }
      ],
      "owner_capabilities": ["<spec-name>"]
    }
  ],
  "generated_at": "${new Date().toISOString()}",
  "generated_from": "design.md"
}

Rules:
- Each bundle represents a logical unit of work that can be completed in one session
- depends_on uses soft dependencies: a dependent bundle can start when its dependency's output artifacts are available
- owner_capabilities references baseline spec names from the available specs list below
- All statuses must be "pending" for new graphs
- Bundle IDs must be unique kebab-case strings
- Task IDs must be unique within their bundle (use sequential numbers)
- The dependency graph must be a DAG (no cycles)
- Output ONLY valid JSON, no markdown fences or explanation

Available spec names for owner_capabilities: ${specNames.join(", ")}

Design document:

${designContent}`;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args.length < 1) {
		die("Usage: specflow-generate-task-graph <CHANGE_ID> [--max-retries N]");
	}

	const changeId = args[0];
	let maxRetries = 3;
	const retriesIdx = args.indexOf("--max-retries");
	if (retriesIdx !== -1 && args[retriesIdx + 1]) {
		maxRetries = Number.parseInt(args[retriesIdx + 1], 10) || 3;
	}

	const projectRoot = ensureGitRepo();
	loadConfigEnv(projectRoot);

	// Resolve the change-artifact root from run-state so artifacts are
	// read/written in the main-session worktree, not the user repo.
	const runStore = createLocalFsRunArtifactStore(projectRoot);
	const latestRun = await findLatestRun(runStore, changeId);
	const changeRoot = await resolveChangeRootForRun(
		runStore,
		latestRun?.run_id,
		projectRoot,
	);

	const store = createLocalFsChangeArtifactStore(changeRoot);
	const designRef = changeRef(changeId, ChangeArtifactType.Design);
	if (!(await store.exists(designRef))) {
		die(`design.md not found for change '${changeId}'`);
	}

	const designContent = await store.read(designRef);
	const specNames = getSpecNames(changeRoot);
	const agent = resolveReviewAgent();

	process.stderr.write("Generating task graph from design.md...\n");

	let lastErrors: string[] = [];
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const prompt =
			attempt === 0
				? buildPrompt(designContent, changeId, specNames)
				: `${buildPrompt(designContent, changeId, specNames)}\n\nPrevious attempt failed validation:\n${lastErrors.join("\n")}\nFix the issues and try again.`;

		const result = callReviewAgent<TaskGraph>(agent, changeRoot, prompt);

		if (!result.ok || !result.payload) {
			lastErrors = [`Agent returned non-JSON or empty response`];
			process.stderr.write(
				`Attempt ${attempt + 1}/${maxRetries}: invalid response, retrying...\n`,
			);
			continue;
		}

		// R3-F06: strip any LLM-emitted size_score BEFORE validation so stale or
		// mismatched values do not fail the schema check. The canonical value
		// (`size_score = tasks.length`) is applied by `withSizeScore` below.
		const sanitized = stripSizeScore(result.payload);
		const validation = validateTaskGraph(sanitized);
		if (!validation.valid) {
			lastErrors = [...validation.errors];
			process.stderr.write(
				`Attempt ${attempt + 1}/${maxRetries}: schema validation failed (${validation.errors.length} errors), retrying...\n`,
			);
			continue;
		}

		// Success — enrich with deterministic size_score (required by the
		// bundle-subagent-execution spec so the dispatcher can classify bundles),
		// then write task-graph.json and render tasks.md.
		const taskGraph = withSizeScore(sanitized as TaskGraph);
		const taskGraphRef = changeRef(changeId, ChangeArtifactType.TaskGraph);
		await store.write(taskGraphRef, JSON.stringify(taskGraph, null, 2) + "\n");

		const tasksMd = renderTasksMd(taskGraph);
		const tasksRef = changeRef(changeId, ChangeArtifactType.Tasks);
		await store.write(tasksRef, tasksMd);

		process.stderr.write("Task graph generated successfully.\n");
		process.stdout.write(
			JSON.stringify(
				{
					status: "success",
					change_id: changeId,
					bundles: taskGraph.bundles.length,
					tasks_total: taskGraph.bundles.reduce(
						(sum, b) => sum + b.tasks.length,
						0,
					),
				},
				null,
				2,
			) + "\n",
		);
		return;
	}

	// All retries exhausted
	process.stdout.write(
		JSON.stringify(
			{
				status: "error",
				change_id: changeId,
				error: `Task graph generation failed after ${maxRetries} attempts`,
				last_errors: lastErrors,
			},
			null,
			2,
		) + "\n",
	);
	process.exit(1);
}

main();
