// Core runtime: mark a suspended run active again. Pure function — no I/O.

import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { RunStatus } from "../types/contracts.js";
import type {
	CoreRuntimeError,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
import { err, ok } from "./types.js";

export interface ResumeInput<TAdapter> {
	readonly state: RunStateOf<TAdapter>;
	readonly nowIso: string;
}

export function resumeRun<TAdapter extends object>(
	input: ResumeInput<TAdapter>,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { state, nowIso } = input;

	if (state.status !== "suspended") {
		return err({
			kind: "run_not_suspended",
			message: "Error: Run is not suspended",
		});
	}

	const updated: RunStateOf<TAdapter> = {
		...state,
		status: "active" as RunStatus,
		updated_at: nowIso,
		allowed_events: deriveAllowedEvents("active", state.current_phase),
		history: [
			...state.history,
			{
				from: state.current_phase,
				to: state.current_phase,
				event: "resume",
				timestamp: nowIso,
			},
		],
	};

	return ok({ state: updated, recordMutations: [] });
}
