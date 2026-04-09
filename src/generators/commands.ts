import { writeText } from "../lib/fs.js";
import { fromRepo } from "../lib/paths.js";
import type { CommandContract } from "../types/contracts.js";

function renderFrontmatter(contract: CommandContract): string {
  const entries = {
    ...contract.body.frontmatter,
    description: contract.description,
  };
  const lines = Object.entries(entries).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---`;
}

function renderBody(contract: CommandContract): string {
  return contract.body.sections
    .map((section) => {
      if (section.title === null) {
        return section.content.trimEnd();
      }
      return `## ${section.title}\n\n${section.content.trimEnd()}`;
    })
    .join("\n\n")
    .trimEnd();
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
    const nextContent = [
      renderFrontmatter(contract),
      "",
      renderBody(contract),
      renderHookSection(contract).trimEnd(),
    ]
      .filter((part) => part.length > 0)
      .join("\n");
    writeText(fromRepo(contract.filePath), `${nextContent.trimEnd()}\n`);
  }
}
