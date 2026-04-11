## ADDED Requirements

### Requirement: Core dependency boundary section exists in docs/architecture.md
The `docs/architecture.md` SHALL contain a "Core Dependency Boundary" section below the existing "Repository Scope" section that defines the internal module classification and dependency rules for workflow core.

#### Scenario: Core Dependency Boundary section is present
- **WHEN** a contributor reads `docs/architecture.md`
- **THEN** a "Core Dependency Boundary" section exists containing subsections for module classification, allowed dependencies, forbidden dependencies, boundary status model, and adapter contract categories

### Requirement: Authoritative module inventory classifies every src/lib module
The "Core Dependency Boundary" section SHALL contain an authoritative inventory that classifies every module in `src/lib/` as exactly one of core, adapter, or mixed.

#### Scenario: Module inventory is exhaustive
- **WHEN** a contributor checks the module inventory
- **THEN** every file in `src/lib/` is listed and classified as core, adapter, or mixed
- **THEN** a default classification rule states that unlisted new modules default to adapter

### Requirement: Core allowed dependencies are exhaustively enumerated
The section SHALL define an exhaustive allowlist for core module dependencies distinguishing ECMAScript globals from Node.js built-ins.

#### Scenario: Core dependency allowlist is complete
- **WHEN** a contributor checks the allowed dependencies
- **THEN** the list includes other core modules, core-adjacent modules (`src/types/contracts.ts`), ECMAScript globals, and a complete third-party allowlist (currently only `xstate`)
- **THEN** Node.js built-in modules are explicitly forbidden

### Requirement: Core forbidden dependencies are explicitly listed
The section SHALL enumerate all categories of forbidden dependencies for core modules.

#### Scenario: Forbidden dependencies cover all adapter concerns
- **WHEN** a contributor checks the forbidden dependencies
- **THEN** the list includes all Node.js built-in modules, `src/bin/*` entry-points, adapter and mixed modules, slash command surface, and DB vendor specifics

### Requirement: Known boundary violations are tracked
The section SHALL contain a "Known Boundary Violations" table documenting mixed modules with their violation description and tracking reference.

#### Scenario: Violation table uses defined tracking format
- **WHEN** a contributor checks the violations table
- **THEN** each entry has module name, violation description, and tracking reference in `<repo>#<issue>` or `TBD` format

### Requirement: Mixed-module interim rules are defined
The section SHALL define interim usage rules for mixed modules.

#### Scenario: Mixed-module rules prevent new coupling
- **WHEN** a contributor writes new core code
- **THEN** the rules state that core modules must not import mixed modules
- **THEN** mixed modules are treated as adapter-side code for boundary enforcement

### Requirement: Adapter contract categories are classified by requirement level
The section SHALL list adapter contract categories with their requirement level (deferred-required vs. local-runtime-only).

#### Scenario: Categories distinguish required from local-only
- **WHEN** a contributor checks the adapter categories
- **THEN** persistence and review transport are classified as deferred-required
- **THEN** process lifecycle, path resolution, directory layout, and CLI surface are classified as local-runtime-only

### Requirement: Classification vs support status distinction is documented
The section SHALL explicitly state that core module classification is an internal architectural boundary and not an external API guarantee.

#### Scenario: External runtimes directed to contract surfaces
- **WHEN** an external runtime author reads the section
- **THEN** the documentation states that external runtimes should depend on documented contract surfaces (rendered artifacts) not internal module APIs

### Requirement: Inventory maintenance rule is defined
The section SHALL define a rule requiring the module inventory to be updated when `src/lib/` modules are added, removed, or renamed.

#### Scenario: Maintenance rule is actionable
- **WHEN** a contributor adds a new module to `src/lib/`
- **THEN** the inventory maintenance rule requires updating the inventory in the same PR
