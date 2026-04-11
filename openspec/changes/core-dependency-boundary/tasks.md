## 1. Core Dependency Boundary Section

- [x] 1.1 Add "Core Dependency Boundary" heading after the existing "Workflow Core Contract Surface" subsection in `docs/architecture.md`
- [x] 1.2 Add the authoritative module inventory table classifying every `src/lib/` module as core, adapter, or mixed
- [x] 1.3 Add the "Core Allowed Dependencies" subsection with the exhaustive allowlist, explicitly stating that `src/types/contracts.ts` is the only core-adjacent local module and that both value and type imports from it are allowed
- [x] 1.4 Add an explicit rule that type-only imports follow the same source restrictions as value imports, including that type-only imports from adapter modules, `src/bin/*`, `src/contracts/*`, or DB-specific packages remain forbidden
- [x] 1.5 Add an explicit note in the allowlist guidance that `src/contracts/*` is not core-adjacent and remains outside the core boundary allowlist
- [x] 1.6 Add the "Core Forbidden Dependencies" subsection (all Node.js built-ins, `src/bin/*`, adapter/mixed modules, slash command surface, DB vendor specifics)
- [x] 1.7 Add the "Boundary Status Model" subsection describing the target state versus current mixed-module known violations and clarifying that existing violations are tracked rather than treated as present-day errors
- [x] 1.8 Add an explicit statement in the status model that new boundary violations must not be introduced
- [x] 1.9 Add the "Known Boundary Violations" table with module, violation description, and tracking reference columns for `review-ledger.ts`, `review-runtime.ts`, `contracts.ts`, `proposal-source.ts`
- [x] 1.10 Add explicit table guidance that every tracking reference must use the exact `<repo>#<issue-number>` or `TBD — to be filed before next release` format
- [x] 1.11 Add the "Mixed-Module Interim Rules" subsection defining the four interim rules
- [x] 1.12 Add the "Default Classification Rule" and "Inventory Maintenance Rule" subsections
- [x] 1.13 Add the "Dependency Decision Heuristic" subsection with concrete borderline examples
- [x] 1.14 Add an explicit sentence tying heuristic-based dependency placement back to the "Repository Scope" ownership model
- [x] 1.15 Add the "Classification vs. Support Status" statement

## 2. Adapter Contract Categories

- [x] 2.1 Add the "Adapter Contract Categories" subsection with deferred-required (persistence, review transport) and local-runtime-only (process lifecycle, path resolution, directory layout, CLI surface) categories
- [x] 2.2 Add explicit caveat for persistence: `RunState` in `src/types/contracts.ts` mixes core-contract fields (`phase`, `history`, `agents`, `status`) with local-adapter fields (`repo_path`, `worktree_path`, `last_summary_path`); field-level split deferred to follow-up proposal; external runtimes cannot reliably determine which fields to persist
- [x] 2.3 Add explicit caveat for review transport: current subprocess-based codex invocation is a local-adapter implementation detail; canonical request/response payload schema and lifecycle protocol deferred to follow-up proposal; external runtimes must not depend on current mechanism
- [x] 2.4 Add note that formal TypeScript adapter interfaces and automated enforcement are deferred to follow-up proposals
- [x] 2.5 Add the "Local Adapter Responsibility" description enumerating concrete owned concerns: Git/FS access (`git.ts`, `fs.ts`, `paths.ts`), OpenSpec directory traversal, CLI argument parsing (`src/bin/*`), process orchestration (`process.ts`), file-based run-state persistence
- [x] 2.6 Add the "External Runtime Adapter Responsibility" description: external runtimes own their own storage, transport, and CLI surface; they conform to core contracts only; currently only state machine schema is supported for external runtimes

## 3. Existing Section Amendments

- [x] 3.1 Add "External Runtime Support" column to the existing "Workflow Core Contract Surface" table with support status annotations per surface
- [x] 3.2 Add a clarifying note to the "Repository Scope" section distinguishing target-state ownership from currently supported external-runtime scope
- [x] 3.3 Add an explicit cross-reference from the relevant "Repository Scope" guidance to the new dependency decision heuristic so the Repository Scope section also points readers back to the boundary definitions
