// Surface Event Contract — canonical types for the bidirectional event envelope.
//
// This module defines the surface-neutral event contract that external runtimes
// and future surfaces reference to interoperate with specflow workflows.
// Actor/surface identity types are defined here (D2) and re-exported so
// consumers need only a single import path.

// ---------------------------------------------------------------------------
// Actor Identity (actor-surface-model taxonomy)
// ---------------------------------------------------------------------------

/** Actor kinds recognised by the actor-surface capability matrix. */
export type ActorKind = "human" | "ai-agent" | "automation";

/** Identity of the actor that initiated or received the event. */
export interface ActorIdentity {
	readonly actor: ActorKind;
	readonly actor_id: string;
	/** Present only on delegated approval events. */
	readonly delegated_by?: "human";
	/** Stable id of the delegating human — present iff delegated_by is set. */
	readonly delegated_by_id?: string;
}

// ---------------------------------------------------------------------------
// Surface Identity (actor-surface-model taxonomy)
// ---------------------------------------------------------------------------

/** Surface types recognised by the surface taxonomy. */
export type SurfaceKind = "local-cli" | "remote-api" | "agent-native" | "batch";

/** Identity of the surface through which the event flows. */
export interface SurfaceIdentity {
	readonly surface: SurfaceKind;
	/** Optional instance identifier (e.g., session id). */
	readonly surface_id?: string;
}

// ---------------------------------------------------------------------------
// Event direction
// ---------------------------------------------------------------------------

/** Direction of the event relative to specflow. */
export type EventDirection = "inbound" | "outbound";

// ---------------------------------------------------------------------------
// Event type hierarchy
// ---------------------------------------------------------------------------

/** Abstract event categories. */
export type EventKind = "approval" | "reject" | "clarify" | "resume";

/** All concrete event types across every category. */
export type EventType =
	| "accept_spec"
	| "accept_design"
	| "accept_apply"
	| "reject"
	| "clarify_request"
	| "clarify_response"
	| "resume"
	| "design_review_approved"
	| "apply_review_approved"
	| "request_changes"
	| "block";

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

/** Traceability context linking the event to a workflow run. */
export interface CorrelationContext {
	readonly run_id: string;
	readonly change_id: string;
	/** Monotonically increasing within a run — optional, caller-assigned. */
	readonly sequence?: number;
	/** event_id of the event that triggered this one (request-response). */
	readonly caused_by?: string;
}

// ---------------------------------------------------------------------------
// Concrete event payloads
// ---------------------------------------------------------------------------

/** Payload for approval events (accept_spec, accept_design, accept_apply). */
export interface ApprovalPayload {
	readonly phase_from: string;
	readonly phase_to: string;
}

/** Payload for the reject event. */
export interface RejectPayload {
	readonly phase_from: string;
	readonly reason?: string;
}

/** Payload for outbound clarify_request. */
export interface ClarifyRequestPayload {
	readonly question: string;
	readonly context?: string;
}

/** Payload for inbound clarify_response. */
export interface ClarifyResponsePayload {
	readonly answer: string;
	readonly question_event_id: string;
}

/** Payload for the resume event. */
export interface ResumePayload {
	readonly phase_from: string;
}

/** Shared review issue entry. */
export interface ReviewIssue {
	readonly id: string;
	readonly severity: string;
	readonly detail: string;
}

/** Payload for review outcome events. */
export interface ReviewOutcomePayload {
	readonly phase_from: string;
	readonly reviewer_actor: ActorIdentity;
	readonly summary?: string;
	readonly issues?: readonly ReviewIssue[];
}

// ---------------------------------------------------------------------------
// Payload union keyed by EventType
// ---------------------------------------------------------------------------

export type EventPayloadMap = {
	readonly accept_spec: ApprovalPayload;
	readonly accept_design: ApprovalPayload;
	readonly accept_apply: ApprovalPayload;
	readonly reject: RejectPayload;
	readonly clarify_request: ClarifyRequestPayload;
	readonly clarify_response: ClarifyResponsePayload;
	readonly resume: ResumePayload;
	readonly design_review_approved: ReviewOutcomePayload;
	readonly apply_review_approved: ReviewOutcomePayload;
	readonly request_changes: ReviewOutcomePayload;
	readonly block: ReviewOutcomePayload;
};

// ---------------------------------------------------------------------------
// Surface Event Envelope
// ---------------------------------------------------------------------------

/**
 * The standard bidirectional, transport-agnostic event envelope.
 *
 * Generic over `T extends EventType` so each concrete event carries a
 * correctly-typed payload.
 */
export interface SurfaceEventEnvelope<T extends EventType = EventType> {
	readonly schema_version: "1.0";
	readonly event_id: string;
	readonly event_kind: EventKind;
	readonly event_type: T;
	readonly direction: EventDirection;
	readonly timestamp: string;
	readonly correlation: CorrelationContext;
	readonly actor: ActorIdentity;
	readonly surface: SurfaceIdentity;
	readonly payload: EventPayloadMap[T];
}

// ---------------------------------------------------------------------------
// Concrete event type aliases (convenience)
// ---------------------------------------------------------------------------

export type AcceptSpecEvent = SurfaceEventEnvelope<"accept_spec">;
export type AcceptDesignEvent = SurfaceEventEnvelope<"accept_design">;
export type AcceptApplyEvent = SurfaceEventEnvelope<"accept_apply">;
export type RejectEvent = SurfaceEventEnvelope<"reject">;
export type ClarifyRequestEvent = SurfaceEventEnvelope<"clarify_request">;
export type ClarifyResponseEvent = SurfaceEventEnvelope<"clarify_response">;
export type ResumeEvent = SurfaceEventEnvelope<"resume">;
export type DesignReviewApprovedEvent =
	SurfaceEventEnvelope<"design_review_approved">;
export type ApplyReviewApprovedEvent =
	SurfaceEventEnvelope<"apply_review_approved">;
export type RequestChangesEvent = SurfaceEventEnvelope<"request_changes">;
export type BlockEvent = SurfaceEventEnvelope<"block">;

// ---------------------------------------------------------------------------
// EventType → EventKind mapping (runtime lookup for envelope construction)
// ---------------------------------------------------------------------------

/** Maps each concrete EventType to its abstract EventKind category. */
export const EVENT_TYPE_TO_KIND: Readonly<Record<EventType, EventKind>> = {
	accept_spec: "approval",
	accept_design: "approval",
	accept_apply: "approval",
	reject: "reject",
	clarify_request: "clarify",
	clarify_response: "clarify",
	resume: "resume",
	design_review_approved: "approval",
	apply_review_approved: "approval",
	request_changes: "approval",
	block: "approval",
};

/** Union of all concrete surface events. */
export type SurfaceEvent =
	| AcceptSpecEvent
	| AcceptDesignEvent
	| AcceptApplyEvent
	| RejectEvent
	| ClarifyRequestEvent
	| ClarifyResponseEvent
	| ResumeEvent
	| DesignReviewApprovedEvent
	| ApplyReviewApprovedEvent
	| RequestChangesEvent
	| BlockEvent;

// ---------------------------------------------------------------------------
// Event kind → concrete type mapping (static, for category filtering)
// ---------------------------------------------------------------------------

/** Maps each EventKind to its concrete EventType members. */
export type EventKindToTypes = {
	readonly approval:
		| "accept_spec"
		| "accept_design"
		| "accept_apply"
		| "design_review_approved"
		| "apply_review_approved"
		| "request_changes"
		| "block";
	readonly reject: "reject";
	readonly clarify: "clarify_request" | "clarify_response";
	readonly resume: "resume";
};
