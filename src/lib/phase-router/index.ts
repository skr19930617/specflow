// Public surface of the PhaseRouter module.
//
// NOTE: No existing CLI command imports this module. The router ships
// dormant by design (per change
// feat-deterministic-phase-router-for-server-orchestration). A follow-up
// change will wire it into the server orchestrator.

// Re-export new sub-types from the canonical module for convenience.
export type {
	AgentTaskSpec,
	ArtifactRef,
	CliStep,
	GatedDecisionSpec,
} from "../../contracts/phase-contract.js";
export { deriveAction, isGated, isTerminal } from "./derive-action.js";
export {
	InconsistentRunStateError,
	MalformedContractError,
	MissingContractError,
	RunReadError,
} from "./errors.js";
export type { PhaseRouterDeps } from "./router.js";
export { PhaseRouter } from "./router.js";
export type {
	PhaseAction,
	PhaseContract,
	PhaseContractRegistry,
	PhaseNextAction,
	SurfaceEvent,
	SurfaceEventSink,
} from "./types.js";
