import { exec, tryExec } from "./process.js";

export function git(
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return exec("git", args, cwd, env).trim();
}

export function tryGit(
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
) {
	return tryExec("git", args, cwd, env);
}

export function ensureGitRepo(cwd: string): void {
	const result = tryGit(["rev-parse", "--show-toplevel"], cwd);
	if (result.status === 0) {
		return;
	}
	process.stdout.write('{"status":"error","error":"not_in_git_repo"}\n');
	process.exit(1);
}

export function projectRoot(cwd: string): string {
	return git(["rev-parse", "--show-toplevel"], cwd);
}

export function currentBranch(cwd: string): string {
	return git(["branch", "--show-current"], cwd);
}

export function gitRemoteUrl(cwd: string): string {
	return git(["remote", "get-url", "origin"], cwd);
}

export function recentChanges(
	cwd: string,
	baseBranch = process.env.BASE_BRANCH || "main",
): string {
	const base = tryGit(["merge-base", "HEAD", baseBranch], cwd);
	if (base.status !== 0 || !base.stdout.trim()) {
		return "  - (no commits yet)";
	}
	const log = tryGit(
		["log", "--oneline", "-5", `${base.stdout.trim()}..HEAD`],
		cwd,
	);
	if (log.status !== 0 || !log.stdout.trim()) {
		return "  - (no commits yet)";
	}
	return log.stdout
		.trim()
		.split("\n")
		.map((line) => `  - ${line}`)
		.join("\n");
}
