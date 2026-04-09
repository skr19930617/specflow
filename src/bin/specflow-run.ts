import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { moduleRepoRoot } from "../lib/process.js";

type JsonObject = Record<string, unknown>;

interface RunState extends JsonObject {
  run_id: string;
  change_name: string;
  current_phase: string;
  status: string;
  allowed_events: string[];
  issue: JsonObject | null;
  project_id: string;
  repo_name: string;
  repo_path: string;
  branch_name: string;
  worktree_path: string;
  agents: { main: string; review: string };
  last_summary_path: string | null;
  created_at: string;
  updated_at: string;
  history: { from: string; to: string; event: string; timestamp: string }[];
}

interface WorkflowDefinition {
  readonly version: string;
  readonly states: readonly string[];
  readonly events: readonly string[];
  readonly transitions: readonly { from: string; event: string; to: string }[];
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function git(args: readonly string[]): string {
  try {
    return execFileSync("git", [...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail("Error: not inside a git repository");
  }
}

function gitOrFail(args: readonly string[], message: string): string {
  try {
    return execFileSync("git", [...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    fail(message);
  }
}

function projectRoot(): string {
  return git(["rev-parse", "--show-toplevel"]);
}

function stateMachinePath(root: string): string {
  const projectLocal = resolve(root, "global/workflow/state-machine.json");
  try {
    readFileSync(projectLocal, "utf8");
    return projectLocal;
  } catch {
    const installed = resolve(process.env.HOME ?? "", ".config/specflow/global/workflow/state-machine.json");
    try {
      readFileSync(installed, "utf8");
      return installed;
    } catch {
      fail("Error: state-machine.json not found. Check global/workflow/ or ~/.config/specflow/global/workflow/");
    }
  }
}

function loadWorkflow(path: string): WorkflowDefinition {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorkflowDefinition;
  } catch {
    fail("Error: state-machine.json is not valid JSON");
  }
}

function validateRunId(root: string, runId: string): void {
  if (runId.includes("/") || runId.includes("..") || runId === ".") {
    fail(`Error: invalid run_id '${runId}'. Must not contain '/' or '..'`);
  }
  const changeDir = resolve(root, "openspec/changes", runId);
  try {
    const stat = readFileSync(resolve(changeDir, "proposal.md"), "utf8");
    void stat;
  } catch {
    fail(`Error: no OpenSpec change found for '${runId}'. Expected directory: openspec/changes/${runId}/`);
  }
}

function runsDir(root: string): string {
  return resolve(root, ".specflow/runs");
}

function runDir(root: string, runId: string): string {
  return resolve(runsDir(root), runId);
}

function runFile(root: string, runId: string): string {
  return resolve(runDir(root, runId), "run.json");
}

function ensureRunExists(root: string, runId: string): string {
  const path = runFile(root, runId);
  try {
    readFileSync(path, "utf8");
    return path;
  } catch {
    fail(`Error: run '${runId}' not found. No state file at ${path}`);
  }
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function allowedEventsFor(workflow: WorkflowDefinition, state: string): string[] {
  return workflow.transitions.filter((transition) => transition.from === state).map((transition) => transition.event);
}

function detectProjectId(): string {
  const remote = gitOrFail(["remote", "get-url", "origin"], "Error: could not detect git remote origin");
  return remote.replace(/\.git$/, "").replace(/^.*[:/]([^/]+\/[^/]+)$/, "$1");
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

function parseIssueMetadata(issueUrl: string): JsonObject {
  const fetchTool = process.env.SPECFLOW_FETCH_ISSUE ?? resolve(moduleRepoRoot(import.meta.url), "bin/specflow-fetch-issue");
  try {
    const stdout = execFileSync(fetchTool, [issueUrl], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(stdout) as { url: string; number: number; title: string };
    const repoMatch = issueUrl.match(/^https:\/\/[^/]+\/([^/]+\/[^/]+)\/issues\/\d+/);
    if (!repoMatch) {
      fail(`Error: could not derive repo from URL: ${issueUrl}`);
    }
    return {
      url: parsed.url,
      number: parsed.number,
      title: parsed.title,
      repo: repoMatch[1],
    };
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error);
    fail(`Error: failed to fetch issue metadata: ${stderr}`);
  }
}

function readRunState(path: string): RunState {
  return JSON.parse(readFileSync(path, "utf8")) as RunState;
}

function validateRunSchema(runState: RunState): void {
  const requiredFields = [
    "project_id",
    "repo_name",
    "repo_path",
    "branch_name",
    "worktree_path",
    "agents",
    "last_summary_path",
  ] as const;
  const missing = requiredFields.filter((field) => !(field in runState));
  if (missing.length > 0) {
    fail(`Error: run state is missing required fields: ${missing.join(" ")}. This run was created with an older schema. Please delete it and re-create with 'specflow-run start'.`);
  }
}

function cmdStart(args: string[], root: string, workflow: WorkflowDefinition): void {
  let runId = "";
  let issueUrl = "";
  let agentMain = "claude";
  let agentReview = "codex";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--issue-url") {
      issueUrl = args[++index] ?? fail("Error: --issue-url requires a value");
      continue;
    }
    if (arg === "--agent-main") {
      agentMain = args[++index] ?? fail("Error: --agent-main requires a value");
      continue;
    }
    if (arg === "--agent-review") {
      agentReview = args[++index] ?? fail("Error: --agent-review requires a value");
      continue;
    }
    if (arg.startsWith("-")) {
      fail(`Error: unknown option '${arg}'`);
    }
    if (runId) {
      fail(`Error: unexpected argument '${arg}'`);
    }
    runId = arg;
  }

  if (!runId) {
    fail("Usage: specflow-run start <run_id> [--issue-url <url>] [--agent-main <name>] [--agent-review <name>]");
  }

  validateRunId(root, runId);
  const path = runFile(root, runId);
  try {
    readFileSync(path, "utf8");
    fail(`Error: run '${runId}' already exists at ${path}`);
  } catch {
    // New run.
  }

  const state: RunState = {
    run_id: runId,
    change_name: runId,
    current_phase: "start",
    status: "active",
    allowed_events: allowedEventsFor(workflow, "start"),
    issue: issueUrl ? parseIssueMetadata(issueUrl) : null,
    project_id: detectProjectId(),
    repo_name: detectProjectId(),
    repo_path: gitOrFail(["rev-parse", "--show-toplevel"], "Error: could not detect repository root"),
    branch_name: gitOrFail(["rev-parse", "--abbrev-ref", "HEAD"], "Error: could not detect current branch"),
    worktree_path: gitOrFail(["rev-parse", "--show-toplevel"], "Error: could not detect worktree path"),
    agents: { main: agentMain, review: agentReview },
    last_summary_path: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    history: [],
  };

  atomicWrite(path, `${JSON.stringify(state, null, 2)}\n`);
  printJson(state);
}

function cmdAdvance(args: string[], root: string, workflow: WorkflowDefinition): void {
  const runId = args[0];
  const event = args[1];
  if (!runId || !event) {
    fail("Usage: specflow-run advance <run_id> <event>");
  }

  validateRunId(root, runId);
  const path = ensureRunExists(root, runId);
  const runState = readRunState(path);
  validateRunSchema(runState);

  const transition = workflow.transitions.find((candidate) => candidate.from === runState.current_phase && candidate.event === event);
  if (!transition) {
    const allowed = allowedEventsFor(workflow, runState.current_phase);
    fail(`Error: invalid transition. Event '${event}' is not allowed in state '${runState.current_phase}'. Allowed events: ${allowed.join(", ")}`);
  }

  const updated: RunState = {
    ...runState,
    current_phase: transition.to,
    updated_at: nowIso(),
    allowed_events: allowedEventsFor(workflow, transition.to),
    history: [
      ...runState.history,
      {
        from: runState.current_phase,
        to: transition.to,
        event,
        timestamp: nowIso(),
      },
    ],
  };

  atomicWrite(path, `${JSON.stringify(updated, null, 2)}\n`);
  printJson(updated);
}

function cmdStatus(args: string[], root: string): void {
  const runId = args[0];
  if (!runId) {
    fail("Usage: specflow-run status <run_id>");
  }
  validateRunId(root, runId);
  const path = ensureRunExists(root, runId);
  const runState = readRunState(path);
  validateRunSchema(runState);
  printJson(runState);
}

function cmdUpdateField(args: string[], root: string): void {
  const [runId, field, value] = args;
  if (!runId || !field || value === undefined) {
    fail("Usage: specflow-run update-field <run_id> <field> <value>");
  }
  if (field !== "last_summary_path") {
    fail(`Error: field '${field}' is not updatable. Allowed fields: last_summary_path`);
  }
  validateRunId(root, runId);
  const path = ensureRunExists(root, runId);
  const runState = readRunState(path);
  validateRunSchema(runState);
  const updated: RunState = {
    ...runState,
    [field]: value,
    updated_at: nowIso(),
  };
  atomicWrite(path, `${JSON.stringify(updated, null, 2)}\n`);
  printJson(updated);
}

function cmdGetField(args: string[], root: string): void {
  const [runId, field] = args;
  if (!runId || !field) {
    fail("Usage: specflow-run get-field <run_id> <field>");
  }
  validateRunId(root, runId);
  const path = ensureRunExists(root, runId);
  const runState = readRunState(path);
  const value = (runState as JsonObject)[field];
  if (value === undefined) {
    fail(`Error: field '${field}' not found in run state`);
  }
  printJson(value);
}

function main(): void {
  const root = projectRoot();
  const workflow = loadWorkflow(stateMachinePath(root));
  const [subcommand, ...args] = process.argv.slice(2);

  switch (subcommand) {
    case "start":
      cmdStart(args, root, workflow);
      return;
    case "advance":
      cmdAdvance(args, root, workflow);
      return;
    case "status":
      cmdStatus(args, root);
      return;
    case "update-field":
      cmdUpdateField(args, root);
      return;
    case "get-field":
      cmdGetField(args, root);
      return;
    case undefined:
      fail("Usage: specflow-run <start|advance|status|update-field|get-field> [args...]");
      return;
    default:
      fail(`Error: unknown subcommand '${subcommand}'. Use: start, advance, status, update-field, get-field`);
  }
}

main();
