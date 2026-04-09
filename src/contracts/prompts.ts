import { AssetType, type PromptContract, type PromptRawValue, type PromptTemplateValue } from "../types/contracts.js";

function raw(value: string): PromptRawValue {
  return { kind: "raw", value };
}

function prompt(
  id: string,
  options: {
    outputExample?: PromptTemplateValue;
  } = {},
): PromptContract {
  return {
    id,
    type: AssetType.Prompt,
    filePath: `global/prompts/${id}.md`,
    sourcePath: `assets/global/prompts/${id}.md`,
    outputExample: options.outputExample,
    references: [],
  };
}

export const promptContracts: readonly PromptContract[] = [
  prompt("review_design_prompt", {
    outputExample: {
      decision: raw(`"APPROVE" | "REQUEST_CHANGES" | "BLOCK"`),
      findings: [
        {
          id: "P1",
          severity: raw(`"high" | "medium" | "low"`),
          category: raw(`"completeness" | "feasibility" | "ordering" | "granularity" | "scope" | "consistency" | "risk"`),
          title: "short title",
          detail: "what is wrong and how to fix it",
        },
      ],
      summary: "short summary assessing implementation readiness",
    },
  }),
  prompt("review_design_rereview_prompt", {
    outputExample: {
      decision: raw(`"APPROVE" | "REQUEST_CHANGES" | "BLOCK"`),
      resolved_previous_findings: [
        {
          id: "R1-F01",
          note: "description of how the issue was resolved",
        },
      ],
      still_open_previous_findings: [
        {
          id: "R1-F02",
          severity: raw(`"high" | "medium" | "low"`),
          note: "description of why the issue is still open",
        },
      ],
      new_findings: [
        {
          id: "F3",
          severity: raw(`"high" | "medium" | "low"`),
          category: raw(`"completeness" | "feasibility" | "ordering" | "granularity" | "scope" | "consistency" | "risk"`),
          file: "path/to/file",
          title: "short title",
          detail: "what is wrong and how to fix it",
        },
      ],
      summary: "short summary of review results",
      ledger_error: false,
    },
  }),
  prompt("fix_design_prompt"),
  prompt("review_apply_prompt", {
    outputExample: {
      decision: raw(`"APPROVE" | "REQUEST_CHANGES" | "BLOCK"`),
      findings: [
        {
          id: "F1",
          severity: raw(`"high" | "medium" | "low"`),
          category: raw(`"correctness" | "completeness" | "quality" | "scope" | "testing" | "error_handling" | "forbidden_files" | "performance"`),
          file: "path/to/file",
          title: "short title",
          detail: "what is wrong and how to fix it",
        },
      ],
      summary: "short summary",
    },
  }),
  prompt("review_apply_rereview_prompt", {
    outputExample: {
      decision: raw(`"APPROVE" | "REQUEST_CHANGES" | "BLOCK"`),
      resolved_previous_findings: [
        {
          id: "R1-F01",
          note: "description of how the issue was resolved",
        },
      ],
      still_open_previous_findings: [
        {
          id: "R1-F02",
          severity: raw(`"high" | "medium" | "low"`),
          note: "description of why the issue is still open",
        },
      ],
      new_findings: [
        {
          id: "F3",
          severity: raw(`"high" | "medium" | "low"`),
          category: raw(`"correctness" | "completeness" | "quality" | "scope" | "testing" | "error_handling" | "forbidden_files" | "performance"`),
          file: "path/to/file",
          title: "short title",
          detail: "what is wrong and how to fix it",
        },
      ],
      summary: "short summary of review results",
      ledger_error: false,
    },
  }),
];
