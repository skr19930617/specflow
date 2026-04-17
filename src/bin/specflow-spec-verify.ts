import { tryGit } from "../lib/git.js";
import { verifyChange } from "../lib/spec-verify.js";

function die(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function main(): void {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		die("Usage: specflow-spec-verify <CHANGE_ID> [--json]");
	}
	const changeId = args[0];
	const jsonMode = args.includes("--json");
	if (!jsonMode) {
		die("specflow-spec-verify currently supports only --json output");
	}

	const gitTop = tryGit(["rev-parse", "--show-toplevel"], process.cwd());
	if (gitTop.status !== 0) {
		process.stdout.write(
			`${JSON.stringify({ status: "error", error: "not_in_git_repo" })}\n`,
		);
		process.exit(1);
	}
	const repoRoot = gitTop.stdout.trim();

	const result = verifyChange(repoRoot, changeId);
	process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
	process.exit(result.ok ? 0 : 1);
}

main();
