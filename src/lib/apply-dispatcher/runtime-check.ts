// Lazy runtime-prerequisite check for default-engaged subagent dispatch.
//
// Per `bundle-subagent-execution`'s "Default-engaged dispatch fails fast on
// missing local subagent runtime" requirement: when the dispatcher is about
// to engage on a window with at least one subagent-eligible bundle, the
// operator's local subagent runtime prerequisites SHALL be verified before
// any subagent is spawned. If a prerequisite is unsatisfied, the apply SHALL
// stop with an actionable error pointing to either the local runtime fix
// (in `.specflow/config.env`) or the explicit opt-out
// (`apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`).

import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { loadConfigEnv } from "../review-runtime.js";

const VALID_MAIN_AGENTS = ["claude", "codex", "copilot"] as const;
const VALID_REVIEW_AGENTS = ["codex", "claude"] as const;

type MainAgentName = (typeof VALID_MAIN_AGENTS)[number];

const AGENT_OVERRIDE_ENV: Record<MainAgentName, string> = {
	claude: "SPECFLOW_CLAUDE",
	codex: "SPECFLOW_CODEX",
	copilot: "SPECFLOW_COPILOT",
};

export interface RuntimeCheckOk {
	readonly ok: true;
}

export interface RuntimeCheckFail {
	readonly ok: false;
	readonly reason: string;
}

export type RuntimeCheckResult = RuntimeCheckOk | RuntimeCheckFail;

/**
 * Test whether `path` is an executable regular file the current process
 * can run. Uses `access(X_OK)` and `stat` together to reject directories
 * and non-executable entries — `existsSync` alone would let a directory
 * pass and the later spawn would fail with a confusing error.
 *
 * On Windows, the `.cmd` / `.exe` suffixes are tried alongside the bare
 * name (best-effort — Windows is not the supported deployment target,
 * but the check should not regress on developer machines).
 */
function isExecutableFile(path: string): boolean {
	try {
		const st = statSync(path);
		if (!st.isFile()) {
			return false;
		}
		accessSync(path, fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}

const WINDOWS_EXECUTABLE_EXTENSIONS = [".cmd", ".exe", ".bat"] as const;

function resolveOnPath(name: string): boolean {
	const pathDirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	const isWindows = process.platform === "win32";
	for (const dir of pathDirs) {
		const candidate = join(dir, name);
		if (isExecutableFile(candidate)) {
			return true;
		}
		if (isWindows) {
			for (const ext of WINDOWS_EXECUTABLE_EXTENSIONS) {
				if (isExecutableFile(`${candidate}${ext}`)) {
					return true;
				}
			}
		}
	}
	return false;
}

/**
 * Resolve a command name on PATH. Returns true when the command is
 * resolvable as an executable regular file at an absolute path, or as a
 * name reachable via `PATH`.
 *
 * The override env var (e.g. `SPECFLOW_CLAUDE`) takes precedence: if set
 * to an absolute path, we check that file directly; if set to a non-path
 * name, we fall through to PATH lookup with that name.
 */
function isCommandResolvable(commandName: string, overrideEnv: string): boolean {
	const override = process.env[overrideEnv];
	const target = override && override.length > 0 ? override : commandName;
	if (isAbsolute(target)) {
		return isExecutableFile(target);
	}
	return resolveOnPath(target);
}

/**
 * Verify the operator's local subagent runtime prerequisites are
 * satisfied. The check loads `.specflow/config.env` (idempotent — does not
 * overwrite an env var that is already set) and validates:
 *
 *   1. The chosen main agent identifier (`SPECFLOW_MAIN_AGENT`) is a
 *      known value (`claude` / `codex` / `copilot`); defaults to `claude`.
 *   2. The chosen review agent identifier (`SPECFLOW_REVIEW_AGENT`) is a
 *      known value (`codex` / `claude`); defaults to `codex`.
 *   3. The CLI required by the chosen main agent is resolvable on `PATH`
 *      (or at the `SPECFLOW_<AGENT>` override path).
 *
 * Returns `{ ok: true }` when all prerequisites are satisfied, otherwise
 * `{ ok: false, reason: "<actionable message>" }`.
 *
 * The `reason` always cites both fix paths so the operator can resolve
 * the local runtime OR explicitly opt out of dispatch.
 */
export function verifyLocalSubagentRuntime(
	projectRoot: string,
): RuntimeCheckResult {
	loadConfigEnv(projectRoot);

	const rawMain = process.env.SPECFLOW_MAIN_AGENT ?? "claude";
	const main = rawMain as MainAgentName;
	if (!VALID_MAIN_AGENTS.includes(main)) {
		return {
			ok: false,
			reason: failReason(
				`SPECFLOW_MAIN_AGENT='${rawMain}' is not a valid main agent identifier. Expected one of: ${VALID_MAIN_AGENTS.join(", ")}.`,
			),
		};
	}

	const rawReview = process.env.SPECFLOW_REVIEW_AGENT ?? "codex";
	if (!VALID_REVIEW_AGENTS.includes(rawReview as (typeof VALID_REVIEW_AGENTS)[number])) {
		return {
			ok: false,
			reason: failReason(
				`SPECFLOW_REVIEW_AGENT='${rawReview}' is not a valid review agent identifier. Expected one of: ${VALID_REVIEW_AGENTS.join(", ")}.`,
			),
		};
	}

	const overrideEnv = AGENT_OVERRIDE_ENV[main];
	if (!isCommandResolvable(main, overrideEnv)) {
		const overrideValue = process.env[overrideEnv];
		const targetDescription =
			overrideValue && overrideValue.length > 0
				? `'${overrideValue}' (from ${overrideEnv})`
				: `'${main}' on PATH`;
		return {
			ok: false,
			reason: failReason(
				`Could not resolve the ${main} CLI: ${targetDescription} is not executable.`,
			),
		};
	}

	return { ok: true };
}

function failReason(detail: string): string {
	return [
		"Subagent dispatch engaged by default but the local runtime is not ready:",
		`  ${detail}`,
		"",
		"Fix one of:",
		"  - Resolve the local runtime in `.specflow/config.env`",
		"    (set the agent identifier or its corresponding `SPECFLOW_<AGENT>` path).",
		"  - Explicitly opt out of dispatch by setting",
		"    `apply.subagent_dispatch.enabled: false` in `.specflow/config.yaml`.",
	].join("\n");
}
