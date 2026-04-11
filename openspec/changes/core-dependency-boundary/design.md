## Context

`docs/architecture.md` already contains a "Repository Scope" section (added in the `repo-responsibility-nongoals` change) that defines ownership boundaries and a non-normative "Workflow Core Contract Surface" inventory. However, there is no explicit rule about what `src/lib/` modules may or may not import — Git/FS/CLI concerns leak into modules that contain reusable core logic (`review-ledger.ts`, `review-runtime.ts`, `contracts.ts`, `proposal-source.ts`).

This change adds a "Core Dependency Boundary" section to `docs/architecture.md` and amends the existing contract surface inventory with external-runtime support status annotations. It is documentation-only — no code changes, no new files beyond the architecture doc update.

The target file is `docs/architecture.md` (currently 99 lines). The new section will be appended below the existing "Workflow Core Contract Surface" subsection and will explicitly cover the boundary status model, the required tracking-reference format, the rule that type-only imports follow the same boundary as value imports, the continued exclusion of `src/contracts/*` from the core-adjacent allowlist, and the dependency decision heuristic that ties borderline import decisions back to the existing "Repository Scope" ownership rules.

Those boundary details are normative requirements, not implications to leave embedded in surrounding prose. The design must therefore call them out as explicit subsection content so the eventual documentation edit cannot omit them accidentally while still appearing to satisfy the larger section-level changes.

## Goals / Non-Goals

**Goals:**
- Document the authoritative module classification (core / adapter / mixed) for every `src/lib/` module
- Define exhaustive dependency allowlist and forbidden list for core modules, including type-only import treatment and the exclusion of `src/contracts/*` from the core-adjacent allowlist
- Make the target-state versus known-violation status model explicit, including how violations are tracked, that current mixed-module violations are transitional rather than accepted steady state, and that new violations must not be introduced
- Record known boundary violations with tracking references in the required `<repo>#<issue-number>` or `TBD — to be filed before next release` formats
- Define adapter contract categories with requirement levels
- Annotate existing contract surface inventory with external-runtime support status
- Document the dependency decision heuristic and its linkage back to "Repository Scope"
- Provide actionable rules for inventory maintenance and mixed-module interim usage

**Non-Goals:**
- No code refactoring — mixed modules remain as-is
- No TypeScript interface extraction for adapter contracts
- No lint rules or automated import enforcement
- No `RunState` field-level split between core and local-adapter
- No review transport contract specification
- No changes to any file other than `docs/architecture.md`

## Decisions

### D1: Single file, appended section

**Decision:** Add the "Core Dependency Boundary" section as a new top-level section in `docs/architecture.md`, placed after the existing "Workflow Core Contract Surface" subsection (which is the last subsection of "Repository Scope").

**Rationale:** The boundary rules are architecturally coupled to the existing scope definitions. A single-file approach keeps all architectural context co-located, avoids cross-file references, and matches the pattern established by the `repo-responsibility-nongoals` change.

**Alternative considered:** Separate `docs/dependency-boundary.md` — rejected because it would fragment architectural context and require cross-references that increase maintenance burden.

### D2: Module inventory as markdown table

**Decision:** Present the module inventory as a markdown table with columns: Module, Classification, Description.

**Rationale:** Tables are scannable, diff-friendly, and easy to maintain. Each row maps directly to a file in `src/lib/`, making exhaustiveness verifiable by inspection.

### D3: Known violations as a separate table

**Decision:** Place the "Known Boundary Violations" table separately from the module inventory, with columns: Module, Violation, Tracking Reference. Tracking Reference entries are normative and must use exactly one of the proposal's required formats: `<repo>#<issue-number>` when a follow-up issue exists, or `TBD — to be filed before next release` when it does not.

**Rationale:** Separating violations from the inventory emphasizes that violations are temporary exceptions to be resolved, not permanent classifications. The tracking reference column provides accountability.

### D4: Amend existing contract surface table in-place

**Decision:** Add a "External Runtime Support" column to the existing "Workflow Core Contract Surface" table rather than creating a parallel section.

**Rationale:** Keeps the contract surface information consolidated. Adding a column to an existing table is a minimal, non-destructive edit that preserves the non-normative label while adding support-status context.

### D5: Inline all rules in a single section

**Decision:** Place the allowed/forbidden dependency rules, type-only import rule, explicit exclusion of `src/contracts/*` from the core-adjacent allowlist, mixed-module interim rules, boundary status model, default classification rule, inventory maintenance rule, dependency decision heuristic, and classification-vs-support-status statement as subsections within the "Core Dependency Boundary" section. The "Core Allowed Dependencies" subsection will explicitly call out that `src/types/contracts.ts` is the only core-adjacent local module, that both value and type imports from it are allowed, and that type-only imports from adapter modules, `src/bin/*`, `src/contracts/*`, or DB-specific packages remain forbidden.

**Rationale:** All rules are interdependent and should be read together. Fragmenting them across multiple top-level sections would force readers to assemble context from scattered locations.

### D6: Explicit status model and heuristic subsections

**Decision:** Add dedicated "Boundary Status Model" and "Dependency Decision Heuristic" subsections. The status model will describe the documented boundary as the target state, explain that mixed modules are tracked as known violations rather than accepted steady-state design, note that existing violations are expected until follow-up refactors land rather than being treated as present-day errors, and state that new violations must not be introduced. The heuristic will give concrete borderline examples and explicitly direct readers back to the "Repository Scope" ownership guidance when deciding whether a dependency belongs in core or an adapter.

**Rationale:** These are normative rules for how contributors interpret and apply the boundary. Giving them explicit subsections prevents the requirements from being lost inside table descriptions or inferred indirectly from the allowlist.

**Alternative considered:** Fold the status and heuristic guidance into surrounding prose near the tables and support-status note — rejected because those requirements are too easy to miss when they are not called out as standalone rules.

### D7: Make boundary-adjacent rules independently traceable

**Decision:** Treat the tracking-reference format, the type-only-import parity rule, the explicit exclusion of `src/contracts/*` from the core-adjacent allowlist, and the Repository Scope linkage for the dependency heuristic as independently called out requirements in both the design and task plan, rather than relying on combined checklist items to imply them.

**Rationale:** These rules are small but normative, and review feedback showed they are easy to miss when bundled into broader section-edit tasks. Making them independently traceable keeps the implementation focused without changing the underlying architecture decisions.

**Alternative considered:** Leave the rules embedded inside the broader allowlist/status/heuristic tasks — rejected because that approach already proved too implicit for review.

## Risks / Trade-offs

**[Manual inventory drift]** The module inventory is manually maintained and may fall out of sync with `src/lib/`. → **Mitigation:** The inventory maintenance rule requires PR-level updates. Drift is explicitly classified as a documentation bug (non-blocking) rather than a validation error, keeping the bar practical. Automated enforcement is deferred to a follow-up proposal.

**[Overly restrictive core boundary]** The strict allowlist (only `xstate` + ECMAScript globals) may block legitimate future core needs. → **Mitigation:** The allowlist is explicitly extensible — adding a new third-party dependency requires only updating the documented allowlist. The proposal makes this the expected path, not a workaround.

**[Mixed-module interim rules are unenforceable]** Without lint rules, the boundary is advisory. Contributors may inadvertently create new core→mixed imports. → **Mitigation:** This is accepted as a known limitation. The documentation establishes the contract that automated enforcement will reference. Code review processes can use the documented rules as a checklist in the interim.

**[RunState type is transitional]** `src/types/contracts.ts` is allowlisted for core imports, but `RunState` contains local-adapter fields. Core modules importing `RunState` may inadvertently depend on local-adapter semantics. → **Mitigation:** The proposal explicitly marks these types as transitional and defers the field-level split. The documentation will note this caveat alongside the core-adjacent module description.
