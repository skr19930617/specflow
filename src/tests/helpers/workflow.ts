// Shared workflow fixture for core-runtime tests.

import type { WorkflowDefinition } from "../../core/advance.js";
import {
	workflowEvents,
	workflowStates,
	workflowTransitions,
	workflowVersion,
} from "../../lib/workflow-machine.js";

export const testWorkflowDefinition: WorkflowDefinition = {
	version: workflowVersion,
	states: workflowStates,
	events: workflowEvents,
	transitions: workflowTransitions,
};
