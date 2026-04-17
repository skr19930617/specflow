// Barrel for the core runtime — pure workflow command functions plus
// their public input / output / error types. Callers outside `src/core/`
// SHOULD import from this module rather than reaching into the per-command
// files, to keep the wiring layer's import footprint stable.

export type {
	AdvanceDeps,
	AdvanceInput,
	WorkflowDefinition,
} from "./advance.js";
export { advanceRun } from "./advance.js";
export type { ResumeInput } from "./resume.js";
export { resumeRun } from "./resume.js";
export type {
	StartChangeInput,
	StartSyntheticInput,
} from "./start.js";
export { startChangeRun, startSyntheticRun } from "./start.js";
export type { SuspendInput } from "./suspend.js";
export { suspendRun } from "./suspend.js";
export type {
	AdapterFields,
	CoreRuntimeError,
	CoreRuntimeErrorKind,
	RecordMutation,
	Result,
	RunStateOf,
	TransitionOk,
} from "./types.js";
export { err, ok } from "./types.js";
export type { UpdateFieldInput } from "./update-field.js";
export { updateRunField } from "./update-field.js";
export { checkRunId } from "./validation.js";
