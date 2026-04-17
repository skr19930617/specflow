# Approval Summary: refactor-command-bodies-into-template-based-authoring-with-explicit-contract-insertion-points

**Generated**: 2026-04-17 07:42 UTC
**Branch**: refactor-command-bodies-into-template-based-authoring-with-explicit-contract-insertion-points
**Status**: ✅ No unresolved high

## What Changed

```
 src/build.ts                                 |  24 +-
 src/contracts/command-bodies.ts              | 939 +++------------------------
 src/lib/contracts.ts                         |  40 +-
 src/tests/generation.test.ts                 |  19 +-
 src/tests/phase-contract-equivalence.test.ts |  15 +-
 src/types/contracts.ts                       |   1 +
 6 files changed, 145 insertions(+), 893 deletions(-)
```

Plus the following untracked additions (to be staged on commit):

- `assets/commands/*.md.tmpl` — 16 newly extracted command template source files
- `src/contracts/inserts.ts` — insert registry module
- `src/contracts/template-resolver.ts` — template resolver engine (`resolveTemplate`, `resolveAllTemplates`)
- `src/tests/command-output.test.ts`, `src/tests/inserts.test.ts`, `src/tests/template-resolver.test.ts` — new test files
- `src/tests/__snapshots__/*.md.snap` — baseline snapshots for every command
- `openspec/changes/refactor-command-bodies-into-template-based-authoring-with-explicit-contract-insertion-points/` — proposal, design, specs, tasks, ledgers, current-phase

## Files Touched

Modified:
- src/build.ts
- src/contracts/command-bodies.ts
- src/lib/contracts.ts
- src/tests/generation.test.ts
- src/tests/phase-contract-equivalence.test.ts
- src/types/contracts.ts

Added:
- assets/commands/specflow.md.tmpl
- assets/commands/specflow.apply.md.tmpl
- assets/commands/specflow.approve.md.tmpl
- assets/commands/specflow.dashboard.md.tmpl
- assets/commands/specflow.decompose.md.tmpl
- assets/commands/specflow.design.md.tmpl
- assets/commands/specflow.explore.md.tmpl
- assets/commands/specflow.fix_apply.md.tmpl
- assets/commands/specflow.fix_design.md.tmpl
- assets/commands/specflow.license.md.tmpl
- assets/commands/specflow.readme.md.tmpl
- assets/commands/specflow.reject.md.tmpl
- assets/commands/specflow.review_apply.md.tmpl
- assets/commands/specflow.review_design.md.tmpl
- assets/commands/specflow.setup.md.tmpl
- assets/commands/specflow.spec.md.tmpl
- src/contracts/inserts.ts
- src/contracts/template-resolver.ts
- src/tests/__snapshots__/*.md.snap (16 files)
- src/tests/command-output.test.ts
- src/tests/inserts.test.ts
- src/tests/template-resolver.test.ts

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
| Total rounds       | 1     |

## Proposal Coverage

Mapping the specs' acceptance scenarios to the changes in this PR.

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Every command has a corresponding `.md.tmpl` file | Yes | assets/commands/*.md.tmpl, src/contracts/command-bodies.ts |
| 2 | Template files contain only prose + insertion tags (no TS) | Yes | assets/commands/*.md.tmpl |
| 3 | Three insertion tag kinds supported (insert/contract/render) | Yes | src/contracts/template-resolver.ts, src/contracts/inserts.ts |
| 4 | Insert tag resolves to shared prose via registry | Yes | src/contracts/inserts.ts, src/tests/inserts.test.ts |
| 5 | Contract tag emits raw PhaseContract JSON | Yes | src/contracts/template-resolver.ts, src/tests/template-resolver.test.ts |
| 6 | Render tag emits renderPhaseMarkdown output | Yes | src/contracts/template-resolver.ts, src/tests/template-resolver.test.ts |
| 7 | Template resolution runs at build time only | Yes | src/build.ts (resolveAllTemplates wired between validate and render) |
| 8 | Runtime package does not contain `.md.tmpl` files | Yes | package.json files whitelist excludes assets/ (verified via `npm pack --dry-run`) |
| 9 | Nesting of insertion tags is prohibited | Yes | src/contracts/template-resolver.ts (NESTED_TAG_PATTERN hard error) |
| 10 | Unresolved insert/contract/render refs cause hard error | Yes | src/contracts/template-resolver.ts error paths + tests |
| 11 | Snapshot tests cover every migrated command | Yes | src/tests/command-output.test.ts + 16 snapshots under `__snapshots__/` |
| 12 | Snapshot test detects output divergence | Yes | assertSnapshot() implementation in command-output.test.ts |
| 13 | TS definition declares templatePath and frontmatter | Yes | src/contracts/command-bodies.ts (80 lines, frontmatter + templatePath only) |
| 14 | TS definition retains run hooks | Yes | src/contracts/commands.ts (unchanged — hooks stay TS-side) |
| 15 | Contract validation checks template file existence + empty sections | Yes | src/lib/contracts.ts (validateCommandContracts) + src/types/contracts.ts (templatePath?: string) |

**Coverage Rate**: 15/15 (100%)

## Remaining Risks

**Deterministic risks (from impl ledger)**: none of `{severity ∈ {medium, high}} ∧ {status ∈ {open, new}}` matched.

**Design ledger medium findings (carried over, unresolved)**:

- R1-F01: renderPhaseSection is not used inline — insert registry task 1.5 is misleading (severity: medium)
- R1-F02: Insert key syntax for inline-concatenated prerequisites needs explicit handling (severity: medium)

These describe documentation/wording mismatches between tasks.md and the actual implementation. The implementation behaviour was verified via snapshot tests against the pre-migration baseline — functional equivalence is unaffected. Consider following up in a docs-only fix if you want the task descriptions to align with what was built.

**Impl ledger LOW findings (non-blocking)**:

- R1-F01: parseInsertKey is unused internally (quality)
- R1-F02: Duplicate insert-key parsing logic between inserts.ts and template-resolver.ts (quality)
- R1-F03: splitIntoSections creates null-title sections for preamble — informational, covered by snapshot tests (scope)

**Untested new files**: all added `.ts`/`.md.tmpl` files are referenced by the tests or consumed by the resolver. No orphan files.

**Uncovered criteria**: none.

## Human Checkpoints

- [ ] Open a slash command (e.g., `dist/package/global/commands/specflow.apply.md`) and confirm the resolved output still reads naturally — identical to the pre-migration copy
- [ ] Skim a couple of `assets/commands/*.md.tmpl` files to confirm they are authoring-friendly for future edits (heading + content + insert tag readability)
- [ ] Decide whether to follow up on the two medium design findings (R1-F01 / R1-F02) with a docs-only PR or to leave them as accepted notes on the merged change
- [ ] Confirm npm tarball exclusion is correct: `npm pack --dry-run | grep assets/` should return nothing
- [ ] Consider whether `parseInsertKey` + `resolveInsert` in `src/contracts/inserts.ts` should be removed in a cleanup pass (impl F1/F2)
