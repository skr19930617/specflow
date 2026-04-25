// Git worktree helper primitives for apply-worktree-isolation.
//
// Owns the ephemeral lifecycle of a per-bundle git worktree:
//   create from HEAD → (subagent runs inside) → compute diff → import patch →
//   remove on success OR retain on failure.
//
// Every function is pure with respect to state outside its arguments — the
// only observable side effects are `git` invocations and filesystem changes
// under `.specflow/worktrees/<runId>/<bundleId>/`. Designed for injected
// command runners so tests can stub git without spawning it.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface WorktreeHandle {
	readonly path: string;
	readonly baseSha: string;
	readonly runId: string;
	readonly bundleId: string;
	readonly changeId: string;
}

export interface GitCommandResult {
	readonly status: number;
	readonly stdout: Buffer;
	readonly stderr: string;
}

export type GitRunner = (
	args: readonly string[],
	cwd: string,
) => GitCommandResult;

/**
 * Specialized runner for commands that take a patch on stdin (currently
 * only `git apply --binary`). Separated from `GitRunner` because the default
 * `spawnSync` path for stdin-driven git commands differs from the stdout-only
 * path, and tests need an independent injection point.
 */
export type GitApplier = (patch: Buffer, cwd: string) => GitCommandResult;

/**
 * Minimal filesystem surface the worktree helper uses. Narrower than
 * `node:fs` so tests can substitute an in-memory implementation without
 * having to satisfy the full PathLike-accepting signatures.
 */
export interface WorktreeFs {
	existsSync(path: string): boolean;
	mkdirSync(path: string, opts?: { readonly recursive?: boolean }): void;
	rmSync(path: string): void;
}

export interface WorktreeRuntime {
	readonly repoRoot: string;
	/**
	 * The main-session worktree path used as the integration target. Points at
	 * `.specflow/worktrees/<changeId>/main/`. All "main workspace" operations
	 * (HEAD rev-parse, diff materialization, patch import) execute with this
	 * path as cwd.
	 */
	readonly mainWorkspacePath: string;
	/**
	 * The change identifier used to namespace subagent worktrees under
	 * `.specflow/worktrees/<changeId>/<runId>/<bundleId>/`.
	 */
	readonly changeId: string;
	readonly git?: GitRunner;
	readonly applyPatch?: GitApplier;
	readonly fs?: WorktreeFs;
}

/**
 * Resolve the path that operations targeting the "main workspace" should use.
 * Always the main-session worktree — there is no legacy fallback.
 */
function mainWorkspaceOf(runtime: WorktreeRuntime): string {
	return runtime.mainWorkspacePath;
}

const defaultFs: WorktreeFs = {
	existsSync: (p) => fs.existsSync(p),
	mkdirSync: (p, opts) => {
		fs.mkdirSync(p, opts);
	},
	rmSync: (p) => {
		fs.rmSync(p, { force: true, recursive: true });
	},
};

export class WorktreeError extends Error {
	constructor(
		message: string,
		readonly cause: {
			readonly operation: string;
			readonly args?: readonly string[];
			readonly stderr?: string;
			readonly status?: number;
		},
	) {
		super(message);
		this.name = "WorktreeError";
	}
}

function defaultGit(args: readonly string[], cwd: string): GitCommandResult {
	// No `encoding` so stdout comes back as a Buffer — required for binary-safe
	// `git diff --binary` output. stderr is captured as text for error reporting.
	const result = spawnSync("git", [...args], {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? Buffer.alloc(0),
		stderr: (result.stderr ?? Buffer.alloc(0)).toString("utf8"),
	};
}

function runGit(
	runtime: WorktreeRuntime,
	args: readonly string[],
	cwd: string,
	operation: string,
): GitCommandResult {
	const runner = runtime.git ?? defaultGit;
	const result = runner(args, cwd);
	if (result.status !== 0) {
		throw new WorktreeError(
			`git ${operation} failed: ${result.stderr.trim() || `exit ${result.status}`}`,
			{
				operation,
				args,
				stderr: result.stderr,
				status: result.status,
			},
		);
	}
	return result;
}

export function worktreePath(
	repoRoot: string,
	runId: string,
	bundleId: string,
	changeId: string,
): string {
	return path.join(
		repoRoot,
		".specflow",
		"worktrees",
		changeId,
		runId,
		bundleId,
	);
}

/**
 * Create an ephemeral git worktree at `.specflow/worktrees/<runId>/<bundleId>/`
 * using the main workspace's CURRENT HEAD as the base. The returned handle
 * records the base SHA so later integration can compute the exact diff.
 *
 * Throws WorktreeError on any failure (git unavailable, path collision,
 * filesystem error). Callers (dispatcher) should catch this and trigger the
 * worktree-unavailable fail-fast behavior.
 */
export function createWorktree(
	runtime: WorktreeRuntime,
	runId: string,
	bundleId: string,
): WorktreeHandle {
	const wtPath = worktreePath(
		runtime.repoRoot,
		runId,
		bundleId,
		runtime.changeId,
	);
	const fsApi: WorktreeFs = runtime.fs ?? defaultFs;

	if (fsApi.existsSync(wtPath)) {
		throw new WorktreeError(
			`Worktree path already exists: ${wtPath}. Remove it or pick a different run/bundle id.`,
			{ operation: "create-precheck" },
		);
	}

	const parent = path.dirname(wtPath);
	try {
		fsApi.mkdirSync(parent, { recursive: true });
	} catch (err) {
		throw new WorktreeError(
			`Failed to create parent directory ${parent}: ${err instanceof Error ? err.message : String(err)}`,
			{ operation: "create-mkdir" },
		);
	}

	// Capture HEAD SHA BEFORE creating the worktree so a concurrent main-workspace
	// commit between `rev-parse` and `worktree add` is surfaced rather than silently
	// recorded as a stale base. `git worktree add HEAD` resolves HEAD at invocation
	// time, so the worktree's base will match this SHA.
	const mainWs = mainWorkspaceOf(runtime);
	const headResult = runGit(
		runtime,
		["rev-parse", "HEAD"],
		mainWs,
		"rev-parse HEAD",
	);
	const baseSha = headResult.stdout.toString("utf8").trim();

	// Use --detach so the worktree doesn't pin a branch. We never want the
	// ephemeral worktree to show up in `git branch` or block branch deletion.
	try {
		runGit(
			runtime,
			["worktree", "add", "--detach", wtPath, baseSha],
			mainWs,
			"worktree add",
		);
	} catch (err) {
		// R2-F06: wrap the error so it identifies the target worktree path.
		// The proposal requires worktree-unavailable failures to surface the
		// `.specflow/worktrees/<RUN_ID>/<BUNDLE_ID>/` path so operators know
		// which worktree collided or needs cleanup.
		if (err instanceof WorktreeError) {
			throw new WorktreeError(
				`Failed to create worktree at ${wtPath}: ${err.message}`,
				{
					operation: err.cause.operation,
					args: err.cause.args,
					stderr: err.cause.stderr,
					status: err.cause.status,
				},
			);
		}
		throw err;
	}

	// R3-F08: wrap post-add setup (materialize + snapshot) in a try-catch so
	// that a failure here self-cleans the just-added worktree. Without this,
	// a materialize or snapshot error leaves an orphan worktree on disk — the
	// orchestrator's rollback only cleans handles that createWorktree()
	// returned, so a throw here would leak the worktree and cause a path
	// collision on retry.
	try {
		// Materialize the main workspace's uncommitted changes (if any) into the
		// new worktree. Earlier bundle imports in the same apply run land via
		// `git apply` at the repo root WITHOUT a commit, so `HEAD` is stale.
		// Without this step, later worktrees would start from the old committed
		// tree and miss earlier-imported bundle changes — violating the proposal's
		// requirement that later worktrees naturally observe earlier imports.
		materializeWorkspaceState(runtime, wtPath);

		// Snapshot the materialized state as a commit in the worktree so that
		// `computeDiff(baseSha)` later captures ONLY the subagent's delta — not
		// the pre-existing workspace changes that were just materialized. Without
		// this, `importPatch` at the repo root would double-apply the materialized
		// changes (which already exist there), causing patch conflicts.
		const effectiveBase = snapshotMaterializedState(runtime, wtPath, baseSha);

		return {
			path: wtPath,
			baseSha: effectiveBase,
			runId,
			bundleId,
			changeId: runtime.changeId,
		};
	} catch (err) {
		// Best-effort removal of the just-added worktree. If removal itself
		// fails (e.g., filesystem issue), the original setup error is still
		// more important — swallow the cleanup error and propagate the original.
		try {
			const runner = runtime.git ?? defaultGit;
			runner(["worktree", "remove", "--force", wtPath], runtime.repoRoot);
		} catch {
			// Cleanup failed — the worktree is leaked, but the original error
			// is more actionable for the caller.
		}
		throw err;
	}
}

/**
 * Copy uncommitted changes from the main workspace into a freshly-created
 * worktree. Uses `git diff HEAD` (staged + unstaged) at the repo root to
 * capture all pending changes — including patches imported from earlier
 * bundles in the same apply run — and applies them into the worktree via
 * `git apply --binary`.
 *
 * R4-F10: Also captures ordinary untracked files. Plain `git diff HEAD`
 * ignores untracked files entirely, so a new-but-untracked file present in
 * the main workspace would be absent from the subagent worktree. We mark
 * untracked files as intent-to-add (`git add -N`) before diffing, then
 * reset them afterward so the main workspace index is undisturbed.
 *
 * If the main workspace has no uncommitted changes (empty diff), this is a
 * no-op. If the apply fails, the worktree is left in its HEAD state and the
 * error propagates as a `WorktreeError`.
 */
function materializeWorkspaceState(
	runtime: WorktreeRuntime,
	wtPath: string,
): void {
	const runner = runtime.git ?? defaultGit;
	const mainWs = mainWorkspaceOf(runtime);

	// R4-F10: Enumerate untracked files BEFORE diffing so they can be included
	// in the workspace snapshot via intent-to-add. Exclude `.specflow/` since
	// that directory contains worktree infrastructure (ephemeral worktrees,
	// config, etc.) — it is never user content and should not be materialized.
	const untrackedResult = runner(
		["ls-files", "--others", "--exclude-standard", "--exclude=.specflow/"],
		mainWs,
	);
	const untrackedFiles =
		untrackedResult.status === 0
			? untrackedResult.stdout
					.toString("utf8")
					.split("\n")
					.filter((f) => f.length > 0)
			: [];

	// If there are untracked files, mark them intent-to-add so `git diff HEAD`
	// includes them as new-file diffs. We reset them after diffing.
	if (untrackedFiles.length > 0) {
		const addResult = runner(["add", "-N", "--", ...untrackedFiles], mainWs);
		if (addResult.status !== 0) {
			throw new WorktreeError(
				`git add -N (intent-to-add) failed while materializing workspace state: ${addResult.stderr.trim() || `exit ${addResult.status}`}`,
				{
					operation: "materialize-intent-add",
					stderr: addResult.stderr,
					status: addResult.status,
				},
			);
		}
	}

	let diffResult: GitCommandResult;
	try {
		diffResult = runner(["diff", "--binary", "--find-renames", "HEAD"], mainWs);
	} finally {
		// Always reset intent-to-add files so the main workspace index is
		// undisturbed, even if `git diff` throws or fails.
		if (untrackedFiles.length > 0) {
			runner(["reset", "--", ...untrackedFiles], mainWs);
		}
	}

	// A non-zero exit from `git diff` is unexpected (broken index, etc.) —
	// surface it so the caller's fail-fast logic catches it.
	if (diffResult.status !== 0) {
		throw new WorktreeError(
			`git diff HEAD failed while materializing workspace state: ${diffResult.stderr.trim() || `exit ${diffResult.status}`}`,
			{
				operation: "materialize-diff",
				stderr: diffResult.stderr,
				status: diffResult.status,
			},
		);
	}

	if (diffResult.stdout.length === 0) {
		// No uncommitted changes — worktree already matches the workspace.
		return;
	}

	const applier = runtime.applyPatch ?? defaultApplier;
	const applyResult = applier(diffResult.stdout, wtPath);
	if (applyResult.status !== 0) {
		throw new WorktreeError(
			`Failed to materialize workspace changes into worktree at ${wtPath}: ${applyResult.stderr.trim() || `exit ${applyResult.status}`}`,
			{
				operation: "materialize-apply",
				stderr: applyResult.stderr,
				status: applyResult.status,
			},
		);
	}
}

/**
 * Commit the materialized workspace state in the worktree so that the returned
 * SHA becomes the effective base for `computeDiff`. If no changes were
 * materialized (empty workspace diff), returns the original `fallbackSha`
 * unchanged — `computeDiff` will correctly capture only the subagent's delta.
 *
 * When materialized changes ARE present, snapshot failures are FATAL. Silently
 * falling back to `fallbackSha` in that case would leave `baseSha` pointing
 * at the pre-materialization commit while the worktree already contains the
 * materialized changes — so `computeDiff` would include those changes in the
 * patch and `importPatch` would double-apply them at the repo root (they
 * already exist there). Throwing on snapshot failure prevents this corruption.
 */
function snapshotMaterializedState(
	runtime: WorktreeRuntime,
	wtPath: string,
	fallbackSha: string,
): string {
	const runner = runtime.git ?? defaultGit;

	// Check whether there are any materialized changes to snapshot.
	const statusResult = runner(
		["diff", "--binary", "--find-renames", "HEAD"],
		wtPath,
	);
	if (statusResult.status !== 0) {
		// diff failed — this is unexpected (broken index, etc.). If materialize
		// put changes in, we can't verify, so fail fast.
		throw new WorktreeError(
			`Failed to check materialized state in worktree at ${wtPath}: git diff exited ${statusResult.status}`,
			{
				operation: "snapshot-diff-check",
				stderr: statusResult.stderr,
				status: statusResult.status,
			},
		);
	}
	if (statusResult.stdout.length === 0) {
		// No materialized changes — baseSha stays as HEAD.
		return fallbackSha;
	}

	// Materialized changes exist — the following steps MUST succeed. If any
	// step fails, `baseSha` would be incorrect (pointing at the pre-
	// materialization commit while the worktree contains the changes), causing
	// double-apply on patch import. Treat failures as fatal.

	// Stage all materialized changes.
	const addResult = runner(["add", "-A"], wtPath);
	if (addResult.status !== 0) {
		throw new WorktreeError(
			`Failed to stage materialized changes in worktree at ${wtPath}: git add -A exited ${addResult.status}`,
			{
				operation: "snapshot-stage",
				stderr: addResult.stderr,
				status: addResult.status,
			},
		);
	}

	// Commit with a deterministic message. This commit is ephemeral — it lives
	// only in the detached-HEAD worktree and is removed with it.
	const commitResult = runner(
		["commit", "--allow-empty", "-m", "specflow: materialized workspace state"],
		wtPath,
	);
	if (commitResult.status !== 0) {
		throw new WorktreeError(
			`Failed to commit materialized changes in worktree at ${wtPath}: git commit exited ${commitResult.status}`,
			{
				operation: "snapshot-commit",
				stderr: commitResult.stderr,
				status: commitResult.status,
			},
		);
	}

	// Capture the new HEAD as the effective base SHA.
	const newHead = runner(["rev-parse", "HEAD"], wtPath);
	if (newHead.status !== 0) {
		throw new WorktreeError(
			`Failed to resolve snapshot HEAD in worktree at ${wtPath}: git rev-parse exited ${newHead.status}`,
			{
				operation: "snapshot-rev-parse",
				stderr: newHead.stderr,
				status: newHead.status,
			},
		);
	}
	return newHead.stdout.toString("utf8").trim();
}

/**
 * Compute the binary-safe diff from the worktree's base commit to its current
 * HEAD (including uncommitted changes). Uses `git diff --binary` with rename
 * detection so the patch includes binary content and the header classifies
 * renames, deletes, mode changes, and binary blobs consistently with what
 * `listTouchedPaths` parses.
 *
 * Returns a Buffer so NUL bytes survive intact. Feed this directly to
 * `importPatch`.
 */
export function computeDiff(
	runtime: WorktreeRuntime,
	handle: WorktreeHandle,
): Buffer {
	// Subagents MAY leave new files untracked in the worktree. Plain
	// `git diff <commit>` ignores untracked files entirely — they would be
	// silently dropped from the integration patch. Mark them as intent-to-add
	// first (`git add -N .`) so they appear in the diff as additions. `-N`
	// adds only the path entry to the index, NOT the file content, so this is
	// a minimal mutation that does not interfere with a subsequent `git diff
	// --binary` (which still reads content from the working tree).
	const runner = runtime.git ?? defaultGit;
	const intentAdd = runner(["add", "-N", "--", "."], handle.path);
	if (intentAdd.status !== 0) {
		throw new WorktreeError(
			`git add -N failed in worktree ${handle.path}: ${intentAdd.stderr.trim() || `exit ${intentAdd.status}`}`,
			{
				operation: "diff-intent-add",
				stderr: intentAdd.stderr,
				status: intentAdd.status,
			},
		);
	}

	// `git diff --binary` uses the working tree as the RHS, so uncommitted
	// changes are included. `--find-renames` activates rename detection in the
	// patch header so listTouchedPaths can resolve the new path.
	const result = runGit(
		runtime,
		["diff", "--binary", "--find-renames", handle.baseSha],
		handle.path,
		"diff --binary",
	);
	return result.stdout;
}

/**
 * Apply a binary-safe patch at the repository root via `git apply --binary`.
 * No `--3way` fallback in Phase 1 — a non-zero exit is a hard rejection
 * surfaced to the caller so the bundle can transition to integration_rejected.
 *
 * Throws WorktreeError on patch-apply failure. The caller distinguishes
 * "patch-apply failure" from other integration-rejection causes via the
 * `operation: "apply"` on the thrown error.
 */
function defaultApplier(patch: Buffer, cwd: string): GitCommandResult {
	// R1-F01: `--index` ensures newly created files are also staged in the
	// index. Without it, `git apply` leaves new files untracked. Later calls
	// to `git diff HEAD` (in materializeWorkspaceState) only capture tracked
	// files, so untracked files from earlier-bundle imports would be missed
	// when creating worktrees for later bundles in the same apply run. With
	// `--index`, all applied files (creates, modifications, deletes) are
	// tracked and visible to `git diff HEAD`.
	const result = spawnSync("git", ["apply", "--binary", "--index"], {
		cwd,
		input: patch,
		stdio: ["pipe", "pipe", "pipe"],
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? Buffer.alloc(0),
		stderr: (result.stderr ?? Buffer.alloc(0)).toString("utf8"),
	};
}

export function importPatch(runtime: WorktreeRuntime, patch: Buffer): void {
	if (patch.length === 0) {
		// An empty patch means no changes to import. Short-circuit rather than
		// invoking `git apply` with no input (a no-op that could otherwise be
		// mistaken for success by the caller).
		return;
	}
	const applier = runtime.applyPatch ?? defaultApplier;
	const result = applier(patch, mainWorkspaceOf(runtime));
	if (result.status !== 0) {
		throw new WorktreeError(
			`git apply --binary failed: ${result.stderr.trim() || `exit ${result.status}`}`,
			{
				operation: "apply",
				status: result.status,
				stderr: result.stderr,
			},
		);
	}
}

/**
 * Remove a worktree via `git worktree remove --force`. The --force flag is
 * required because subagents typically leave the worktree dirty (their
 * uncommitted implementation changes) — after patch import the changes live
 * at the main workspace root, so the worktree's dirty state is no longer load-
 * bearing and removing it is safe. Without --force, `git worktree remove`
 * refuses dirty worktrees with exit 1.
 *
 * Callers SHOULD only invoke this after successful integration. For the
 * subagent_failed and integration_rejected paths, the worktree SHALL be
 * retained; do NOT call this function there.
 */
export function removeWorktree(
	runtime: WorktreeRuntime,
	handle: WorktreeHandle,
): void {
	// --force so post-import dirty worktrees can still be cleaned up. The
	// worktree's content is no longer authoritative after patch-import lands
	// the changes at main.
	runGit(
		runtime,
		["worktree", "remove", "--force", handle.path],
		mainWorkspaceOf(runtime),
		"worktree remove",
	);
}

/**
 * Parse `diff --git a/<old> b/<new>` headers from a binary-safe patch and
 * return the set of touched repo-relative paths. Rules (matching the
 * apply-worktree-integration spec):
 *
 * - added/modified/mode-only/binary paths → the `b/<new>` path
 * - renamed paths → the `b/<new>` path (NEW path, not old)
 * - deleted paths → the `a/<old>` path (same as `b/<old>` in git output)
 *
 * In practice, every non-rename `diff --git` line has `a/X b/X` where X is
 * the same path, so emitting `b/<X>` covers add/modify/delete/mode/binary.
 * Only rename/copy distinguish old vs. new, and the spec calls for NEW.
 *
 * Paths that contain unusual characters may be git-quoted (surrounded with
 * double quotes, special chars backslash-escaped). This implementation
 * recognizes and dequotes those so produced_artifacts matching works against
 * "real" repo-relative paths.
 */
export function listTouchedPaths(patch: string | Buffer): ReadonlySet<string> {
	const text = typeof patch === "string" ? patch : patch.toString("utf8");
	const touched = new Set<string>();

	const lines = text.split("\n");
	for (const line of lines) {
		if (!line.startsWith("diff --git ")) {
			continue;
		}
		const parsed = parseDiffGitLine(line);
		if (parsed) {
			touched.add(parsed.newPath);
		}
	}
	return touched;
}

interface DiffGitPaths {
	readonly oldPath: string;
	readonly newPath: string;
}

/**
 * Parse a `diff --git a/<old> b/<new>` header line. Handles the two git-
 * supported forms:
 *
 *   unquoted:   diff --git a/path/to/file b/path/to/file
 *   quoted:     diff --git "a/path with spaces" "b/path with spaces"
 *
 * Both sides must use the same form (git never mixes them). Returns the
 * `a/` prefix stripped from oldPath and the `b/` prefix stripped from
 * newPath, or null if the line does not parse.
 */
function parseDiffGitLine(line: string): DiffGitPaths | null {
	const rest = line.slice("diff --git ".length);

	// Quoted form: "a/..." "b/..."
	if (rest.startsWith('"')) {
		const firstEnd = findClosingQuote(rest, 0);
		if (firstEnd === -1) return null;
		const firstQuoted = rest.slice(1, firstEnd);
		let i = firstEnd + 1;
		while (i < rest.length && rest.charCodeAt(i) === 0x20) i++; // skip spaces
		if (rest.charAt(i) !== '"') return null;
		const secondStart = i;
		const secondEnd = findClosingQuote(rest, secondStart);
		if (secondEnd === -1) return null;
		const secondQuoted = rest.slice(secondStart + 1, secondEnd);
		const oldPath = stripPrefix(dequoteGitPath(firstQuoted), "a/");
		const newPath = stripPrefix(dequoteGitPath(secondQuoted), "b/");
		if (oldPath === null || newPath === null) return null;
		return { oldPath, newPath };
	}

	// Unquoted form: a/... b/...
	// Git uses a single space as the separator. Since `a/` prefix guarantees
	// no leading space in the path itself, we can split on ' b/' literally.
	const sep = " b/";
	const sepIndex = rest.indexOf(sep);
	if (sepIndex === -1) return null;
	const aPart = rest.slice(0, sepIndex);
	const bPart = rest.slice(sepIndex + 1); // starts with 'b/'
	const oldPath = stripPrefix(aPart, "a/");
	const newPath = stripPrefix(bPart, "b/");
	if (oldPath === null || newPath === null) return null;
	return { oldPath, newPath };
}

function stripPrefix(s: string, prefix: string): string | null {
	return s.startsWith(prefix) ? s.slice(prefix.length) : null;
}

/**
 * Find the index of the closing `"` for a git-quoted string starting at
 * `start` (which must point at an opening `"`). Handles escaped quotes
 * (`\"`) and escaped backslashes (`\\`). Returns -1 if no close found.
 */
function findClosingQuote(s: string, start: number): number {
	let i = start + 1;
	while (i < s.length) {
		const ch = s.charAt(i);
		if (ch === "\\") {
			i += 2; // skip the backslash AND the following char
			continue;
		}
		if (ch === '"') {
			return i;
		}
		i++;
	}
	return -1;
}

/**
 * Dequote a git-quoted path. Git uses C-style escapes inside double quotes:
 * \a \b \t \n \v \f \r \" \\, plus \<octal> for non-ASCII bytes. For
 * Phase 1 we dequote the common printable escapes and pass octal escapes
 * through as literal `\nnn` sequences — this is acceptable because the
 * spec only requires touched paths to match `produced_artifacts` strings,
 * and produced_artifacts is provided by the subagent in git-quoted form
 * only if the subagent chose to quote; otherwise they are plain bytes.
 */
function dequoteGitPath(quoted: string): string {
	let out = "";
	let i = 0;
	while (i < quoted.length) {
		const ch = quoted.charAt(i);
		if (ch !== "\\") {
			out += ch;
			i++;
			continue;
		}
		const next = quoted.charAt(i + 1);
		switch (next) {
			case '"':
			case "\\":
			case "/":
				out += next;
				i += 2;
				continue;
			case "a":
				out += "\x07";
				i += 2;
				continue;
			case "b":
				out += "\b";
				i += 2;
				continue;
			case "f":
				out += "\f";
				i += 2;
				continue;
			case "n":
				out += "\n";
				i += 2;
				continue;
			case "r":
				out += "\r";
				i += 2;
				continue;
			case "t":
				out += "\t";
				i += 2;
				continue;
			case "v":
				out += "\v";
				i += 2;
				continue;
			default:
				// Unrecognized escape (likely octal): preserve as literal.
				out += ch;
				i++;
		}
	}
	return out;
}

/**
 * Check whether a given repo-relative path is on the protected path list
 * defined by apply-worktree-integration. Used by the integration step to
 * reject diffs that touch main-agent-only artifacts.
 *
 * Protected paths:
 *   - openspec/changes/<CHANGE_ID>/task-graph.json
 *   - openspec/changes/<CHANGE_ID>/tasks.md
 *   - .specflow/**  (any path under .specflow)
 */
export function isProtectedPath(
	repoRelativePath: string,
	changeId: string,
): boolean {
	const normalized = repoRelativePath.replace(/\\/g, "/");
	if (normalized === `openspec/changes/${changeId}/task-graph.json`)
		return true;
	if (normalized === `openspec/changes/${changeId}/tasks.md`) return true;
	if (normalized.startsWith(".specflow/")) return true;
	return false;
}

export const __internal_testing = {
	parseDiffGitLine,
	dequoteGitPath,
	findClosingQuote,
} as const;
