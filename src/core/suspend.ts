// Core runtime: mark a run suspended. Pure function — no I/O.

import { deriveAllowedEvents } from "../lib/workflow-machine.js";
import type { RunStatus } from "../types/contracts.js";
import type {
	CoreRuntimeError,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
import { err, ok } from "./types.js";

export interface SuspendInput<TAdapter> {
	readonly state: RunStateOf<TAdapter>;
	readonly nowIso: string;
}

export function suspendRun<TAdapter extends object>(
	input: SuspendInput<TAdapter>,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { state, nowIso } = input;

	if (state.status === "terminal") {
		return err({
			kind: "terminal_suspend",
			message: "Error: Cannot suspend a terminal run",
		});
	}
	if (state.status === "suspended") {
		return err({
			kind: "already_suspended",
			message: "Error: Run is already suspended",
		});
	}

	const updated: RunStateOf<TAdapter> = {
		...state,
		status: "suspended" as RunStatus,
		updated_at: nowIso,
		allowed_events: deriveAllowedEvents("suspended", state.current_phase),
		history: [
			...state.history,
			{
				from: state.current_phase,
				to: state.current_phase,
				event: "suspend",
				timestamp: nowIso,
			},
		],
	};

	return ok({ state: updated, recordMutations: [] });
}
