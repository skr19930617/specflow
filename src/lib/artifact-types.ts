// Canonical artifact type registry and identity types.
// See openspec/changes/decide-artifact-ownership-and-storage-abstraction/specs/artifact-ownership-model/spec.md

// --- Storage Domains ---

export const ChangeArtifactType = {
	Proposal: "proposal",
	Design: "design",
	Tasks: "tasks",
	TaskGraph: "task-graph",
	SpecDelta: "spec-delta",
	ReviewLedger: "review-ledger",
	CurrentPhase: "current-phase",
	ApprovalSummary: "approval-summary",
} as const;

export type ChangeArtifactType =
	(typeof ChangeArtifactType)[keyof typeof ChangeArtifactType];

export const changeArtifactTypes: readonly ChangeArtifactType[] =
	Object.values(ChangeArtifactType);

export const RunArtifactType = {
	RunState: "run-state",
	AutofixProgress: "autofix-progress",
} as const;

export type RunArtifactType =
	(typeof RunArtifactType)[keyof typeof RunArtifactType];

export const runArtifactTypes: readonly RunArtifactType[] =
	Object.values(RunArtifactType);

/** Review phases that have their own autofix progress snapshot. */
export const AutofixProgressPhase = {
	DesignReview: "design_review",
	ApplyReview: "apply_review",
} as const;

export type AutofixProgressPhase =
	(typeof AutofixProgressPhase)[keyof typeof AutofixProgressPhase];

export const autofixProgressPhases: readonly AutofixProgressPhase[] =
	Object.values(AutofixProgressPhase);

export const ReviewLedgerKind = {
	Proposal: "proposal",
	Design: "design",
	Apply: "apply",
} as const;

export type ReviewLedgerKind =
	(typeof ReviewLedgerKind)[keyof typeof ReviewLedgerKind];

export const reviewLedgerKinds: readonly ReviewLedgerKind[] =
	Object.values(ReviewLedgerKind);

// --- Singleton change artifact types (no qualifier) ---

export type SingletonChangeArtifactType =
	| typeof ChangeArtifactType.Proposal
	| typeof ChangeArtifactType.Design
	| typeof ChangeArtifactType.Tasks
	| typeof ChangeArtifactType.TaskGraph
	| typeof ChangeArtifactType.CurrentPhase
	| typeof ChangeArtifactType.ApprovalSummary;

// --- Concrete Artifact References (identified artifacts) ---

export type ChangeArtifactRef =
	| {
			readonly changeId: string;
			readonly type: SingletonChangeArtifactType;
	  }
	| {
			readonly changeId: string;
			readonly type: typeof ChangeArtifactType.SpecDelta;
			readonly qualifier: string;
	  }
	| {
			readonly changeId: string;
			readonly type: typeof ChangeArtifactType.ReviewLedger;
			readonly qualifier: ReviewLedgerKind;
	  };

export type RunArtifactRef =
	| {
			readonly runId: string;
			readonly type: typeof RunArtifactType.RunState;
	  }
	| {
			readonly runId: string;
			readonly type: typeof RunArtifactType.AutofixProgress;
			readonly qualifier: AutofixProgressPhase;
	  };

export function isAutofixProgressPhase(
	value: string,
): value is AutofixProgressPhase {
	return autofixProgressPhases.includes(value as AutofixProgressPhase);
}

// --- Query / Descriptor Types (for list operations, no concrete identity yet) ---

export interface ChangeArtifactQuery {
	readonly changeId: string;
	readonly type: ChangeArtifactType;
}

export interface RunArtifactQuery {
	readonly changeId?: string;
}

// --- Artifact Requirement (for static gate matrix, no runtime values) ---

export type ArtifactRequirement =
	| {
			readonly domain: "change";
			readonly type: SingletonChangeArtifactType;
	  }
	| {
			readonly domain: "change";
			readonly type: typeof ChangeArtifactType.SpecDelta;
			readonly qualifierFrom: "specName";
	  }
	| {
			readonly domain: "change";
			readonly type: typeof ChangeArtifactType.ReviewLedger;
			readonly qualifier: ReviewLedgerKind;
	  }
	| {
			readonly domain: "run";
			readonly type: typeof RunArtifactType.RunState;
	  }
	| {
			readonly domain: "change";
			readonly oneOf: readonly SingletonChangeArtifactType[];
	  };

// --- Type Guards ---

export function isChangeArtifactType(
	value: string,
): value is ChangeArtifactType {
	return changeArtifactTypes.includes(value as ChangeArtifactType);
}

export function isRunArtifactType(value: string): value is RunArtifactType {
	return runArtifactTypes.includes(value as RunArtifactType);
}

export function isReviewLedgerKind(value: string): value is ReviewLedgerKind {
	return reviewLedgerKinds.includes(value as ReviewLedgerKind);
}

// --- Ref Constructors ---

export function changeRef(
	changeId: string,
	type: SingletonChangeArtifactType,
): ChangeArtifactRef;
export function changeRef(
	changeId: string,
	type: typeof ChangeArtifactType.SpecDelta,
	qualifier: string,
): ChangeArtifactRef;
export function changeRef(
	changeId: string,
	type: typeof ChangeArtifactType.ReviewLedger,
	qualifier: ReviewLedgerKind,
): ChangeArtifactRef;
export function changeRef(
	changeId: string,
	type: ChangeArtifactType,
	qualifier?: string,
): ChangeArtifactRef {
	if (type === ChangeArtifactType.SpecDelta) {
		return { changeId, type, qualifier: qualifier as string };
	}
	if (type === ChangeArtifactType.ReviewLedger) {
		return { changeId, type, qualifier: qualifier as ReviewLedgerKind };
	}
	return { changeId, type: type as SingletonChangeArtifactType };
}

export function runRef(runId: string): RunArtifactRef;
export function runRef(
	runId: string,
	type: typeof RunArtifactType.RunState,
): RunArtifactRef;
export function runRef(
	runId: string,
	type: typeof RunArtifactType.AutofixProgress,
	qualifier: AutofixProgressPhase,
): RunArtifactRef;
export function runRef(
	runId: string,
	type: RunArtifactType = RunArtifactType.RunState,
	qualifier?: AutofixProgressPhase,
): RunArtifactRef {
	if (type === RunArtifactType.AutofixProgress) {
		return {
			runId,
			type,
			qualifier: qualifier as AutofixProgressPhase,
		};
	}
	return { runId, type: RunArtifactType.RunState };
}

// --- Ref Qualifier Accessor ---

export function refQualifier(ref: ChangeArtifactRef): string | undefined {
	if ("qualifier" in ref) {
		return ref.qualifier;
	}
	return undefined;
}

// --- Typed Errors ---

export type ArtifactStoreErrorKind =
	| "not_found"
	| "write_failed"
	| "read_failed"
	| "conflict";

export class ArtifactStoreError extends Error {
	readonly kind: ArtifactStoreErrorKind;
	readonly ref?: ChangeArtifactRef | RunArtifactRef;
	constructor(opts: {
		kind: ArtifactStoreErrorKind;
		message: string;
		ref?: ChangeArtifactRef | RunArtifactRef;
	}) {
		super(opts.message);
		this.name = "ArtifactStoreError";
		this.kind = opts.kind;
		this.ref = opts.ref;
	}
}

export class UnknownArtifactTypeError extends Error {
	readonly artifactType: string;
	constructor(artifactType: string) {
		super(`Unknown artifact type: ${artifactType}`);
		this.name = "UnknownArtifactTypeError";
		this.artifactType = artifactType;
	}
}

export class ArtifactSchemaValidationError extends Error {
	readonly ref: ChangeArtifactRef | RunArtifactRef;
	readonly validationErrors: readonly string[];
	constructor(
		ref: ChangeArtifactRef | RunArtifactRef,
		validationErrors: readonly string[],
	) {
		super(`Artifact schema validation failed: ${validationErrors.join(", ")}`);
		this.name = "ArtifactSchemaValidationError";
		this.ref = ref;
		this.validationErrors = validationErrors;
	}
}

export class MissingRequiredArtifactError extends Error {
	readonly requirement: ArtifactRequirement;
	readonly context: { changeId?: string; runId?: string };
	constructor(
		requirement: ArtifactRequirement,
		context: { changeId?: string; runId?: string },
	) {
		let desc: string;
		if (requirement.domain === "change" && "oneOf" in requirement) {
			desc = `(${context.changeId ?? "?"}, oneOf[${requirement.oneOf.join(", ")}])`;
		} else if (requirement.domain === "change") {
			desc = `(${context.changeId ?? "?"}, ${requirement.type}${"qualifier" in requirement ? `, ${requirement.qualifier}` : ""})`;
		} else {
			desc = `(${context.runId ?? "?"}, ${requirement.type})`;
		}
		super(`Missing required artifact for phase transition: ${desc}`);
		this.name = "MissingRequiredArtifactError";
		this.requirement = requirement;
		this.context = context;
	}
}
