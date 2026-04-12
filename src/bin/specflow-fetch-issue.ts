import { matchIssueUrlLenient } from "../lib/issue-url.js";
import { resolveCommand, tryExec } from "../lib/process.js";
import { parseSchemaJson } from "../lib/schemas.js";

function main(): void {
	const issueUrl = process.argv[2];
	if (!issueUrl) {
		process.stdout.write("Usage: specflow-fetch-issue <issue-url>\n");
		process.exit(1);
	}

	const parsed = matchIssueUrlLenient(issueUrl);
	if (!parsed) {
		process.stdout.write(`Invalid GitHub issue URL: ${issueUrl}\n`);
		process.exit(1);
	}

	const { host, owner, repo, number } = parsed;
	const gh = resolveCommand("SPECFLOW_GH", "gh");
	const env = { ...process.env };
	if (host !== "github.com") {
		env.GH_HOST = host;
	}

	const result = tryExec(
		gh,
		[
			"issue",
			"view",
			number,
			"--repo",
			`${owner}/${repo}`,
			"--json",
			"number,title,body,url,labels,assignees,author,state",
		],
		process.cwd(),
		env,
	);
	if (result.status === 0 && result.stdout) {
		try {
			void parseSchemaJson(
				"issue-metadata",
				result.stdout,
				"gh issue view output",
			);
		} catch (error) {
			process.stderr.write(
				`${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		}
		process.stdout.write(result.stdout);
		process.exit(0);
	}
	if (result.stderr) {
		process.stderr.write(result.stderr);
	}
	process.exit(result.status);
}

main();
