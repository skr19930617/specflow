// Observation event types for the workflow-observation-events contract.
//
// This module defines the closed event catalog, the common envelope, and the
// per-event payload schemas emitted by the workflow core on state change. See
// openspec/specs/workflow-observation-events/spec.md for the authoritative
// contract.

/**
 * The fifteen-member closed catalog of observation event kinds. `event_kind`
 * is a flat discriminator; there is no separate category field.
 */
export type ObservationEventKind =
	| "run_started"
	| "run_suspended"
	| "run_resumed"
	| "run_terminal"
	| "phase_entered"
	| "phase_completed"
	| "phase_blocked"
	| "phase_reopened"
	| "gate_opened"
	| "gate_resolved"
	| "gate_rejected"
	| "artifact_written"
	| "review_completed"
	| "bundle_started"
	| "bundle_completed";

/** Closed list of event kinds — runtime-checkable. */
export const OBSERVATION_EVENT_KINDS: readonly ObservationEventKind[] = [
	"run_started",
	"run_suspended",
	"run_resumed",
	"run_terminal",
	"phase_entered",
	"phase_completed",
	"phase_blocked",
	"phase_reopened",
	"gate_opened",
	"gate_resolved",
	"gate_rejected",
	"artifact_written",
	"review_completed",
	"bundle_started",
	"bundle_completed",
] as const;

/** Single-cause reference; see spec's causal_context requirement. */
export type CausalContext =
	| null
	| {
			readonly kind: "user_event";
			readonly ref: string;
	  }
	| {
			readonly kind: "observation_event";
			readonly ref: string;
	  };

// ---------------------------------------------------------------------------
// Per-event payload schemas
// ---------------------------------------------------------------------------

export interface RunStartedPayload {
	readonly source: {
		readonly provider: string | null;
		readonly reference: string | null;
	};
	readonly title: string | null;
}

export interface RunSuspendedPayload {
	readonly reason: string;
}

export type RunResumedPayload = Record<string, never>;

export interface RunTerminalPayload {
	readonly status: "approved" | "decomposed" | "rejected";
	readonly reason: string | null;
}

export interface PhaseEnteredPayload {
	readonly triggered_event: string;
}

export interface PhaseCompletedPayload {
	readonly outcome: "advanced" | "bypassed";
}

export interface PhaseBlockedPayload {
	readonly reason: "gate_open" | "await_user" | "await_agent";
}

export interface PhaseReopenedPayload {
	readonly reason: string;
}

export type GateKindForObservation = "approval" | "clarify" | "review_decision";

export interface GateOpenedPayload {
	readonly gate_kind: GateKindForObservation;
}

export interface GateResolvedPayload {
	readonly resolution: "approved" | "answered" | "changes_requested";
	readonly by_actor: string;
}

export interface GateRejectedPayload {
	readonly resolution: "rejected";
	readonly by_actor: string;
	readonly reason: string | null;
}

export interface ArtifactWrittenPayload {
	readonly path: string;
	readonly bytes: number;
	readonly content_hash: string | null;
}

export interface ReviewCompletedPayload {
	readonly outcome: "approved" | "changes_requested" | "rejected";
	readonly reviewer: string;
	readonly score: number | null;
}

export interface BundleStartedPayload {
	readonly bundle_kind: "review_bundle";
	readonly artifact_count: number;
}

export interface BundleCompletedPayload {
	readonly bundle_kind: "review_bundle";
	readonly outcome: "approved" | "changes_requested" | "rejected";
}

/**
 * Discriminated union of concrete observation events. Each variant pairs an
 * `event_kind` with its payload schema.
 */
export type ObservationEventVariant =
	| { readonly event_kind: "run_started"; readonly payload: RunStartedPayload }
	| {
			readonly event_kind: "run_suspended";
			readonly payload: RunSuspendedPayload;
	  }
	| { readonly event_kind: "run_resumed"; readonly payload: RunResumedPayload }
	| {
			readonly event_kind: "run_terminal";
			readonly payload: RunTerminalPayload;
	  }
	| {
			readonly event_kind: "phase_entered";
			readonly payload: PhaseEnteredPayload;
	  }
	| {
			readonly event_kind: "phase_completed";
			readonly payload: PhaseCompletedPayload;
	  }
	| {
			readonly event_kind: "phase_blocked";
			readonly payload: PhaseBlockedPayload;
	  }
	| {
			readonly event_kind: "phase_reopened";
			readonly payload: PhaseReopenedPayload;
	  }
	| { readonly event_kind: "gate_opened"; readonly payload: GateOpenedPayload }
	| {
			readonly event_kind: "gate_resolved";
			readonly payload: GateResolvedPayload;
	  }
	| {
			readonly event_kind: "gate_rejected";
			readonly payload: GateRejectedPayload;
	  }
	| {
			readonly event_kind: "artifact_written";
			readonly payload: ArtifactWrittenPayload;
	  }
	| {
			readonly event_kind: "review_completed";
			readonly payload: ReviewCompletedPayload;
	  }
	| {
			readonly event_kind: "bundle_started";
			readonly payload: BundleStartedPayload;
	  }
	| {
			readonly event_kind: "bundle_completed";
			readonly payload: BundleCompletedPayload;
	  };

/**
 * The common observation event envelope. All twelve fields are required on
 * the wire (with explicit `null` where the per-event schema marks them as
 * omitted). `payload` varies by `event_kind` per the discriminated union
 * above. See workflow-observation-events spec for nullability rules.
 */
export interface ObservationEventEnvelope {
	readonly event_id: string;
	readonly event_kind: ObservationEventKind;
	readonly run_id: string;
	readonly change_id: string;
	readonly sequence: number;
	readonly timestamp: string;
	readonly source_phase: string | null;
	readonly target_phase: string | null;
	readonly causal_context: CausalContext;
	readonly gate_ref: string | null;
	readonly artifact_ref: string | null;
	readonly bundle_ref: string | null;
}

/** A fully-formed observation event: envelope fields plus variant payload. */
export type ObservationEvent = ObservationEventEnvelope &
	ObservationEventVariant;

/** Narrowing guard for strings that name a catalog event kind. */
export function isObservationEventKind(
	value: unknown,
): value is ObservationEventKind {
	return (
		typeof value === "string" &&
		(OBSERVATION_EVENT_KINDS as readonly string[]).includes(value)
	);
}
