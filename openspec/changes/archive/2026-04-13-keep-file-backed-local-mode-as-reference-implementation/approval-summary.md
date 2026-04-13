# Approval Summary: keep-file-backed-local-mode-as-reference-implementation

**Generated**: 2026-04-13T07:34Z
**Branch**: keep-file-backed-local-mode-as-reference-implementation
**Status**: ✅ No unresolved high

## What Changed

```
 README.md            | 20 ++++++++++++++++++++
 docs/architecture.md | 26 ++++++++++++++++++++------
 2 files changed, 40 insertions(+), 6 deletions(-)
```

## Files Touched

```
README.md
docs/architecture.md
```

(Plus OpenSpec planning artifacts under `openspec/changes/keep-file-backed-local-mode-as-reference-implementation/` — proposal, design, tasks, spec delta, ledgers — to be archived to `openspec/changes/archive/`.)

## Review Loop Summary

### Design Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 1     |

### Impl Review

| Metric             | Count |
|--------------------|-------|
| Initial high       | 0     |
| Resolved high      | 0     |
| Unresolved high    | 0     |
| New high (later)   | 0     |
| Total rounds       | 2     |

(Round 1 surfaced 1 medium + 1 low finding; Round 2 — after auto-fix — both resolved.)

## Proposal Coverage

Mapping `repo-responsibility` spec delta scenarios (in `openspec/changes/keep-file-backed-local-mode-as-reference-implementation/specs/repo-responsibility/spec.md`) to the changed files:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | MODIFIED — bundled local mode listed in "This repo owns" with "canonical reference implementation" + replaceability | Yes | docs/architecture.md |
| 2 | ADDED framing #1 — conformance target present in Repository Scope | Yes | docs/architecture.md |
| 3 | ADDED framing #2 — replaceability present in Repository Scope | Yes | docs/architecture.md |
| 4 | ADDED framing #3 — contract mapping (per-adapter table) in Repository Scope | Yes | docs/architecture.md |
| 5 | ADDED README positioning paragraph identifying bundled local mode as canonical reference implementation | Yes | README.md |
| 6 | ADDED README references three framing properties (directly or by link) and identifies itself as source of truth | Yes | README.md |
| 7 | ADDED slash-command guides do not contradict the framing | Yes | (sweep result: no contradictions found in `.claude/commands/`, `.claude/skills/`, `openspec/README.md`, or `openspec/specs/`) |
| 8 | ADDED core/adapter surface wording tightened — CLI, file-backed RunStore, git-backed ArtifactStore are bundled-adapter surface, not core contract surface | Yes | docs/architecture.md |

**Coverage Rate**: 8/8 (100%)

## Remaining Risks

- ⚠️ Follow-up issue (post-merge, recorded in tasks.md 6.2): align external surfaces (GitHub repo description, issue templates, adjacent project descriptions) with the new README positioning. README is declared as the source of truth; the inconsistency is bounded and discoverable until the follow-up lands.
- ⚠️ The reference-implementation framing is enforced by content-presence scenarios in the spec, not by a docs lint test. Future drift in `docs/architecture.md` or `README.md` wording could pass `openspec validate` as long as the structural sections remain — caught only by human review (accepted trade-off per design D3 / R2).
- ⚠️ The tightened core/adapter surface distinction is a docs-only requirement; future code changes that violate the distinction (e.g., a new core import from `src/bin/` or a concrete store implementation) would not break any existing test (accepted per design R3, mitigated by the `core-dependency-boundary` change already tracking architectural test work).

(No deterministic open/new medium-or-high findings remain in `review-ledger.json` — all resolved in Round 2.)

(No newly added files outside `openspec/changes/<feature>/` per the apply diff — only modifications to `README.md` and `docs/architecture.md`.)

## Human Checkpoints

- [ ] Open `docs/architecture.md` and visually confirm that the three framing properties (conformance target / replaceability / contract mapping) read as a coherent paragraph under "Bundled local reference implementation", and that the contract-mapping table renders as intended in GitHub markdown.
- [ ] Open `README.md` (Japanese section) and `README.md` (English section) and confirm the positioning paragraphs match in substance — i.e., a JP-only or EN-only reader should reach the same conclusion about what the bundled local mode is and that the README is the source of truth.
- [ ] Confirm that the "Excluded from core contract (bundled-adapter surface)" subsection in `docs/architecture.md` reads consistently with the contract-mapping table above it (no row implies CLI/RunStore/ArtifactStore are core contract surface).
- [ ] After merge, file the follow-up issue described in `tasks.md` 6.2 ("Align external surfaces with README positioning of the bundled local reference implementation") and link it back to issue #99.
- [ ] Verify that the GitHub repo description and any pinned external mentions of specflow's positioning are noted in the follow-up issue's description so the alignment work has a discoverable scope.
