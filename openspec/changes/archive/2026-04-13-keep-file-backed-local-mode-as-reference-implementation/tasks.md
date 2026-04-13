## 1. docs/architecture.md updates

- [x] 1.1 In the "Repository Scope" → "This repo owns" subsection, update the bundled-local-mode entry to explicitly label it as the **canonical reference implementation** of the workflow core contract (satisfies MODIFIED requirement "Bundled local reference implementation ownership is defined").
- [x] 1.2 Add wording (in Repository Scope, contiguous with the bundled-local-mode entry) covering framing property #1 — **conformance target**: state that the bundled local mode is the canonical conformance target for the workflow core contract.
- [x] 1.3 Add wording covering framing property #2 — **replaceability**: state that the local mode is replaceable by external runtimes (e.g., DB-backed, server-backed) conforming to the workflow core contract.
- [x] 1.4 Add wording covering framing property #3 — **contract mapping**: map each bundled adapter — CLI entrypoints under `src/bin/`, the file-backed RunStore, and the git-backed ArtifactStore — to the workflow core contract surface it implements.
- [x] 1.5 Tighten the wording of the "Workflow core contract surface inventory" section so that CLI entrypoints, the file-backed RunStore, and the git-backed ArtifactStore are unambiguously described as bundled-adapter surface (not core contract surface).

## 2. README.md updates

- [x] 2.1 Add a positioning paragraph (or extend an existing top-level section) that labels the bundled local slash-command + file-backed + git-backed mode as the canonical reference implementation of the workflow core contract.
- [x] 2.2 In the same paragraph, state the three framing properties (conformance target, replaceability, contract mapping) directly **or** link to the Repository Scope section of `docs/architecture.md` for the details.
- [x] 2.3 Explicitly identify `README.md` as the source of truth for external-facing positioning of the bundled local mode (e.g., a one-line note adjacent to the positioning paragraph).

## 3. Slash-command guide consistency sweep

- [x] 3.1 Sweep `.claude/commands/` for wording that references local execution mode, bundled adapters, or runtime substitution; flag and fix any wording that contradicts the reference-implementation framing established in `docs/architecture.md` and `README.md`. **Result:** No mentions of local execution mode, bundled adapters, RunStore/ArtifactStore, conformance, or runtime substitution in `.claude/commands/` (only `opsx/` openspec helper commands present); no contradictions to fix.
- [x] 3.2 Sweep `openspec/` guide surfaces (e.g., guide files referenced by slash commands such as the `/specflow*` skill prompts) for the same contradictions; fix only the contradictions found. Do not introduce reference-implementation language into guides that do not already discuss these topics. **Result:** `openspec/README.md` contains directory convention only — no framing-relevant wording. `openspec/specs/` references (`bundled`, `replaceable`, `external runtime`, `conformance`) are consistent with the new framing or already updated by this change's spec delta. No contradictions to fix.

## 4. Spec-tightening conformance check (no code change expected)

- [x] 4.1 Re-confirm at apply time the design's D4 finding: `src/core/` does not import from `src/bin/`, the file-backed RunStore implementation, or the git-backed ArtifactStore implementation. If a violation is found, add a follow-up task in this section to remove the import; otherwise mark this task done with no code change. **Result:** All `src/core/*.ts` imports verified — only `../lib/artifact-store.ts` (interface, no I/O), `../lib/run-store-ops.ts` (store-backed ops on the interface), `../lib/workspace-context.ts` (VCS-neutral interface), `../lib/artifact-types.ts` (types), `../lib/workflow-machine.ts` (core logic), `../types/contracts.ts` (types), and intra-core `./` imports. **No imports from `src/bin/` or any concrete file/git store implementation.** D4 satisfied; no code change required.

## 5. Verification

- [x] 5.1 Run `openspec validate keep-file-backed-local-mode-as-reference-implementation --type change` and confirm `valid: true`. **Result:** `valid: true`, 0 issues.
- [x] 5.2 Run `bun test` and confirm all existing tests still pass (no behavior regression). **Note:** This repo's actual verification command is `npm test` (which builds and runs `node --test dist/tests/*.test.js`); `bun test` was an erroneous reference in the original task. **Result:** `npm test` — 223 tests pass, 0 fail.
- [x] 5.3 Manually walk the spec scenarios for `repo-responsibility` against the updated `docs/architecture.md`, `README.md`, and slash-command guide docs as a self-review checklist before opening the PR. **Result:**
  - MODIFIED "Bundled local reference implementation ownership is defined" — `docs/architecture.md` now labels the bundled local mode as the "**canonical reference implementation**" and retains the replaceability statement. ✓
  - ADDED "Reference-implementation framing properties are present in docs/architecture.md" — all three properties (conformance target, replaceability, contract mapping with adapter→contract table) appear contiguous in the Repository Scope section. ✓
  - ADDED "README.md positions the bundled local mode as the reference implementation" — new "## 位置づけ — Reference Implementation" section in JP and "## Positioning — Reference Implementation" in EN, with the three properties stated directly + linking to docs/architecture.md, plus an explicit "Source of truth" note. ✓
  - ADDED "Slash-command guide docs reinforce reference-implementation framing" — sweep found no contradictions in `.claude/commands/`, `.claude/skills/`, `openspec/README.md`, or `openspec/specs/`. ✓
  - ADDED "Core contract surface and bundled-adapter surface wording are distinguished" — "Excluded from core contract (bundled-adapter surface)" subsection explicitly lists CLI entrypoints, file-backed RunStore, and git-backed ArtifactStore as bundled-adapter surface, not core contract surface. ✓

## 6. PR + follow-up

- [ ] 6.1 Open the PR; reference issue #99 in the PR body.
- [ ] 6.2 After merge, file a follow-up GitHub issue titled "Align external surfaces with README positioning of the bundled local reference implementation" covering the GitHub repo description, issue templates, and any other adjacent project descriptions. Link this follow-up issue back to issue #99.
