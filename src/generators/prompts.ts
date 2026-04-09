import { readText, writeText } from "../lib/fs.js";
import { fromDistribution, fromRepo } from "../lib/paths.js";
import type { PromptContract, PromptRawValue, PromptTemplateValue } from "../types/contracts.js";

const OUTPUT_SCHEMA_TOKEN = "{{OUTPUT_SCHEMA}}";

function isPromptRawValue(value: PromptTemplateValue): value is PromptRawValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "kind" in value && value.kind === "raw";
}

function renderPromptTemplateValue(value: PromptTemplateValue, indent = 0): string {
  if (isPromptRawValue(value)) {
    return value.value;
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  const padding = " ".repeat(indent);
  const childIndent = indent + 2;
  const childPadding = " ".repeat(childIndent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const renderedItems = value.map((item, index) => {
      const rendered = renderPromptTemplateValue(item, childIndent);
      const comma = index < value.length - 1 ? "," : "";
      if (!rendered.includes("\n")) {
        return `${childPadding}${rendered}${comma}`;
      }
      const lines = rendered.split("\n");
      lines[0] = `${childPadding}${lines[0].trimStart()}`;
      lines[lines.length - 1] = `${lines[lines.length - 1]}${comma}`;
      return lines.join("\n");
    });
    return `[\n${renderedItems.join("\n")}\n${padding}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }
  const renderedEntries = entries.map(([key, entryValue], index) => {
    const rendered = renderPromptTemplateValue(entryValue, childIndent);
    const comma = index < entries.length - 1 ? "," : "";
    if (!rendered.includes("\n")) {
      return `${childPadding}${JSON.stringify(key)}: ${rendered}${comma}`;
    }
    const lines = rendered.split("\n");
    lines[0] = `${childPadding}${JSON.stringify(key)}: ${lines[0].trimStart()}`;
    lines[lines.length - 1] = `${lines[lines.length - 1]}${comma}`;
    return lines.join("\n");
  });
  return `{\n${renderedEntries.join("\n")}\n${padding}}`;
}

export function renderPrompts(prompts: readonly PromptContract[]): void {
  for (const prompt of prompts) {
    let content = readText(fromRepo(prompt.sourcePath));
    if (prompt.outputExample) {
      content = content.replace(OUTPUT_SCHEMA_TOKEN, renderPromptTemplateValue(prompt.outputExample));
    }
    writeText(fromDistribution(prompt.filePath), `${content.trimEnd()}\n`);
  }
}
