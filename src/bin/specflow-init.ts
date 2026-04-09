import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Manifest } from "../types/contracts.js";
import { moduleRepoRoot, resolveCommand, tryExec } from "../lib/process.js";
import { currentBranch, projectRoot as gitProjectRoot, tryGit } from "../lib/git.js";

const CONFIG_DIR = resolve(process.env.HOME ?? "", ".config/specflow");
const MAIN_AGENTS = ["claude"];
const REVIEW_AGENTS = ["codex"];

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readManifest(runtimeRoot: string): Manifest {
  return JSON.parse(readFileSync(resolve(runtimeRoot, "dist/manifest.json"), "utf8")) as Manifest;
}

async function selectAgent(rl: readline.Interface, agents: readonly string[], role: string, defaultIndex = 0): Promise<string> {
  process.stderr.write(`Select ${role} agent:\n`);
  agents.forEach((agent, index) => {
    process.stderr.write(`  ${index + 1}) ${agent}${index === defaultIndex ? " [default]" : ""}\n`);
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
    process.stderr.write(`  Invalid choice. Enter 1-${agents.length} or press Enter for default.\n`);
  }
}

async function promptProjectName(rl: readline.Interface, defaultName: string): Promise<string> {
  const answer = await rl.question(`Project name [${defaultName}]: `);
  return answer.trim() || defaultName;
}

async function promptYesNo(rl: readline.Interface, question: string, defaultValue: "y" | "n"): Promise<"y" | "n"> {
  const hint = defaultValue === "y" ? "[Y/n]" : "[y/N]";
  while (true) {
    const answer = (await rl.question(`${question} ${hint}: `)).trim().toLowerCase();
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

function ensureGitignoreEntry(targetPath: string, entry: string): void {
  const gitignore = resolve(targetPath, ".gitignore");
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, `${entry}\n`, "utf8");
    process.stdout.write(`Created .gitignore with ${entry}\n`);
    return;
  }
  const content = readFileSync(gitignore, "utf8");
  if (content.split("\n").includes(entry)) {
    process.stdout.write(`.gitignore already contains ${entry}, skipped\n`);
    return;
  }
  writeFileSync(gitignore, `${content}${content.endsWith("\n") ? "" : "\n"}${entry}\n`, "utf8");
  process.stdout.write(`Added ${entry} to .gitignore\n`);
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
    die(`Error: ${targetPath} is inside an existing git repository (${gitRoot.stdout.trim()}).\nInitialize at the repository root instead.`);
  }
}

function copyCommandFiles(manifest: Manifest, sourceCommandsDir: string, overwrite: boolean): void {
  mkdirSync(resolve(process.env.HOME ?? "", ".claude/commands"), { recursive: true });
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
    process.stdout.write(`${overwrite ? "Updated" : "Installed"} ~/.claude/commands/${base}\n`);
  }
}

function verifyPrompts(globalDir: string): void {
  const promptsDir = resolve(globalDir, "prompts");
  if (!existsSync(promptsDir)) {
    process.stdout.write("Warning: prompts/ not found. Run 'specflow-install' to fix.\n");
    return;
  }
  const count = readdirSync(promptsDir).filter((entry) => entry.endsWith(".md")).length;
  process.stdout.write(`Verified ${count} prompt(s) in ${promptsDir}/\n`);
}

async function runUpdateMode(runtimeRoot: string): Promise<never> {
  const updateRoot = tryGit(["rev-parse", "--show-toplevel"], process.cwd()).stdout.trim() || process.cwd();
  process.chdir(updateRoot);
  const globalDir = resolve(CONFIG_DIR, "global");
  const templateDir = resolve(CONFIG_DIR, "template");
  if (!existsSync(globalDir)) {
    die(`Error: global/ not found at ${globalDir}\nRun 'specflow-install' to update.`);
  }

  const manifest = readManifest(runtimeRoot);
  copyCommandFiles(manifest, resolve(globalDir, "commands"), true);
  verifyPrompts(globalDir);

  const templateMcp = resolve(templateDir, ".mcp.json");
  if (existsSync(templateMcp)) {
    copyFileSync(templateMcp, ".mcp.json");
    process.stdout.write("Updated .mcp.json\n");
  } else {
    process.stdout.write("Warning: template/.mcp.json not found, skipping\n");
  }

  const templateClaude = resolve(templateDir, "CLAUDE.md");
  if (existsSync(templateClaude)) {
    if (!existsSync("CLAUDE.md")) {
      copyFileSync(templateClaude, "CLAUDE.md");
      process.stdout.write("Created CLAUDE.md\n");
    } else if (readFileSync(templateClaude, "utf8") !== readFileSync("CLAUDE.md", "utf8")) {
      process.stdout.write("\nCLAUDE.md differs from the template:\n");
      const diff = tryExec("diff", ["-u", "CLAUDE.md", templateClaude], process.cwd());
      const preview = diff.stdout.split("\n").slice(0, 40).join("\n");
      if (preview.trim()) {
        process.stdout.write(`${preview}\n\n`);
      }
      const rl = readline.createInterface({ input, output });
      const overwrite = await promptYesNo(rl, "Overwrite CLAUDE.md with template? (your changes will be lost)", "n");
      rl.close();
      if (overwrite === "y") {
        copyFileSync(templateClaude, "CLAUDE.md");
        process.stdout.write("Updated CLAUDE.md\n");
      } else {
        process.stdout.write("Skipped CLAUDE.md\n");
      }
    } else {
      process.stdout.write("CLAUDE.md is up to date\n");
    }
  }

  process.stdout.write("\nDone. All templates updated.\n");
  process.exit(0);
}

function injectProjectContext(configPath: string, projectName: string): void {
  const content = readFileSync(configPath, "utf8");
  if (content.includes("context:")) {
    return;
  }
  const lines = content.split("\n");
  lines.splice(1, 0, `context: "Project: ${projectName.replace(/["\\]/g, "\\$&")}"`);
  writeFileSync(configPath, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write("Added project name to openspec/config.yaml context\n");
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
      targetDir = args[index + 1] ?? die("Error: --dir requires a path argument");
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
      die(`Unknown option: ${arg}\nUsage: specflow-init [<project-name>] [--dir <path>] [--update]`);
    }
    if (projectName) {
      die(`Error: unexpected argument: ${arg}\nUsage: specflow-init [<project-name>] [--dir <path>] [--update]`);
    }
    projectName = arg;
  }

  if (updateMode) {
    await runUpdateMode(runtimeRoot);
    return;
  }

  if (!existsSync(resolve(CONFIG_DIR, "template"))) {
    die("Error: specflow is not installed.\nRun 'specflow-install' first (from the specflow repository).");
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
      die("Error: not inside a git repository.\nUse 'specflow-init <project-name>' to create a new project.");
    }
    targetPath = gitRoot.stdout.trim();
    flow = "noargs";
  }

  if (flow === "dir") {
    ensureNotSubdirectory(targetPath);
  }
  if (existsSync(resolve(targetPath, ".specflow/config.env"))) {
    die(`specflow already initialized in ${targetPath}\nUse --update to refresh slash commands only.`);
  }

  mkdirSync(targetPath, { recursive: true });
  process.chdir(targetPath);
  const root = process.cwd();

  const isGitRepo = tryGit(["rev-parse", "--show-toplevel"], root);
  if (isGitRepo.status !== 0) {
    const init = tryExec("git", ["init"], root);
    if (init.stdout) {
      process.stdout.write(init.stdout);
    }
    process.stdout.write("Initialized git repository\n");
  }

  const rl = readline.createInterface({ input, output });
  if (!projectName) {
    projectName = await promptProjectName(rl, basename(root));
  }

  process.stdout.write("\n");
  const mainAgent = await selectAgent(rl, MAIN_AGENTS, "main");
  process.stdout.write(`  → main agent: ${mainAgent}\n\n`);
  const reviewAgent = await selectAgent(rl, REVIEW_AGENTS, "review");
  process.stdout.write(`  → review agent: ${reviewAgent}\n\n`);
  process.stdout.write("Track .claude/ in git? (commands/ and skills/ will be shared with the team)\n");
  const trackClaudeDir = await promptYesNo(rl, "Include .claude/ in git?", "y");
  process.stdout.write(`  → track .claude/: ${trackClaudeDir}\n\n`);
  rl.close();

  const toolsArg = `${mainAgent},${reviewAgent}`;
  const openspec = resolveCommand("SPECFLOW_OPENSPEC", "openspec");
  const openspecInit = tryExec(openspec, ["init", ".", "--tools", toolsArg, "--force"], root);
  if (openspecInit.status === 0) {
    process.stdout.write(`Initialized openspec/ with tools: ${toolsArg}\n`);
    const configPath = resolve(root, "openspec/config.yaml");
    if (existsSync(configPath)) {
      injectProjectContext(configPath, projectName);
    }
  } else {
    process.stdout.write("Warning: openspec init failed, continuing without openspec\n");
  }

  mkdirSync(resolve(root, ".specflow"), { recursive: true });
  writeFileSync(
    resolve(root, ".specflow/config.env"),
    `# specflow agent configuration\n# Edit these values to change your agents\nSPECFLOW_MAIN_AGENT=${mainAgent}\nSPECFLOW_REVIEW_AGENT=${reviewAgent}\n`,
    "utf8",
  );
  process.stdout.write("Created .specflow/config.env\n");

  if (trackClaudeDir === "y") {
    ensureGitignoreEntry(root, ".claude/settings.json");
    ensureGitignoreEntry(root, ".claude/settings.local.json");
  } else {
    ensureGitignoreEntry(root, ".claude/");
  }
  ensureGitignoreEntry(root, ".mcp.json");
  ensureGitignoreEntry(root, ".specflow/config.env");

  let templateDir = resolve(CONFIG_DIR, "template");
  if (process.env.SPECFLOW_TEMPLATE_REPO) {
    const gh = resolveCommand("SPECFLOW_GH", "gh");
    const tmp = resolve(process.env.TMPDIR || "/tmp", `specflow-template-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    process.stdout.write(`Fetching template from ${process.env.SPECFLOW_TEMPLATE_REPO}...\n`);
    const clone = tryExec(gh, ["repo", "clone", process.env.SPECFLOW_TEMPLATE_REPO, `${tmp}/template`, "--", "--depth", "1"], root);
    if (clone.status === 0) {
      templateDir = resolve(tmp, "template");
    } else {
      process.stdout.write(`Warning: Failed to clone template repo: ${process.env.SPECFLOW_TEMPLATE_REPO}\nSkipping .mcp.json and CLAUDE.md template copy.\n`);
    }
  }

  const mcpTemplate = resolve(templateDir, ".mcp.json");
  if (!existsSync(resolve(root, ".mcp.json")) && existsSync(mcpTemplate)) {
    copyFileSync(mcpTemplate, resolve(root, ".mcp.json"));
    process.stdout.write("Created .mcp.json\n");
  } else if (existsSync(resolve(root, ".mcp.json"))) {
    process.stdout.write(".mcp.json already exists, skipped\n");
  }

  const claudeTemplate = resolve(templateDir, "CLAUDE.md");
  if (!existsSync(resolve(root, "CLAUDE.md")) && existsSync(claudeTemplate)) {
    copyFileSync(claudeTemplate, resolve(root, "CLAUDE.md"));
    process.stdout.write("Created CLAUDE.md — edit to match your project\n");
  } else if (existsSync(resolve(root, "CLAUDE.md"))) {
    process.stdout.write("CLAUDE.md already exists, skipped\n");
  }

  const globalDir = resolve(CONFIG_DIR, "global");
  if (existsSync(resolve(globalDir, "commands"))) {
    copyCommandFiles(readManifest(runtimeRoot), resolve(globalDir, "commands"), false);
  } else {
    process.stdout.write(`Warning: ${resolve(globalDir, "commands")}/ not found, skipping slash commands\n`);
  }

  process.stdout.write(`\nInitialized specflow project: ${projectName}\n`);
  process.stdout.write(`  Location: ${root}\n`);
  process.stdout.write(`  Main agent: ${mainAgent}\n`);
  process.stdout.write(`  Review agent: ${reviewAgent}\n\n`);
  process.stdout.write("Next steps:\n");
  process.stdout.write("  1. Edit CLAUDE.md — fill in Tech Stack, Commands, Code Style\n");
  process.stdout.write("  2. Run '/specflow <issue-url>' to start your first feature\n");
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
