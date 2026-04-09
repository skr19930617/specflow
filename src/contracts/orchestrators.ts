import { AssetType, type OrchestratorContract } from "../types/contracts.js";

function wrapper(id: string): OrchestratorContract {
  return {
    id,
    type: AssetType.Orchestrator,
    filePath: `bin/${id}`,
    entryModule: `dist/bin/${id}.js`,
    legacyFallbackPath: `legacy/v1/bin/${id}`,
    references: [],
  };
}

export const orchestratorContracts: readonly OrchestratorContract[] = [
  {
    id: "specflow-analyze",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-analyze",
    entryModule: "dist/bin/specflow-analyze.js",
    resultSchemaId: "analyze-project",
    references: [],
  },
  wrapper("specflow-create-sub-issues"),
  {
    id: "specflow-design-artifacts",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-design-artifacts",
    entryModule: "dist/bin/specflow-design-artifacts.js",
    resultSchemaId: "design-artifact-next",
    references: [],
  },
  {
    id: "specflow-fetch-issue",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-fetch-issue",
    entryModule: "dist/bin/specflow-fetch-issue.js",
    resultSchemaId: "issue-metadata",
    references: [],
  },
  {
    id: "specflow-filter-diff",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-filter-diff",
    entryModule: "dist/bin/specflow-filter-diff.js",
    resultSchemaId: "diff-summary",
    references: [],
  },
  {
    id: "specflow-init",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-init",
    entryModule: "dist/bin/specflow-init.js",
    resultSchemaId: "init-project",
    references: [],
  },
  {
    id: "specflow-install",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-install",
    entryModule: "dist/bin/specflow-install.js",
    references: [],
  },
  {
    id: "specflow-review-apply",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-review-apply",
    entryModule: "dist/bin/specflow-review-apply.js",
    resultSchemaId: "review-apply-result",
    references: ["prompt:review_apply_prompt", "prompt:review_apply_rereview_prompt"],
  },
  {
    id: "specflow-review-design",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-review-design",
    entryModule: "dist/bin/specflow-review-design.js",
    resultSchemaId: "review-design-result",
    references: [
      "prompt:review_design_prompt",
      "prompt:review_design_rereview_prompt",
      "prompt:fix_design_prompt",
    ],
  },
  {
    id: "specflow-run",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-run",
    entryModule: "dist/bin/specflow-run.js",
    resultSchemaId: "run-state",
    references: [],
  },
];
