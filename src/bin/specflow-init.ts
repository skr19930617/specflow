import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { stdin as input } from "node:process";
import readline from "node:readline/promises";
import { renderClaudeMdStrict } from "../lib/claude-renderer.js";
import { tryGit } from "../lib/git.js";
import {
	moduleRepoRoot,
	printSchemaJson,
	resolveCommand,
	tryExec,
} from "../lib/process.js";
import { readProfileStrict } from "../lib/profile-schema.js";
import {
	mergeProjectGitignore,
	renderProjectGitignore,
} from "../lib/project-gitignore.js";
import type { InitProjectResult, Manifest } from "../types/contracts.js";

const CONFIG_DIR = resolve(process.env.HOME ?? "", ".config/specflow");
const MAIN_AGENTS = ["claude", "codex", "copilot"];
const REVIEW_AGENTS = ["codex", "claude"];

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

function installMissingTemplateFile(
	templateDir: string,
	targetRoot: string,
	relativePath: string,
	createdFiles: string[],
	warnings: string[],
): void {
	const source = resolve(templateDir, relativePath);
	const target = resolve(targetRoot, relativePath);
	if (existsSync(target)) {
		return;
	}
	if (!existsSync(source)) {
		warnings.push(`template/${relativePath} not found, skipping`);
		log(`Warning: template/${relativePath} not found, skipping`);
		return;
	}
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
	createdFiles.push(relativePath);
	log(`Created ${relativePath}`);
}

function recordClaudeWrite(
	existedBeforeWrite: boolean,
	createdFiles: string[],
	updatedFiles: string[],
	label: string,
): void {
	if (existedBeforeWrite) {
		updatedFiles.push(label);
		return;
	}
	createdFiles.push(label);
}

async function updateClaudeTemplateOnly(
	templateClaude: string,
	createdFiles: string[],
	updatedFiles: string[],
): Promise<void> {
	if (!existsSync(templateClaude)) {
		return;
	}

	if (!existsSync("CLAUDE.md")) {
		copyFileSync(templateClaude, "CLAUDE.md");
		createdFiles.push("CLAUDE.md");
		log("Created CLAUDE.md");
		return;
	}

	if (
		readFileSync(templateClaude, "utf8") === readFileSync("CLAUDE.md", "utf8")
	) {
		log("CLAUDE.md is up to date");
		return;
	}

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
		return;
	}
	log("Skipped CLAUDE.md");
}

async function updateClaudeFromProfile(
	profilePath: string,
	createdFiles: string[],
	updatedFiles: string[],
): Promise<void> {
	const profileResult = readProfileStrict(profilePath);
	if ("error" in profileResult) {
		die(
			`Error: ${profileResult.error}\nRun 'specflow.setup' to fix the profile.`,
		);
	}

	const claudeExists = existsSync("CLAUDE.md");
	const claudeContent = claudeExists ? readFileSync("CLAUDE.md", "utf8") : null;
	const renderResult = renderClaudeMdStrict(
		profileResult.profile,
		claudeContent,
	);

	if (renderResult.writeDisposition === "abort") {
		die(
			renderResult.warning
				? `Error: ${renderResult.warning}`
				: "Error: CLAUDE.md rendering aborted due to marker/version issue.",
		);
	}

	if (renderResult.warning) {
		log(`Warning: ${renderResult.warning}`);
	}
	if (renderResult.diffPreview) {
		process.stderr.write(`${renderResult.diffPreview}\n\n`);
	}

	if (renderResult.writeDisposition === "confirmation-required") {
		const rl = readline.createInterface({ input, output: process.stderr });
		const accept = await promptYesNo(
			rl,
			"Apply profile-rendered CLAUDE.md changes?",
			"n",
		);
		rl.close();
		if (accept !== "y") {
			log("Skipped profile-based CLAUDE.md rendering");
			return;
		}
	}

	writeFileSync("CLAUDE.md", renderResult.nextContent, "utf8");
	recordClaudeWrite(
		claudeExists,
		createdFiles,
		updatedFiles,
		"CLAUDE.md (profile-rendered)",
	);
	log("Rendered CLAUDE.md from profile");
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

	installMissingTemplateFile(
		templateDir,
		updateRoot,
		".specflow/config.env",
		createdFiles,
		warnings,
	);
	installMissingTemplateFile(
		templateDir,
		updateRoot,
		".specflow/config.yaml",
		createdFiles,
		warnings,
	);
	installMissingTemplateFile(
		templateDir,
		updateRoot,
		".gitignore",
		createdFiles,
		warnings,
	);

	const profilePath = resolve(updateRoot, ".specflow/profile.json");
	const templateClaude = resolve(templateDir, "CLAUDE.md");
	if (existsSync(profilePath)) {
		await updateClaudeFromProfile(profilePath, createdFiles, updatedFiles);
	} else {
		await updateClaudeTemplateOnly(templateClaude, createdFiles, updatedFiles);
		log(
			"No .specflow/profile.json found. Run `specflow.setup` to generate a project profile.",
		);
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
			log("Skipping CLAUDE.md template copy.");
		}
	}

	if (ensureProjectGitignore(root, templateDir, trackClaudeDir === "y")) {
		updatedFiles.push(".gitignore");
	}

	const claudeTemplate = resolve(templateDir, "CLAUDE.md");
	if (!existsSync(resolve(root, "CLAUDE.md")) && existsSync(claudeTemplate)) {
		copyFileSync(claudeTemplate, resolve(root, "CLAUDE.md"));
		createdFiles.push("CLAUDE.md");
		log(
			"Created CLAUDE.md — run '/specflow.setup' to generate a project profile and render managed sections",
		);
	} else if (existsSync(resolve(root, "CLAUDE.md"))) {
		log("CLAUDE.md already exists, skipped");
	}

	const sharedPolicyTemplate = resolve(templateDir, ".specflow/config.yaml");
	const sharedPolicyTarget = resolve(root, ".specflow/config.yaml");
	if (!existsSync(sharedPolicyTarget) && existsSync(sharedPolicyTemplate)) {
		copyFileSync(sharedPolicyTemplate, sharedPolicyTarget);
		createdFiles.push(".specflow/config.yaml");
		log(
			"Created .specflow/config.yaml — shared workflow policy (commit this file)",
		);
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
	log(
		"  1. Run '/specflow.setup' to generate .specflow/profile.json and render CLAUDE.md",
	);
	log(
		"  2. Add any repository-specific notes below the managed block in CLAUDE.md if needed",
	);
	log("  3. Run '/specflow <issue-url-or-text>' to start your first feature");
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
