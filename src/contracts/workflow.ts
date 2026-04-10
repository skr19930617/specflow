import { AssetType, type WorkflowContract } from "../types/contracts.js";
import {
	workflowEvents,
	workflowStates,
	workflowTransitions,
	workflowVersion,
} from "../lib/workflow-machine.js";

export const workflowContract: WorkflowContract = {
	id: "specflow-workflow",
	type: AssetType.Workflow,
	filePath: "global/workflow/state-machine.json",
	version: workflowVersion,
	states: workflowStates,
	events: workflowEvents,
	transitions: workflowTransitions,
};
