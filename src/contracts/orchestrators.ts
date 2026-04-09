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
  wrapper("specflow-analyze"),
  wrapper("specflow-create-sub-issues"),
  wrapper("specflow-design-artifacts"),
  wrapper("specflow-fetch-issue"),
  wrapper("specflow-filter-diff"),
  wrapper("specflow-init"),
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
    legacyFallbackPath: "legacy/v1/bin/specflow-review-apply",
    references: ["prompt:review_apply_prompt", "prompt:review_apply_rereview_prompt"],
  },
  {
    id: "specflow-review-design",
    type: AssetType.Orchestrator,
    filePath: "bin/specflow-review-design",
    entryModule: "dist/bin/specflow-review-design.js",
    legacyFallbackPath: "legacy/v1/bin/specflow-review-design",
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
    references: [],
  },
];
