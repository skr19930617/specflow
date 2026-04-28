// apply-dispatcher public surface — the module that classifies windows,
// packages per-bundle context, and (in a later bundle) orchestrates subagent
// chunks while preserving the sole-mutation-entry-point contract.

export type {
	CapabilityResolution,
	ResolvedCapability,
	UnresolvedCapability,
} from "./capability-resolution.js";
export {
	resolveCapability,
	UnsafeCapabilityNameError,
} from "./capability-resolution.js";
export { classifyWindow } from "./classify.js";
export type { DispatchConfig } from "./config.js";
export {
	DEFAULT_DISPATCH_CONFIG,
	parseDispatchConfig,
	readDispatchConfig,
	shouldUseDispatcher,
} from "./config.js";
export {
	assembleContextPackage,
	MissingCapabilityError,
	preflightWindow,
	UnsafePathError,
} from "./context-package.js";
export type {
	AdvanceBundleFn,
	ChunkFailure,
	DispatchOutcome,
	RunDispatchedWindowArgs,
	WorktreeCleanupWarning,
} from "./orchestrate.js";
export {
	LocalSubagentRuntimeError,
	runDispatchedWindow,
} from "./orchestrate.js";
export type { RuntimeCheckResult } from "./runtime-check.js";
export { verifyLocalSubagentRuntime } from "./runtime-check.js";

export type {
	BundleSlice,
	CapabilitySpecs,
	ContextPackage,
	ContextPackageInput,
	DispatchDecision,
	DispatchMode,
	SubagentInvoker,
	SubagentResult,
} from "./types.js";
