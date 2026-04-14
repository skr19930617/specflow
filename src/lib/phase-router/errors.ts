// Typed errors thrown by the PhaseRouter. The router never emits any event
// when throwing; callers (orchestrators) are expected to catch these and
// mark the run as errored.

export class MissingContractError extends Error {
	readonly phase: string;
	constructor(phase: string) {
		super(`PhaseContract missing for phase: ${phase}`);
		this.name = "MissingContractError";
		this.phase = phase;
	}
}

export class MalformedContractError extends Error {
	readonly phase: string;
	readonly field: string;
	readonly detail: string | undefined;
	constructor(phase: string, field: string, detail?: string) {
		const suffix = detail ? ` — ${detail}` : "";
		super(
			`PhaseContract for "${phase}" is malformed (field: ${field})${suffix}`,
		);
		this.name = "MalformedContractError";
		this.phase = phase;
		this.field = field;
		this.detail = detail;
	}
}

export class RunReadError extends Error {
	readonly runId: string;
	readonly cause: unknown;
	constructor(runId: string, cause: unknown) {
		super(`Failed to read run state for run: ${runId}`);
		this.name = "RunReadError";
		this.runId = runId;
		this.cause = cause;
	}
}

export class InconsistentRunStateError extends Error {
	readonly runId: string;
	readonly detail: string;
	constructor(runId: string, detail: string) {
		super(`Inconsistent run state for "${runId}": ${detail}`);
		this.name = "InconsistentRunStateError";
		this.runId = runId;
		this.detail = detail;
	}
}
