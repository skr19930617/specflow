## Context

`docs/architecture.md` currently documents the contract-first Node architecture: build layers, workflow truth, generated assets, runtime strategy, installation, and release distribution. It establishes technical how-it-works details but does not define what this repository is responsible for versus what belongs elsewhere.

Issue #89 asks to codify the repository boundary so that contributors and reviewers have an explicit decision framework for scoping new work.

Constraints:
- Documentation-only change; no code modifications
- Existing sections in `docs/architecture.md` must remain untouched
- The contract surface inventory is non-normative; normative specs are deferred

## Goals / Non-Goals

**Goals:**
- Add a "Repository Scope" section to `docs/architecture.md` covering ownership, non-goals, boundary rules, and contract surface inventory
- Provide actionable decision rules with concrete examples for borderline components
- Clearly separate workflow core contract from CLI implementation surface

**Non-Goals:**
- Writing normative contract specifications (deferred to follow-up proposal)
- Defining versioning or change management for contracts
- Modifying any existing section of `docs/architecture.md`
- Any code changes

## Decisions

### D1: Append to existing `docs/architecture.md` rather than creating a new file
**Rationale:** The file already serves as the single architecture reference. Adding a new file would split the audience and risk staleness. A new top-level section ("Repository Scope") at the end keeps existing content stable while making scope discoverable in the same place reviewers already look.
**Alternative considered:** Separate `docs/repo-scope.md` — rejected because it creates a second file that must stay synchronized and has lower discoverability.

### D2: Four subsections inside "Repository Scope"
Structure the new section as:
1. **This repo owns** — workflow core + bundled local reference implementation
2. **This repo does not own** — DB-backed runtime, server PoC, external runtime adapters
3. **Boundary Decision Rules** — rules with at least three concrete examples
4. **Workflow Core Contract Surface (Inventory)** — non-normative list of contract surfaces with explicit deferral note

**Rationale:** Mirrors the proposal structure directly and gives reviewers a predictable place to check each concern.

### D3: CLI entry-points are explicitly excluded from core contract
**Rationale:** CLI surface (command names, flags, output format) is an implementation detail of the bundled local reference. External runtimes need only conform to the workflow core contract (state machine schema, run-state JSON, review protocol). Including CLI in the contract would unnecessarily couple external runtimes to the local adapter's UX decisions.

### D4: Contract inventory is labeled non-normative with deferral
**Rationale:** Defining normative contract specs, versioning, and governance is a larger effort that would expand this change beyond a documentation-only scope. The inventory establishes what the surfaces are; a follow-up proposal will own the detailed specs.

## Risks / Trade-offs

- **Inventory may become stale** → Mitigation: the inventory references existing source locations (e.g., `src/lib/workflow-machine.ts` for state machine) so drift is detectable via existing spec-drift tests.
- **Boundary rules may not cover every future edge case** → Mitigation: rules include a decision heuristic ("if the component is runtime-agnostic, it belongs here; if it requires a specific storage or transport backend, it belongs in the external runtime repo") plus examples. Edge cases can be resolved by PR discussion referencing the rules.
- **Contributors may treat the inventory as normative** → Mitigation: the section header and body explicitly state "non-normative inventory" and reference the deferred follow-up.
