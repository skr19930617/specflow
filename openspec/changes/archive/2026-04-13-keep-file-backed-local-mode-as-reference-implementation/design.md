## Context

The repository ships two layered concerns:

- **Workflow core** under `src/core/` — pure runtime (state machine, run-state, review orchestration) intended to be replaceable.
- **Bundled local mode** — the `specflow-*` CLI entrypoints (`src/bin/`), the file-backed RunStore, the git-backed ArtifactStore, the slash-command guides, and the templates that together provide a working, end-to-end local workflow on top of the core.

The recent refactor (PR #98) split `specflow-run` into a core runtime plus local CLI wiring, making the core/adapter boundary visible at the source level. However, public-facing docs (`docs/architecture.md`, `README.md`) and the `repo-responsibility` spec describe the bundled local mode using soft language ("bundled but replaceable") that does not commit to its role as the **canonical reference implementation** of the core contract.

The current `repo-responsibility` spec already declares that this repo owns the bundled local reference implementation and that it is replaceable, but:

1. There is no explicit "canonical" / "reference implementation" framing in the docs.
2. The three framing properties (conformance target, replaceability, contract mapping) are not all present and discoverable.
3. README is silent on this positioning.
4. The core contract surface inventory does not unambiguously distinguish core surface from bundled-adapter surface.

This change closes those gaps via additive docs work plus a `repo-responsibility` spec delta that turns the framing into testable requirements.

## Goals / Non-Goals

**Goals:**

- Make `docs/architecture.md` document the bundled local mode as the canonical reference implementation of the workflow core contract, with all three framing properties (conformance target, replaceability, contract mapping) present and discoverable.
- Add a `README.md` positioning paragraph that labels the bundled local mode as the canonical reference implementation, with the three framing properties stated directly or by reference, and that explicitly identifies `README.md` as the source of truth for external-facing positioning.
- Update slash-command guide docs (under `.claude/commands/` and `openspec/` guide surfaces) so that any wording referencing local execution mode, bundled adapters, or runtime substitution is consistent with the reference-implementation framing.
- Tighten the wording of the workflow core contract surface inventory in `docs/architecture.md` so that CLI entrypoints, file-backed RunStore, and git-backed ArtifactStore are unambiguously described as bundled-adapter surface, not core contract surface.
- Confirm that current code already satisfies the tightened spec wording. If a gap is found, fix it as part of this change rather than deferring.
- Keep `bun test` and `openspec validate` green throughout.

**Non-Goals:**

- No runtime behavior changes to the workflow core, file-backed RunStore, git-backed ArtifactStore, or any `specflow-*` CLI command.
- No changes to public CLI flags, file layouts, run-state schema, or state-machine transitions.
- No new spec capabilities. The change is delta-only on `repo-responsibility`.
- No alignment of GitHub repo description, issue templates, or other external-facing surfaces. README is the source of truth; aligning adjacent surfaces is logged as a follow-up task.
- No new automated docs lint test (e.g., grep-based shell test). Verification relies on `openspec validate` (covering the framing-property requirements via spec scenarios) plus human PR review.

## Decisions

### D1 — Reference-implementation framing as three explicit properties

Decision: Codify "reference-implementation framing" as exactly three testable properties — (1) conformance target, (2) replaceability, (3) contract mapping — and require all three to be discoverable in the Repository Scope section of `docs/architecture.md`. Mirror the same three properties in `README.md` either directly or by reference.

Why: Without enumerated properties, "framing" is subjective and reviewers cannot tell when the change is done. Three properties match the actual structure of what readers need: *what is this?* (conformance target), *can I replace it?* (replaceability), *which adapter implements which contract?* (contract mapping).

Alternatives considered:

- *Two properties (replaceability + contract mapping)*: simpler but loses the explicit "this is the canonical conformance target" framing, which is the whole point of issue #99.
- *Author judgment with no enumerated properties*: rejected — re-introduces the original ambiguity.

### D2 — README is the source of truth for external-facing positioning

Decision: Treat `README.md` as the source of truth for the bundled-local-mode positioning visible to external readers. README must contain the positioning paragraph; aligning the GitHub repo description, issue templates, and other adjacent surfaces is recorded as a follow-up task in `tasks.md` but is **not** part of this change's acceptance.

Why: A single source of truth keeps the framing coherent and avoids drift between surfaces. README is the natural anchor because it is the first artifact most external readers see and because it lives in-repo, where spec requirements can enforce its content.

Alternatives considered:

- *Update GitHub repo description in the same change*: rejected because repo description is not a versioned in-repo artifact — it cannot be enforced by `openspec validate`, and editing it via `gh repo edit` introduces a side effect outside the change's scope.
- *No README update*: rejected — leaves the most-read external surface inconsistent with `docs/architecture.md`.

### D3 — Verification: spec requirements + openspec validate + human review

Decision: Verify the framing change through three layers: (a) `openspec validate` enforces that the spec's framing requirements are structurally well-formed, (b) the spec scenarios act as a checklist for human PR review of the docs, and (c) `bun test` continues to prove behavior is unchanged.

Why: The framing outcome is content, not behavior — automation alone cannot judge whether wording communicates the intended framing. The spec requirements give reviewers a concrete checklist (each scenario maps to a check), which is more reliable than free-form review while staying lightweight.

Alternatives considered:

- *Add a grep-based docs lint test*: rejected — brittle (keyword presence ≠ correct framing), and would create a new automated check unique to this change rather than reusing the existing `openspec validate` discipline.
- *Human review only*: rejected — gives no enforcement against future regressions in `docs/architecture.md` or `README.md`.

### D4 — Spec tightening discipline: confirm code conformance during design

Decision: During the design phase (i.e., as part of this document), explicitly inspect the current code and confirm that the planned tightened spec wording — "CLI entrypoints, file-backed RunStore, and git-backed ArtifactStore are bundled-adapter surface, not core contract surface" — is already satisfied by the current implementation. If a gap is found, the fix is added to `tasks.md` of this change.

Why: A spec delta that tightens wording can retroactively make existing code non-conformant. Catching this at design time avoids surprising the apply phase. Per user choice during reclarify, the fix lives in this change's `tasks.md`, not a follow-up.

**Inspection result:** The recent refactor (PR #98 — "split specflow-run into core runtime + local CLI wiring") already separates pure core logic (`src/core/start.ts`, `src/core/advance.ts`, `src/core/run-core.ts`, etc.) from local CLI wiring (`src/bin/specflow-run.ts`). The file-backed RunStore lives behind the `RunStore` interface used by core; the git-backed ArtifactStore is similarly a bundled adapter behind a core-defined interface. The core contract surface (state machine schema, run-state JSON shape, review protocol) does not import from `src/bin/`, the file-backed store implementation, or the git-backed store implementation. Therefore the tightened spec wording is satisfied by the current code. No code adjustment is required for the spec tightening; tasks.md will only contain docs/spec work.

Alternatives considered:

- *Defer the gap check to apply phase*: rejected — makes apply unpredictable (could discover a code change is needed after design is locked).
- *Forbid all spec tightening in this change*: rejected — leaves the existing soft wording in place, which is the very ambiguity the issue asks to fix.

### D5 — Slash-command guide updates: consistency check, not full rewrite

Decision: The slash-command guide updates are limited to *consistency* — any wording in `.claude/commands/` or `openspec/` guide docs that references local execution mode, bundled adapters, or runtime substitution must not contradict the reference-implementation framing. There is no requirement to introduce reference-implementation language into guides that do not already discuss these topics.

Why: A blanket "label everything as reference implementation" approach would bloat unrelated guide docs and dilute the framing. Consistency is the achievable, valuable bar.

Alternatives considered:

- *Add reference-implementation framing to every slash-command guide*: rejected — most guides describe per-command behavior and do not naturally discuss core/adapter substitution.
- *Exclude slash-command guides entirely*: rejected — user opted in during reclarify because guides are part of the local surface and contradictions there would undermine the framing.

### D6 — Spec delta shape: 1 MODIFIED + 4 ADDED requirements

Decision: Implement the spec delta as one MODIFIED requirement (tightening "Bundled local reference implementation ownership is defined" to add the canonical-reference-implementation language) plus four ADDED requirements covering (a) the three framing properties in `docs/architecture.md`, (b) `README.md` positioning, (c) slash-command guide consistency, and (d) tightened core/adapter surface distinction.

Why: This shape keeps each requirement single-purpose and testable via a small set of scenarios. ADDED for new framing properties avoids loss of detail at archive time; MODIFIED for the existing ownership requirement preserves the requirement's identity while strengthening its wording.

Alternatives considered:

- *Single mega-requirement covering all framing*: rejected — harder to map scenarios to checks and harder to evolve incrementally.
- *MODIFIED for everything*: rejected — would require rewriting requirements that are functionally new additions, losing structural clarity.

## Risks / Trade-offs

- **[R1] Wording drift between `docs/architecture.md` and `README.md`** → Mitigation: The spec scenario for README explicitly allows the README to delegate the three framing properties to `docs/architecture.md` by reference, so the architecture doc is the single content source; README only needs to *point* to it. PR review applies the same scenario checklist to both surfaces.
- **[R2] Spec scenarios judge content presence, not content quality** → Mitigation: Accepted trade-off. `openspec validate` confirms structural presence; PR review judges quality. Adding a quality-of-prose check is out of scope.
- **[R3] Future code refactors could violate the tightened core/adapter surface distinction without breaking any test** → Mitigation: Accepted for now. The `repo-responsibility` spec scenarios describe expected wording in `docs/architecture.md`, not source-code structure. A future change can add an architectural test if drift becomes an issue. Documenting this as a known limitation in `docs/architecture.md` is *not* required by the spec delta.
- **[R4] External surfaces (GitHub repo description, issue templates) remain inconsistent until follow-up is done** → Mitigation: Recorded as a follow-up task in `tasks.md`. README is declared as source of truth, so the inconsistency is bounded and discoverable.
- **[R5] The slash-command guide consistency requirement is fuzzy** → Mitigation: Scoped to "do not contradict" rather than "must contain". Reviewers only need to flag contradictions, not validate framing wording everywhere.

## Migration Plan

This change is docs-only, so there is no runtime migration. Deployment is the merge of the PR. Rollback is `git revert` of the same PR; no data, schema, or interface changes need to be undone.

Sequencing within the apply phase:

1. Update `docs/architecture.md` (Repository Scope additions + tightened core/adapter wording).
2. Update `README.md` (positioning paragraph).
3. Sweep slash-command guide docs for any wording that contradicts the framing; fix only the contradictions found.
4. Run `openspec validate keep-file-backed-local-mode-as-reference-implementation --type change`.
5. Run `bun test` to confirm no behavior regression.
6. Open the PR; reference issue #99.
7. After merge, file the follow-up issue for aligning external surfaces (GitHub repo description, etc.).

## Open Questions

None. All five challenge points (C1–C5) were resolved during reclarify and are reflected in this design.
