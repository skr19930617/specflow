import { parseJson, tryParseJson } from "../lib/json.js";
import { printSchemaJson, resolveCommand, tryExec } from "../lib/process.js";
import type {
	DesignArtifactNextResult,
	DesignArtifactValidateResult,
} from "../types/contracts.js";

function usage(): never {
	process.stderr.write(`Usage: specflow-design-artifacts <subcommand> <CHANGE_ID>

Subcommands:
  next      Return the next ready artifact's metadata (one-at-a-time)
  validate  Run structural validation on the change

`);
	process.exit(1);
}

function openspec(args: readonly string[]) {
	return tryExec(
		resolveCommand("SPECFLOW_OPENSPEC", "openspec"),
		args,
		process.cwd(),
	);
}

function cmdNext(changeId: string): never {
	const statusResult = openspec(["status", "--change", changeId, "--json"]);
	if (statusResult.status !== 0) {
		printSchemaJson("design-artifact-next", {
			status: "error",
			error: "openspec status failed",
		} satisfies DesignArtifactNextResult);
		process.exit(1);
	}
	const statusJson = parseJson<Record<string, unknown>>(
		statusResult.stdout,
		"openspec status",
	);
	if (statusJson.isComplete === true) {
		printSchemaJson("design-artifact-next", {
			status: "complete",
		} satisfies DesignArtifactNextResult);
		process.exit(0);
	}

	const artifacts = Array.isArray(statusJson.artifacts)
		? statusJson.artifacts
		: [];
	const ready = artifacts.filter(
		(artifact) =>
			artifact &&
			typeof artifact === "object" &&
			(artifact as { status?: unknown }).status === "ready",
	);
	if (ready.length === 0) {
		const blocked = artifacts
			.filter(
				(artifact) =>
					artifact &&
					typeof artifact === "object" &&
					(artifact as { status?: unknown }).status === "blocked",
			)
			.map((artifact) => String((artifact as { id?: unknown }).id ?? ""));
		printSchemaJson("design-artifact-next", {
			status: "blocked",
			blocked,
		} satisfies DesignArtifactNextResult);
		process.exit(1);
	}

	const artifactId = String((ready[0] as { id?: unknown }).id ?? "");
	process.stderr.write(`Fetching instructions for artifact: ${artifactId}\n`);
	const instructionsResult = openspec([
		"instructions",
		artifactId,
		"--change",
		changeId,
		"--json",
	]);
	if (instructionsResult.status !== 0) {
		printSchemaJson("design-artifact-next", {
			status: "error",
			error: `openspec instructions failed for ${artifactId}`,
		} satisfies DesignArtifactNextResult);
		process.exit(1);
	}
	const instructions = parseJson<Record<string, unknown>>(
		instructionsResult.stdout,
		"openspec instructions",
	);
	const outputPath =
		instructions.outputPath == null
			? undefined
			: String(instructions.outputPath);
	const template =
		instructions.template == null ? undefined : String(instructions.template);
	const instruction =
		instructions.instruction == null
			? undefined
			: String(instructions.instruction);
	printSchemaJson("design-artifact-next", {
		status: "ready",
		artifactId,
		outputPath,
		template,
		instruction,
		dependencies: Array.isArray(instructions.dependencies)
			? instructions.dependencies.map((dependency) => {
					const value = dependency as {
						id?: unknown;
						path?: unknown;
						done?: unknown;
					};
					return {
						id: value.id,
						path: value.path,
						done: value.done,
					};
				})
			: [],
	} satisfies DesignArtifactNextResult);
	process.exit(0);
}

function cmdValidate(changeId: string): never {
	const result = openspec(["validate", changeId, "--type", "change", "--json"]);
	const parsed = tryParseJson<Record<string, unknown>>(
		result.stdout || result.stderr,
	);
	if (!parsed) {
		printSchemaJson("design-artifact-validate", {
			status: "error",
			error: result.stdout || result.stderr,
		} satisfies DesignArtifactValidateResult);
		process.exit(1);
	}
	const valid = Boolean(
		(
			(parsed.items as unknown[] | undefined)?.[0] as
				| { valid?: unknown }
				| undefined
		)?.valid,
	);
	if (valid) {
		printSchemaJson("design-artifact-validate", {
			status: "valid",
		} satisfies DesignArtifactValidateResult);
		process.exit(0);
	}
	printSchemaJson("design-artifact-validate", {
		...parsed,
		status: "invalid",
	} satisfies DesignArtifactValidateResult);
	process.exit(1);
}

function main(): void {
	const [subcommand, changeId] = process.argv.slice(2);
	if (!subcommand) {
		usage();
	}
	if (!changeId) {
		process.stderr.write("Error: CHANGE_ID required\n");
		usage();
	}
	switch (subcommand) {
		case "next":
			cmdNext(changeId);
			break;
		case "validate":
			cmdValidate(changeId);
			break;
		default:
			process.stderr.write(`Error: unknown subcommand '${subcommand}'\n`);
			usage();
	}
}

main();
