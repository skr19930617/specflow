/**
 * Surface-neutral five-layer agent context model.
 *
 * This module defines the canonical layer definitions, namespace identifiers,
 * precedence constants, and adapter-facing types that all surface adapters
 * and runtime injectors depend on. No surface-specific (e.g. Claude, Cursor)
 * wording belongs here.
 */

// ---------------------------------------------------------------------------
// Layer identifiers
// ---------------------------------------------------------------------------

export type AgentContextLayerId =
	| "global-invariants"
	| "project-profile"
	| "phase-contract"
	| "runtime-task-instance"
	| "evidence-context";

// ---------------------------------------------------------------------------
// Layer descriptor
// ---------------------------------------------------------------------------

export interface LayerDescriptor {
	readonly id: AgentContextLayerId;
	readonly name: string;
	readonly ownership: string;
	readonly persistence: "template" | "file" | "command-body" | "volatile";
	readonly editable: boolean;
	readonly priority: number;
}

// ---------------------------------------------------------------------------
// Canonical layer descriptors (Task 2.1)
// ---------------------------------------------------------------------------

export const LAYER_DESCRIPTORS: ReadonlyMap<
	AgentContextLayerId,
	LayerDescriptor
> = new Map<AgentContextLayerId, LayerDescriptor>([
	[
		"global-invariants",
		{
			id: "global-invariants",
			name: "Global Invariants",
			ownership: "specflow-core",
			persistence: "template",
			editable: false,
			priority: 1,
		},
	],
	[
		"phase-contract",
		{
			id: "phase-contract",
			name: "Phase Contract",
			ownership: "command-body",
			persistence: "command-body",
			editable: false,
			priority: 2,
		},
	],
	[
		"project-profile",
		{
			id: "project-profile",
			name: "Project Profile",
			ownership: "setup",
			persistence: "file",
			editable: true,
			priority: 3,
		},
	],
	[
		"runtime-task-instance",
		{
			id: "runtime-task-instance",
			name: "Runtime Task Instance",
			ownership: "run-state",
			persistence: "volatile",
			editable: false,
			priority: 4,
		},
	],
	[
		"evidence-context",
		{
			id: "evidence-context",
			name: "Evidence Context",
			ownership: "review-apply",
			persistence: "volatile",
			editable: false,
			priority: 5,
		},
	],
]);

/**
 * All layer IDs sorted by ascending priority (highest priority first).
 */
export const LAYER_PRIORITY_ORDER: readonly AgentContextLayerId[] = [
	...[...LAYER_DESCRIPTORS.values()]
		.sort((a, b) => a.priority - b.priority)
		.map((descriptor) => descriptor.id),
];

// ---------------------------------------------------------------------------
// Global invariants content (Task 2.2)
// ---------------------------------------------------------------------------

export interface GlobalInvariants {
	readonly contractDiscipline: readonly string[];
}

export const GLOBAL_INVARIANTS: GlobalInvariants = {
	contractDiscipline: [
		"Prefer explicit, enforceable contracts over implicit behavior.",
		"Strengthen contracts instead of relying on hidden assumptions or hardcoded logic.",
		"Avoid hardcoding behavior that should be defined by contracts, schemas, configuration, or shared generators.",
		"Do not add special-case behavior unless it is explicitly part of the contract.",
		"If a contract changes, update the corresponding tests in the same change.",
		"Contract validation is required, not optional.",
		"After making changes, run the repository's defined verification steps for the affected scope.",
		"This includes formatting, linting, type checking, tests, and build steps whenever the repository defines them and they are relevant to the change.",
		"Do not consider a change complete until the relevant verification steps pass.",
		"Prefer repository-defined commands and workflows over ad hoc validation.",
	],
};

// ---------------------------------------------------------------------------
// Adapter-facing types (Task 2.2)
// ---------------------------------------------------------------------------

/**
 * Input that callers provide to build a context envelope.
 * Each field maps to one of the five canonical layers.
 */
export interface AgentContextTemplateInput {
	readonly globalInvariants: Record<string, unknown>;
	readonly projectProfile: Record<string, unknown> | null;
	readonly phaseContract: Record<string, unknown> | null;
	readonly runtimeTask: Record<string, unknown> | null;
	readonly evidenceContext: Record<string, unknown> | null;
}

/**
 * Resolved envelope with namespace-separated layers.
 * Always contains entries for all five layers; layers with null input
 * are represented as empty records.
 */
export interface ResolvedAgentContextEnvelope {
	readonly layers: ReadonlyMap<AgentContextLayerId, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Adapter-facing helpers (Task 2.2)
// ---------------------------------------------------------------------------

/**
 * Map an input field to its canonical layer ID.
 */
function inputToLayerMap(
	input: AgentContextTemplateInput,
): ReadonlyMap<AgentContextLayerId, Record<string, unknown>> {
	return new Map<AgentContextLayerId, Record<string, unknown>>([
		["global-invariants", { ...input.globalInvariants }],
		[
			"project-profile",
			input.projectProfile ? { ...input.projectProfile } : {},
		],
		["phase-contract", input.phaseContract ? { ...input.phaseContract } : {}],
		[
			"runtime-task-instance",
			input.runtimeTask ? { ...input.runtimeTask } : {},
		],
		[
			"evidence-context",
			input.evidenceContext ? { ...input.evidenceContext } : {},
		],
	]);
}

/**
 * Resolve an envelope from input.
 * Applies namespace separation: each layer's content is shallow-copied
 * into an independent record keyed by layer ID.
 */
export function resolveAgentContextEnvelope(
	input: AgentContextTemplateInput,
): ResolvedAgentContextEnvelope {
	return { layers: inputToLayerMap(input) };
}

/**
 * Get a specific layer's content from the envelope.
 * Returns `undefined` when the layer ID is not present (should not
 * happen for well-formed envelopes).
 */
export function getLayer(
	envelope: ResolvedAgentContextEnvelope,
	layerId: AgentContextLayerId,
): Record<string, unknown> | undefined {
	return envelope.layers.get(layerId);
}

/**
 * Resolve conflicts between layers for a given key.
 * Returns the value from the highest-priority layer (lowest priority
 * number) that contains the key, together with the source layer ID.
 * Returns `undefined` when no layer contains the key.
 */
export function resolveConflict(
	envelope: ResolvedAgentContextEnvelope,
	key: string,
):
	| { readonly value: unknown; readonly source: AgentContextLayerId }
	| undefined {
	for (const layerId of LAYER_PRIORITY_ORDER) {
		const layerContent = envelope.layers.get(layerId);
		if (layerContent && Object.hasOwn(layerContent, key)) {
			return { value: layerContent[key], source: layerId };
		}
	}
	return undefined;
}

/**
 * Compare two layer IDs by priority.
 * Returns a negative number when `a` has higher priority (lower number)
 * than `b`, zero when equal, positive when lower priority.
 */
export function comparePriority(
	a: AgentContextLayerId,
	b: AgentContextLayerId,
): number {
	const descriptorA = LAYER_DESCRIPTORS.get(a);
	const descriptorB = LAYER_DESCRIPTORS.get(b);
	if (!descriptorA || !descriptorB) {
		throw new Error(`Unknown layer ID: ${!descriptorA ? a : b}`);
	}
	return descriptorA.priority - descriptorB.priority;
}
