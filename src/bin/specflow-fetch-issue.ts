import { resolveCommand, tryExec } from "../lib/process.js";

const ISSUE_PATTERN = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/issues\/([0-9]+)(?:\/.*)?$/;

function main(): void {
  const issueUrl = process.argv[2];
  if (!issueUrl) {
    process.stdout.write("Usage: specflow-fetch-issue <issue-url>\n");
    process.exit(1);
  }

  const match = issueUrl.trim().match(ISSUE_PATTERN);
  if (!match) {
    process.stdout.write(`Invalid GitHub issue URL: ${issueUrl}\n`);
    process.exit(1);
  }

  const [, host, owner, repo, number] = match;
  const gh = resolveCommand("SPECFLOW_GH", "gh");
  const env = { ...process.env };
  if (host !== "github.com") {
    env.GH_HOST = host;
  }

  const result = tryExec(
    gh,
    ["issue", "view", number, "--repo", `${owner}/${repo}`, "--json", "number,title,body,url,labels,assignees,author,state"],
    process.cwd(),
    env,
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status);
}

main();
