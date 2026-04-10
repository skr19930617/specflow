import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input } from "node:process";
import type { InitProjectResult, Manifest } from "../types/contracts.js";
import {
	moduleRepoRoot,
	printSchemaJson,
	resolveCommand,
	tryExec,
} from "../lib/process.js";
import { tryGit } from "../lib/git.js";
import {
	mergeProjectGitignore,
	renderProjectGitignore,
} from "../lib/project-gitignore.js";

const CONFIG_DIR = resolve(process.env.HOME ?? "", ".config/specflow");
const MAIN_AGENTS = ["claude"];
const REVIEW_AGENTS = ["codex"];

function log(message: string): void {
	process.stderr.write(`${message}\n`);
}

function die(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function readManifest(runtimeRoot: string): Manifest {
	return JSON.parse(
		readFileSync(resolve(runtimeRoot, "dist/manifest.json"), "utf8"),
	) as Manifest;
}

async function selectAgent(
	rl: readline.Interface,
	agents: readonly string[],
	role: string,
	defaultIndex = 0,
): Promise<string> {
	process.stderr.write(`Select ${role} agent:\n`);
	agents.forEach((agent, index) => {
		process.stderr.write(
			`  ${index + 1}) ${agent}${index === defaultIndex ? " [default]" : ""}\n`,
		);
	});
	while (true) {
		const answer = await rl.question("> ");
		if (!answer.trim()) {
			return agents[defaultIndex];
		}
		const choice = Number(answer.trim());
		if (Number.isInteger(choice) && choice >= 1 && choice <= agents.length) {
			return agents[choice - 1];
		}
		process.stderr.write(
			`  Invalid choice. Enter 1-${agents.length} or press Enter for default.\n`,
		);
	}
}

async function promptProjectName(
	rl: readline.Interface,
	defaultName: string,
): Promise<string> {
	const answer = await rl.question(`Project name [${defaultName}]: `);
	return answer.trim() || defaultName;
}

async function promptYesNo(
	rl: readline.Interface,
	question: string,
	defaultValue: "y" | "n",
): Promise<"y" | "n"> {
	const hint = defaultValue === "y" ? "[Y/n]" : "[y/N]";
	while (true) {
		const answer = (await rl.question(`${question} ${hint}: `))
			.trim()
			.toLowerCase();
		const value = answer || defaultValue;
		if (value === "y" || value === "yes") {
			return "y";
		}
		if (value === "n" || value === "no") {
			return "n";
		}
		process.stderr.write("  Please enter y or n.\n");
	}
}

function ensureProjectGitignore(
	targetPath: string,
	templateDir: string,
	trackClaudeDir: boolean,
): boolean {
	const gitignore = resolve(targetPath, ".gitignore");
	const gitignoreTemplate = resolve(templateDir, ".gitignore");
	const options = {
		claudeMode: trackClaudeDir ? "settings-only" : "directory",
	} as const;
	if (!existsSync(gitignoreTemplate)) {
		log(`Warning: ${gitignoreTemplate} not found, skipping .gitignore update`);
		return false;
	}
	const templateContent = readFileSync(gitignoreTemplate, "utf8");
	if (!existsSync(gitignore)) {
		writeFileSync(
			gitignore,
			renderProjectGitignore(templateContent, options),
			"utf8",
		);
		log("Created .gitignore with specflow-generated ignores");
		return true;
	}
	const merged = mergeProjectGitignore(
		readFileSync(gitignore, "utf8"),
		templateContent,
		options,
	);
	if (!merged.changed) {
		log(".gitignore already contains specflow-generated ignores, skipped");
		return false;
	}
	writeFileSync(gitignore, merged.content, "utf8");
	log("Updated .gitignore with specflow-generated ignores");
	return true;
}

function ensureNotSubdirectory(targetPath: string): void {
	let checkDir = targetPath;
	while (!existsSync(checkDir) && dirname(checkDir) !== checkDir) {
		checkDir = dirname(checkDir);
	}
	if (!existsSync(checkDir)) {
		return;
	}
	const gitRoot = tryGit(["rev-parse", "--show-toplevel"], checkDir);
	if (gitRoot.status !== 0) {
		return;
	}
	const resolvedTarget = resolve(targetPath);
	if (resolvedTarget !== gitRoot.stdout.trim()) {
		die(
			`Error: ${targetPath} is inside an existing git repository (${gitRoot.stdout.trim()}).\nInitialize at the repository root instead.`,
		);
	}
}

function copyCommandFiles(
	manifest: Manifest,
	sourceCommandsDir: string,
	overwrite: boolean,
): string[] {
	mkdirSync(resolve(process.env.HOME ?? "", ".claude/commands"), {
		recursive: true,
	});
	const installed: string[] = [];
	for (const command of manifest.commands) {
		const base = command.filePath.split("/").pop() ?? `${command.id}.md`;
		const source = resolve(sourceCommandsDir, base);
		if (!existsSync(source)) {
			continue;
		}
		const target = resolve(process.env.HOME ?? "", ".claude/commands", base);
		if (!overwrite && existsSync(target)) {
			continue;
		}
		copyFileSync(source, target);
		installed.push(command.id);
		log(`${overwrite ? "Updated" : "Installed"} ~/.claude/commands/${base}`);
	}
	return installed;
}

function verifyPrompts(globalDir: string, warnings: string[]): void {
	const promptsDir = resolve(globalDir, "prompts");
	if (!existsSync(promptsDir)) {
		warnings.push("prompts/ not found. Run 'specflow-install' to fix.");
		log("Warning: prompts/ not found. Run 'specflow-install' to fix.");
		return;
	}
	const count = readdirSync(promptsDir).filter((entry) =>
		entry.endsWith(".md"),
	).length;
	log(`Verified ${count} prompt(s) in ${promptsDir}/`);
}

async function runUpdateMode(runtimeRoot: string): Promise<never> {
	const updateRoot =
		tryGit(["rev-parse", "--show-toplevel"], process.cwd()).stdout.trim() ||
		process.cwd();
	process.chdir(updateRoot);
	const globalDir = resolve(CONFIG_DIR, "global");
	const templateDir = resolve(CONFIG_DIR, "template");
	if (!existsSync(globalDir)) {
		die(
			`Error: global/ not found at ${globalDir}\nRun 'specflow-install' to update.`,
		);
	}

	const createdFiles: string[] = [];
	const updatedFiles: string[] = [];
	const warnings: string[] = [];
	const manifest = readManifest(runtimeRoot);
	const installedCommands = copyCommandFiles(
		manifest,
		resolve(globalDir, "commands"),
		true,
	);
	verifyPrompts(globalDir, warnings);

	const templateMcp = resolve(templateDir, ".mcp.json");
	if (existsSync(templateMcp)) {
		copyFileSync(templateMcp, ".mcp.json");
		updatedFiles.push(".mcp.json");
		log("Updated .mcp.json");
	} else {
		warnings.push("template/.mcp.json not found, skipping");
		log("Warning: template/.mcp.json not found, skipping");
	}

	const templateClaude = resolve(templateDir, "CLAUDE.md");
	if (existsSync(templateClaude)) {
		if (!existsSync("CLAUDE.md")) {
			copyFileSync(templateClaude, "CLAUDE.md");
			createdFiles.push("CLAUDE.md");
			log("Created CLAUDE.md");
		} else if (
			readFileSync(templateClaude, "utf8") !== readFileSync("CLAUDE.md", "utf8")
		) {
			log("CLAUDE.md differs from the template:");
			const diff = tryExec(
				"diff",
				["-u", "CLAUDE.md", templateClaude],
				process.cwd(),
			);
			const preview = diff.stdout.split("\n").slice(0, 40).join("\n");
			if (preview.trim()) {
				process.stderr.write(`${preview}\n\n`);
			}
			const rl = readline.createInterface({ input, output: process.stderr });
			const overwrite = await promptYesNo(
				rl,
				"Overwrite CLAUDE.md with template? (your changes will be lost)",
				"n",
			);
			rl.close();
			if (overwrite === "y") {
				copyFileSync(templateClaude, "CLAUDE.md");
				updatedFiles.push("CLAUDE.md");
				log("Updated CLAUDE.md");
			} else {
				log("Skipped CLAUDE.md");
			}
		} else {
			log("CLAUDE.md is up to date");
		}
	}

	log("Done. All templates updated.");
	printSchemaJson("init-project", {
		mode: "update",
		project_name: basename(updateRoot),
		location: updateRoot,
		created_files: createdFiles,
		updated_files: updatedFiles,
		installed_commands: installedCommands,
		warnings,
	} satisfies InitProjectResult);
	process.exit(0);
}

function injectProjectContext(configPath: string, projectName: string): void {
	const content = readFileSync(configPath, "utf8");
	if (content.includes("context:")) {
		return;
	}
	const lines = content.split("\n");
	lines.splice(
		1,
		0,
		`context: "Project: ${projectName.replace(/["\\]/g, "\\$&")}"`,
	);
	writeFileSync(configPath, `${lines.join("\n")}\n`, "utf8");
	log("Added project name to openspec/config.yaml context");
}

async function main(): Promise<void> {
	const runtimeRoot = moduleRepoRoot(import.meta.url);
	const args = process.argv.slice(2);
	let updateMode = false;
	let projectName = "";
	let targetDir = "";

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--update") {
			updateMode = true;
			continue;
		}
		if (arg === "--dir") {
			targetDir =
				args[index + 1] ?? die("Error: --dir requires a path argument");
			index += 1;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			process.stdout.write(`Usage: specflow-init [<project-name>] [--dir <path>] [--update]

Initialize a new specflow + OpenSpec project.
`);
			process.exit(0);
		}
		if (arg.startsWith("-")) {
			die(
				`Unknown option: ${arg}\nUsage: specflow-init [<project-name>] [--dir <path>] [--update]`,
			);
		}
		if (projectName) {
			die(
				`Error: unexpected argument: ${arg}\nUsage: specflow-init [<project-name>] [--dir <path>] [--update]`,
			);
		}
		projectName = arg;
	}

	if (updateMode) {
		await runUpdateMode(runtimeRoot);
		return;
	}

	if (!existsSync(resolve(CONFIG_DIR, "template"))) {
		die(
			"Error: specflow is not installed.\nRun 'specflow-install' first (from the specflow repository).",
		);
	}

	let targetPath = "";
	let flow: "name" | "dir" | "noargs";
	if (targetDir) {
		targetPath = targetDir;
		flow = "dir";
	} else if (projectName) {
		targetPath = `./${projectName}`;
		flow = "name";
	} else {
		const gitRoot = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
		if (gitRoot.status !== 0 || !gitRoot.stdout.trim()) {
			die(
				"Error: not inside a git repository.\nUse 'specflow-init <project-name>' to create a new project.",
			);
		}
		targetPath = gitRoot.stdout.trim();
		flow = "noargs";
	}

	if (flow === "dir") {
		ensureNotSubdirectory(targetPath);
	}
	if (existsSync(resolve(targetPath, ".specflow/config.env"))) {
		die(
			`specflow already initialized in ${targetPath}\nUse --update to refresh slash commands only.`,
		);
	}

	mkdirSync(targetPath, { recursive: true });
	process.chdir(targetPath);
	const root = process.cwd();
	const createdFiles: string[] = [];
	const updatedFiles: string[] = [];
	const warnings: string[] = [];

	const isGitRepo = tryGit(["rev-parse", "--show-toplevel"], root);
	if (isGitRepo.status !== 0) {
		const init = tryExec("git", ["init"], root);
		if (init.stdout) {
			process.stderr.write(init.stdout);
		}
		log("Initialized git repository");
	}

	const rl = readline.createInterface({ input, output: process.stderr });
	if (!projectName) {
		projectName = await promptProjectName(rl, basename(root));
	}

	process.stderr.write("\n");
	const mainAgent = await selectAgent(rl, MAIN_AGENTS, "main");
	process.stderr.write(`  → main agent: ${mainAgent}\n\n`);
	const reviewAgent = await selectAgent(rl, REVIEW_AGENTS, "review");
	process.stderr.write(`  → review agent: ${reviewAgent}\n\n`);
	process.stderr.write(
		"Track .claude/ in git? (commands/ and skills/ will be shared with the team)\n",
	);
	const trackClaudeDir = await promptYesNo(rl, "Include .claude/ in git?", "y");
	process.stderr.write(`  → track .claude/: ${trackClaudeDir}\n\n`);
	rl.close();

	const toolsArg = `${mainAgent},${reviewAgent}`;
	const openspec = resolveCommand("SPECFLOW_OPENSPEC", "openspec");
	const openspecInit = tryExec(
		openspec,
		["init", ".", "--tools", toolsArg, "--force"],
		root,
	);
	const openspecInitialized = openspecInit.status === 0;
	if (openspecInit.status === 0) {
		log(`Initialized openspec/ with tools: ${toolsArg}`);
		const configPath = resolve(root, "openspec/config.yaml");
		if (existsSync(configPath)) {
			injectProjectContext(configPath, projectName);
			updatedFiles.push("openspec/config.yaml");
		}
	} else {
		warnings.push("openspec init failed, continuing without openspec");
		log("Warning: openspec init failed, continuing without openspec");
	}

	mkdirSync(resolve(root, ".specflow"), { recursive: true });
	writeFileSync(
		resolve(root, ".specflow/config.env"),
		`# specflow agent configuration\n# Edit these values to change your agents\nSPECFLOW_MAIN_AGENT=${mainAgent}\nSPECFLOW_REVIEW_AGENT=${reviewAgent}\n`,
		"utf8",
	);
	createdFiles.push(".specflow/config.env");
	log("Created .specflow/config.env");

	let templateDir = resolve(CONFIG_DIR, "template");
	if (process.env.SPECFLOW_TEMPLATE_REPO) {
		const gh = resolveCommand("SPECFLOW_GH", "gh");
		const tmp = resolve(
			process.env.TMPDIR || "/tmp",
			`specflow-template-${process.pid}-${Date.now()}`,
		);
		mkdirSync(tmp, { recursive: true });
		log(`Fetching template from ${process.env.SPECFLOW_TEMPLATE_REPO}...`);
		const clone = tryExec(
			gh,
			[
				"repo",
				"clone",
				process.env.SPECFLOW_TEMPLATE_REPO,
				`${tmp}/template`,
				"--",
				"--depth",
				"1",
			],
			root,
		);
		if (clone.status === 0) {
			templateDir = resolve(tmp, "template");
		} else {
			warnings.push(
				`Failed to clone template repo: ${process.env.SPECFLOW_TEMPLATE_REPO}`,
			);
			log(
				`Warning: Failed to clone template repo: ${process.env.SPECFLOW_TEMPLATE_REPO}`,
			);
			log("Skipping .mcp.json and CLAUDE.md template copy.");
		}
	}

	if (ensureProjectGitignore(root, templateDir, trackClaudeDir === "y")) {
		updatedFiles.push(".gitignore");
	}

	const mcpTemplate = resolve(templateDir, ".mcp.json");
	if (!existsSync(resolve(root, ".mcp.json")) && existsSync(mcpTemplate)) {
		copyFileSync(mcpTemplate, resolve(root, ".mcp.json"));
		createdFiles.push(".mcp.json");
		log("Created .mcp.json");
	} else if (existsSync(resolve(root, ".mcp.json"))) {
		log(".mcp.json already exists, skipped");
	}

	const claudeTemplate = resolve(templateDir, "CLAUDE.md");
	if (!existsSync(resolve(root, "CLAUDE.md")) && existsSync(claudeTemplate)) {
		copyFileSync(claudeTemplate, resolve(root, "CLAUDE.md"));
		createdFiles.push("CLAUDE.md");
		log("Created CLAUDE.md — edit to match your project");
	} else if (existsSync(resolve(root, "CLAUDE.md"))) {
		log("CLAUDE.md already exists, skipped");
	}

	const globalDir = resolve(CONFIG_DIR, "global");
	let installedCommands: string[] = [];
	if (existsSync(resolve(globalDir, "commands"))) {
		installedCommands = copyCommandFiles(
			readManifest(runtimeRoot),
			resolve(globalDir, "commands"),
			false,
		);
	} else {
		warnings.push(
			`${resolve(globalDir, "commands")}/ not found, skipping slash commands`,
		);
		log(
			`Warning: ${resolve(globalDir, "commands")}/ not found, skipping slash commands`,
		);
	}

	log(`Initialized specflow project: ${projectName}`);
	log(`  Location: ${root}`);
	log(`  Main agent: ${mainAgent}`);
	log(`  Review agent: ${reviewAgent}`);
	log("Next steps:");
	log("  1. Edit CLAUDE.md — fill in Tech Stack, Commands, Code Style");
	log("  2. Run '/specflow <issue-url>' to start your first feature");
	printSchemaJson("init-project", {
		mode: "init",
		project_name: projectName,
		location: root,
		main_agent: mainAgent,
		review_agent: reviewAgent,
		track_claude_dir: trackClaudeDir === "y",
		openspec_initialized: openspecInitialized,
		created_files: createdFiles,
		updated_files: updatedFiles,
		installed_commands: installedCommands,
		warnings,
	} satisfies InitProjectResult);
}

main().catch((error) => {
	die(error instanceof Error ? error.message : String(error));
});
