// Core runtime public types.
//
// This module defines the Result/error contract the core runtime returns to
// its callers (CLI, tests, or future alternative runtimes). The core runtime
// MUST NOT throw for known failure modes, MUST NOT call process.exit /
// stdout / stderr, and MUST NOT touch the filesystem or git directly.

import type { RunKind, RunState, SourceMetadata } from "../types/contracts.js";

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
	| "field_not_updatable";

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

// --- Command inputs --------------------------------------------------------

export interface StartChangeInput {
	readonly changeId: string;
	readonly source: SourceMetadata | null;
	readonly agents: { readonly main: string; readonly review: string };
	readonly retry: boolean;
}

export interface StartSyntheticInput {
	readonly runId: string;
	readonly source: SourceMetadata | null;
	readonly agents: { readonly main: string; readonly review: string };
}

export interface AdvanceInput {
	readonly runId: string;
	readonly event: string;
}

export interface SuspendInput {
	readonly runId: string;
}

export interface ResumeInput {
	readonly runId: string;
}

export interface StatusInput {
	readonly runId: string;
}

export interface UpdateFieldInput {
	readonly runId: string;
	readonly field: string;
	readonly value: string;
}

export interface GetFieldInput {
	readonly runId: string;
	readonly field: string;
}

// --- Re-exports used by command signatures ---------------------------------

export type { RunKind, RunState };
