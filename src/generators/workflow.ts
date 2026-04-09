import { writeText } from "../lib/fs.js";
import { fromDistribution } from "../lib/paths.js";
import type { WorkflowContract } from "../types/contracts.js";

export function renderWorkflow(workflow: WorkflowContract): void {
  const payload = {
    version: workflow.version,
    states: workflow.states,
    events: workflow.events,
    transitions: workflow.transitions,
  };
  writeText(fromDistribution(workflow.filePath), `${JSON.stringify(payload, null, 2)}\n`);
}
