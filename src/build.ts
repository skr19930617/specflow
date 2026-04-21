import { contracts } from "./contracts/install.js";
import {
	lintCommandTemplates,
	resolveAllTemplates,
} from "./contracts/template-resolver.js";
import { renderCommands } from "./generators/commands.js";
import { renderInstallPlan } from "./generators/install-plan.js";
import { renderPrompts } from "./generators/prompts.js";
import { renderReadmeWorkflowDiagram } from "./generators/readme.js";
import { renderStaticAssets } from "./generators/static-assets.js";
import { renderTemplates } from "./generators/templates.js";
import { renderWorkflow } from "./generators/workflow.js";
import { createManifest, validateContracts } from "./lib/contracts.js";
import { writeText } from "./lib/fs.js";
import { fromRepo } from "./lib/paths.js";
import { exec } from "./lib/process.js";
import { renderWorkflowReadmeBlock } from "./lib/workflow-machine.js";

function gitCommit(): string {
	try {
		return exec("git", ["rev-parse", "--short", "HEAD"], process.cwd()).trim();
	} catch {
		return "unknown";
	}
}

function main(): void {
	const errors = validateContracts(contracts);
	if (errors.length > 0) {
		for (const error of errors) {
			console.error(
				`[${error.check}] ${error.id} (${error.type}) at ${error.filePath}`,
			);
			console.error(`  ${error.message}`);
		}
		process.exit(1);
	}

	// Template lint runs BEFORE resolution so errors point at raw template
	// files rather than resolved output (which inlines insertion snippets).
	const templatePaths = contracts.commands
		.map((c) => c.body.templatePath)
		.filter((p): p is string => p !== undefined)
		.map((p) => fromRepo(p));
	const lintErrors = lintCommandTemplates(templatePaths);
	if (lintErrors.length > 0) {
		for (const err of lintErrors) {
			console.error(`[command-template-lint] ${err.message}`);
		}
		process.exit(1);
	}

	const resolvedContracts = {
		...contracts,
		commands: resolveAllTemplates(contracts.commands),
	} as const;

	renderWorkflow(resolvedContracts.workflow);
	renderReadmeWorkflowDiagram(renderWorkflowReadmeBlock());
	renderPrompts(resolvedContracts.prompts);
	renderCommands(resolvedContracts.commands);
	renderTemplates(resolvedContracts.templates);
	renderStaticAssets();

	const installPlan = {
		copies: resolvedContracts.installCopies,
		links: resolvedContracts.installLinks,
		settingsMerge: resolvedContracts.installSettingsMerge,
	} as const;
	renderInstallPlan(installPlan);

	const generatedAt = new Date().toISOString();
	const manifest = createManifest(resolvedContracts, generatedAt, gitCommit());
	writeText(
		fromRepo("dist/manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	writeText(
		fromRepo("dist/contracts.json"),
		`${JSON.stringify(resolvedContracts, null, 2)}\n`,
	);
}

main();
