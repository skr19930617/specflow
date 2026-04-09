import { readText, writeText } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";
import type { CommandContract } from "../types/contracts.js";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

function replaceDescription(content: string, description: string): string {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return `---\ndescription: ${description}\n---\n\n${content.trimEnd()}\n`;
  }
  const frontmatterLines = match[1]
    .split("\n")
    .map((line) => (line.startsWith("description:") ? `description: ${description}` : line));
  const updatedFrontmatter = `---\n${frontmatterLines.join("\n")}\n---\n`;
  return `${updatedFrontmatter}${content.slice(match[0].length).replace(/^\n+/, "")}`;
}

function renderHookSection(contract: CommandContract): string {
  if (contract.runHooks.length === 0) {
    return "";
  }

  const blocks = contract.runHooks.map((hook) => {
    return [
      `### ${hook.title}`,
      "",
      hook.description,
      "",
      "```bash",
      hook.shell,
      "```",
    ].join("\n");
  });

  return `\n\n## Run State Hooks\n\n${blocks.join("\n\n")}\n`;
}

export function renderCommands(commands: readonly CommandContract[]): void {
  for (const contract of commands) {
    const legacyContent = readText(fromRepo(contract.legacySourcePath));
    const withDescription = replaceDescription(legacyContent, contract.description).trimEnd();
    const nextContent = `${withDescription}${renderHookSection(contract)}`;
    writeText(fromRepo(contract.filePath), `${nextContent.trimEnd()}\n`);
  }
}
