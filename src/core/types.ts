// Core runtime public types.
//
// This module defines the Result/error contract the core runtime returns to
// its callers (CLI, tests, or future alternative runtimes). The core runtime
// MUST NOT throw for known failure modes, MUST NOT call process.exit /
// stdout / stderr, and MUST NOT touch the filesystem or git directly.

import type {
	AdapterFields,
	CoreRunState,
	RunKind,
	RunState,
	RunStateOf,
} from "../types/contracts.js";
import type { InteractionRecord } from "../types/interaction-records.js";

// --- Result type -----------------------------------------------------------

export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
	return { ok: true, value };
}

export function err<E>(error: E): { readonly ok: false; readonly error: E } {
	return { ok: false, error };
}

// --- Error contract --------------------------------------------------------

/**
 * Closed set of error kinds the core runtime may return. Each kind maps to a
 * stable programmatic handle that CLI and non-CLI callers can switch on.
 * Extending this union is a contract change — keep it deliberate.
 */
export type CoreRuntimeErrorKind =
	| "invalid_arguments"
	| "invalid_run_id"
	| "run_not_found"
	| "run_schema_mismatch"
	| "invalid_event"
	| "run_suspended"
	| "run_not_suspended"
	| "run_already_exists"
	| "run_active_exists"
	| "run_suspended_exists"
	| "prior_runs_require_retry"
	| "retry_without_prior"
	| "retry_on_rejected"
	| "retry_synthetic"
	| "change_proposal_missing"
	| "terminal_suspend"
	| "already_suspended"
	| "field_not_found"
	| "field_not_updatable"
	| "record_write_failed";

export interface CoreRuntimeError {
	readonly kind: CoreRuntimeErrorKind;
	/**
	 * Human-readable message identical (byte-for-byte) to the pre-refactor
	 * CLI stderr wording. The CLI wiring layer prints this unchanged so the
	 * observable surface is preserved.
	 */
	readonly message: string;
	readonly details?: Readonly<Record<string, unknown>>;
}

// --- Record mutations and transition envelope ------------------------------

/**
 * A record-store mutation computed by a pure core transition. The wiring
 * layer applies these against `InteractionRecordStore` after persisting the
 * new run state. Keeping mutations as data lets core stay pure while
 * preserving the existing record/state write ordering.
 */
export type RecordMutation =
	| { readonly kind: "create"; readonly record: InteractionRecord }
	| { readonly kind: "update"; readonly record: InteractionRecord }
	| { readonly kind: "delete"; readonly recordId: string };

/**
 * Envelope returned by every core transition. `state` is the new run state
 * (typed as `RunStateOf<TAdapter>` = `CoreRunState & AdapterFields<TAdapter>`).
 * `recordMutations` is empty for commands that do not touch interaction
 * records and populated (in deterministic order) for `advanceRun`.
 */
export interface TransitionOk<TAdapter> {
	readonly state: RunStateOf<TAdapter>;
	readonly recordMutations: readonly RecordMutation[];
}

// --- Re-exports used by command signatures ---------------------------------

export type { AdapterFields, CoreRunState, RunKind, RunState, RunStateOf };
