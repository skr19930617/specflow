## Why

This repository ships both a workflow core and a local slash-command + file-backed + git-backed execution mode. The local mode is currently the only working reference implementation of the core contract, but docs do not clearly label it as such — readers risk conflating the local mode with the core itself, and the responsibilities between `core`, `adapters`, and the `local surface` are blurry.

We want to formally position the local mode as the **canonical reference implementation** of the workflow core contract, so that:

- New contributors understand what is core (replaceable-by-contract) vs. what is bundled (reference implementation).
- Future runtimes (DB-backed, server-backed, etc.) have a clear conformance target.
- The existing local workflow keeps working unchanged — this is a docs/positioning change, not a behavior change.

Source: https://github.com/skr19930617/specflow/issues/99

## What Changes

- Document the local slash-command + file-backed + git-backed mode as the **reference implementation** of the workflow core contract in `docs/architecture.md`.
- Update `README.md` so the project's first-impression positioning also labels the bundled local mode as the reference implementation of the core contract. `README.md` is the **source of truth** for external-facing positioning; aligning adjacent surfaces (GitHub repo description, issue templates, etc.) is tracked as a follow-up task, not part of this change's acceptance.
- Sweep slash-command guide docs (under `.claude/commands/` and `openspec/` guide surfaces) for any wording that would contradict the reference-implementation framing, and fix only the contradictions found. Adding new framing wording to guides that do not already discuss local execution mode, bundled adapters, or runtime substitution is **explicitly out of scope** for this change — `docs/architecture.md` and `README.md` remain the authoritative surfaces for the framing itself. If the sweep finds no contradictions, this scope is satisfied with no edits to those guide surfaces.
- Clarify the responsibility split between:
  - **Core** (`src/core/`) — state machine, run-state, review orchestration contracts
  - **Bundled adapters** (`src/bin/` CLI wiring + file-backed RunStore + git-backed ArtifactStore) — the thin glue that exposes core to a particular surface
  - **Local surface** — the slash-command / `specflow-*` CLI user experience
- Organize the bundled adapter docs so that each adapter (CLI entrypoint, file store, git store) is traceable to the core contract it implements.
- Preserve existing local workflow behavior; no CLI flags, file layouts, or state transitions change. The existing test suite (`bun test` + `openspec validate`) must remain green as the evidence that local workflow is maintained.

### Reference-implementation framing: minimum required properties

To qualify as sufficient "reference implementation" framing, the updated docs SHALL cover all three of the following properties. These properties become testable requirements in the `repo-responsibility` spec delta (see Step 7).

1. **Conformance target** — docs explicitly state that the bundled local mode is the canonical conformance target for the workflow core contract.
2. **Replaceability** — docs explicitly state that the local mode is replaceable by external runtimes (DB-backed, server-backed, etc.) conforming to the workflow core contract.
3. **Contract mapping** — docs map each bundled adapter (CLI entrypoints, file-backed RunStore, git-backed ArtifactStore) to the core contract surface it implements.

### Spec tightening discipline

The `repo-responsibility` spec delta will tighten the wording that distinguishes core contract surface from bundled-adapter surface. Before approving the spec delta, design must confirm that the current code already satisfies the tightened wording. If any gap is found, the adjustment SHALL be added as a task in `tasks.md` within this change (not split into a follow-up change).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `repo-responsibility`: Extend the "This repo owns" / "Boundary Decision Rules" sections of `docs/architecture.md` to explicitly call out the bundled local mode as the reference implementation of the core contract, require the three framing properties (conformance target, replaceability, contract mapping) to be present in both `docs/architecture.md` and `README.md`, and tighten the wording that distinguishes core contract surface from bundled-adapter surface.

## Impact

- Docs: `docs/architecture.md` (Repository Scope section — additive wording only) and `README.md` (positioning paragraph — additive wording only). Slash-command guide docs under `.claude/commands/` and `openspec/` guide surfaces are swept for contradictions only; no new framing wording is introduced into those guides as part of this change (see "What Changes" for the explicit out-of-scope note). **Sweep result (recorded in `tasks.md` 3.1 and 3.2): no contradictions found in `.claude/commands/` (only `opsx/` openspec helper commands present, none of which discuss local execution mode, bundled adapters, or runtime substitution) or in `openspec/` guide surfaces; therefore no edits to those guide files appear in the diff, consistent with the "fix only the contradictions found" scope.**
- Specs: `openspec/specs/repo-responsibility/` (requirement delta to reinforce reference-implementation framing, to require the three framing properties, and to cover the `README.md` positioning surface).
- Code: No runtime behavior changes expected. Existing `specflow-*` CLI, slash command guides, file-backed RunStore, and git-backed ArtifactStore paths remain untouched. If design finds the current code fails the tightened spec wording, minimal adjustments will be tracked in `tasks.md`.
- Verification:
  - `openspec validate "<CHANGE_ID>" --type change` passes, covering the three framing-property requirements.
  - Existing `bun test` runs stay green as the acceptance signal that local workflow is preserved.
  - Human PR review confirms the wording of the three framing properties.
- Follow-up (out of scope): Aligning external surfaces (GitHub repo description, issue templates, other adjacent project descriptions) with the new `README.md` positioning is tracked as a follow-up issue recorded in `tasks.md`.
- Consumers: External-runtime authors gain a clearer target to conform to; local users are unaffected.
