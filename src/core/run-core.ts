// Barrel for the core runtime — the seven workflow command functions plus
// their public input / output / error types.
//
// Callers outside `src/core/` SHOULD import from this module rather than
// reaching into the per-command files, to keep the CLI wiring layer's
// import footprint stable.

export type {
	AdvanceDeps,
	WorkflowDefinition,
} from "./advance.js";
export { advanceRun } from "./advance.js";
export type { GetFieldDeps } from "./get-field.js";
export { getRunField } from "./get-field.js";
export type { ResumeDeps } from "./resume.js";
export { resumeRun } from "./resume.js";
export type {
	StartChangeDeps,
	StartSyntheticDeps,
} from "./start.js";
export { startChangeRun, startSyntheticRun } from "./start.js";
export type { StatusDeps } from "./status.js";
export { readRunStatus } from "./status.js";
export type { SuspendDeps } from "./suspend.js";
export { suspendRun } from "./suspend.js";
export type {
	AdvanceInput,
	CoreRuntimeError,
	CoreRuntimeErrorKind,
	GetFieldInput,
	Result,
	ResumeInput,
	StartChangeInput,
	StartSyntheticInput,
	StatusInput,
	SuspendInput,
	UpdateFieldInput,
} from "./types.js";
export { err, ok } from "./types.js";
export type { UpdateFieldDeps } from "./update-field.js";
export { updateRunField } from "./update-field.js";
