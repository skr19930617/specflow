// Core runtime: patch a single allowed field on run state. Pure — no I/O.
// The wiring layer is responsible for validating that `field` is in the
// adapter-specific allowed-fields whitelist before invoking this function.

import type {
	CoreRuntimeError,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
import { ok } from "./types.js";

export interface UpdateFieldInput<TAdapter> {
	readonly state: RunStateOf<TAdapter>;
	readonly field: string;
	readonly value: string | boolean;
	readonly nowIso: string;
}

export function updateRunField<TAdapter extends object>(
	input: UpdateFieldInput<TAdapter>,
): Result<TransitionOk<TAdapter>, CoreRuntimeError> {
	const { state, field, value, nowIso } = input;

	const updated = {
		...state,
		[field]: value,
		updated_at: nowIso,
	} as RunStateOf<TAdapter>;

	return ok({ state: updated, recordMutations: [] });
}
