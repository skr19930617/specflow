// LLM-based task graph generation from design.md.

import { withSizeScore } from "./enrich.js";
import { validateTaskGraph } from "./schema.js";
import type { TaskGraph } from "./types.js";

/** Recursively freeze an object tree so it is immutable at runtime. */
function deepFreeze<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") return obj;
	Object.freeze(obj);
	for (const value of Object.values(obj as Record<string, unknown>)) {
		deepFreeze(value);
	}
	return obj;
}

/**
 * Return a shallow structural copy with `size_score` removed from every bundle.
 * Used before schema validation so an LLM-emitted mismatched `size_score` does
 * not fail validation — `withSizeScore` reapplies the canonical value after.
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
			// Biome convention: use rest destructuring to drop the field.
			const { size_score: _dropped, ...rest } = b as Record<string, unknown>;
			return rest;
		}),
	};
}

export interface LlmClient {
	generateJson(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface GenerateOptions {
	readonly maxRetries?: number;
}

export interface GenerateResult {
	readonly ok: true;
	readonly taskGraph: TaskGraph;
}

export interface GenerateError {
	readonly ok: false;
	readonly error: string;
	readonly lastValidationErrors?: readonly string[];
}

const SYSTEM_PROMPT = `You are a task planner that converts a software design document into a structured task graph.

Output a JSON object with this exact structure:
{
  "version": "1.0",
  "change_id": "<provided change_id>",
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
        { "id": "<bundle-id>-<N>", "title": "<task description>", "status": "pending" }
      ],
      "owner_capabilities": ["<spec-name>"]
    }
  ],
  "generated_at": "<ISO 8601 timestamp>",
  "generated_from": "design.md"
}

Rules:
- Each bundle represents a logical unit of work that can be completed in one session
- depends_on uses soft dependencies: a dependent bundle can start when its dependency's output artifacts are available
- owner_capabilities references baseline spec names from the available specs list
- All statuses must be "pending" for new graphs
- Bundle IDs must be unique kebab-case strings
- Task IDs must be unique within their bundle
- The dependency graph must be a DAG (no cycles)
- Output ONLY valid JSON, no markdown fences or explanation`;

export async function generateTaskGraph(
	designContent: string,
	changeId: string,
	specNames: readonly string[],
	llmClient: LlmClient,
	options?: GenerateOptions,
): Promise<GenerateResult | GenerateError> {
	const maxRetries = options?.maxRetries ?? 3;

	const userPrompt = `Change ID: ${changeId}

Available spec names for owner_capabilities: ${specNames.join(", ")}

Design document:

${designContent}`;

	let lastErrors: readonly string[] = [];

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const prompt =
			attempt === 0
				? userPrompt
				: `${userPrompt}\n\nPrevious attempt failed validation with these errors:\n${lastErrors.join("\n")}\n\nPlease fix and try again.`;

		const raw = await llmClient.generateJson(SYSTEM_PROMPT, prompt);

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			lastErrors = [`JSON parse error: ${raw.slice(0, 200)}`];
			continue;
		}

		// R3-F06: the schema now requires `size_score === tasks.length` when the
		// field is present. If the LLM includes a stale or mismatched size_score,
		// validation would fail even though the post-process step (`withSizeScore`)
		// is designed to overwrite stale values. Strip `size_score` before
		// validation so only the core structural/content rules gate generation;
		// the deterministic value is then applied by `withSizeScore`.
		const sanitized = stripSizeScore(parsed);
		const validation = validateTaskGraph(sanitized);
		if (validation.valid) {
			const enriched = withSizeScore(sanitized as TaskGraph);
			return { ok: true, taskGraph: deepFreeze(enriched) as TaskGraph };
		}

		lastErrors = validation.errors;
	}

	return {
		ok: false,
		error: `Task graph generation failed after ${maxRetries} attempts`,
		lastValidationErrors: lastErrors,
	};
}
