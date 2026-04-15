/**
 * Mandatory planning-oriented section headings for design.md.
 * This is the single source of truth used by both generation prompts
 * and structural validation.
 */
export const PLANNING_HEADINGS = Object.freeze([
	"Concerns",
	"State / Lifecycle",
	"Contracts / Interfaces",
	"Persistence / Ownership",
	"Integration Points",
	"Ordering / Dependency Notes",
	"Completion Conditions",
] as const);

export type PlanningHeadingName = (typeof PLANNING_HEADINGS)[number];

/** Human-readable description per heading, used in error messages and prompt instructions. */
export const PLANNING_HEADING_DESCRIPTIONS: Readonly<
	Record<PlanningHeadingName, string>
> = {
	Concerns:
		"User-facing concerns or vertical slices, and the problem each concern resolves",
	"State / Lifecycle":
		"Canonical state, derived state, lifecycle boundaries, and persistence-sensitive state",
	"Contracts / Interfaces":
		"Interfaces between layers (UI / API / persistence / renderer / external services), and inputs/outputs that other bundles depend on",
	"Persistence / Ownership":
		"Data ownership boundaries, storage mechanisms, and artifact ownership",
	"Integration Points":
		"External systems, cross-layer dependency points, and regeneration / retry / save / restore boundaries",
	"Ordering / Dependency Notes":
		"Which concerns are foundational, which depend on prior artifacts or contracts, and what can be implemented in parallel",
	"Completion Conditions":
		"What artifact or observable condition means a concern is complete, and what should be reviewable independently",
};
