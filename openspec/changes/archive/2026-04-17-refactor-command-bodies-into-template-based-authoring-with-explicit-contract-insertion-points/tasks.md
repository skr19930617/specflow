## 1. Insert Registry Module ✓

> Create src/contracts/inserts.ts exporting a ReadonlyMap of insert keys to generator functions wrapping existing helpers

- [x] 1.1 Audit command-bodies.ts to inventory all shared snippet calls (buildOpenspecPrereq, buildDesignArtifactInstruction, renderPhaseSection, etc.) and their call-site arguments
- [x] 1.2 Define the InsertRegistry type as ReadonlyMap<string, (arg?: string) => string> in src/contracts/inserts.ts
- [x] 1.3 Register buildOpenspecPrereq as openspec_prereq(<commandName>) with argument parsing
- [x] 1.4 Extract buildDesignArtifactInstruction from command-bodies.ts, export from inserts.ts as design_artifact_instruction
- [x] 1.5 Register renderPhaseSection entries for render: tags and phaseContractRegistry entries for contract: tags
- [x] 1.6 Register any remaining shared prose fragments identified in the audit (e.g., important_rules.common)
- [x] 1.7 Write unit tests for every registry entry verifying output matches current inline invocations

## 2. Template Resolver Engine ✓

> Implement resolveTemplate() that parses .md.tmpl files and resolves {{insert:}}, {{contract:}}, and {{render:}} tags into CommandSection[]

> Depends on: insert-registry

- [x] 2.1 Define ResolvedSections interface and resolveTemplate() function signature in src/contracts/template-resolver.ts
- [x] 2.2 Implement template file reader that reads .md.tmpl content from disk given a path
- [x] 2.3 Implement regex-based tag parser for {{insert: <key>}}, {{contract: <phase>}}, and {{render: <phase>}} (depth-1 only, no nesting)
- [x] 2.4 Implement tag resolution: insert tags resolve via insertRegistry, contract tags emit JSON from phaseContractRegistry, render tags call renderPhaseMarkdown()
- [x] 2.5 Implement section splitting: parse resolved Markdown into CommandSection[] using heading-based boundaries matching current renderBody() structure
- [x] 2.6 Add hard-error on unresolved tags (missing insert key, unknown phase name, missing template file)
- [x] 2.7 Write unit tests for each tag kind including error cases (unknown key, malformed tag, missing file)

## 3. CommandBody Type Extension + Validation ✓

> Add optional templatePath to CommandBody and extend contract validation to check template file existence

- [x] 3.1 Add readonly templatePath?: string to CommandBody interface in src/types/contracts.ts
- [x] 3.2 Extend validateContracts() in src/lib/contracts.ts to check that templatePath files exist on disk when declared
- [x] 3.3 Add validation that commands with templatePath have empty sections array (sections will be populated by resolver)
- [x] 3.4 Write unit tests for the new validation rules (missing template file, valid template path)

## 4. Capture Pre-Migration Snapshot Baselines ✓

> Capture the full renderCommands() output for every command as snapshot baselines before any migration changes

- [x] 4.1 Create snapshot test file src/tests/command-output.test.ts that renders every command and compares to snapshot
- [x] 4.2 Generate baseline snapshots by running the test suite in update mode
- [x] 4.3 Verify snapshots cover all commands in commandBodies
- [x] 4.4 Commit snapshot baselines as a reference point

## 5. Extract Template Source Files ✓

> Extract prose content from command-bodies.ts into assets/commands/*.md.tmpl files with insertion tags replacing inline function calls

> Depends on: insert-registry, template-resolver, snapshot-baseline

- [x] 5.1 Create assets/commands/ directory
- [x] 5.2 Extract specflow.md.tmpl — replace buildOpenspecPrereq() call with {{insert: openspec_prereq(specflow)}} and renderPhaseSection() calls with {{render: <phase>}} tags
- [x] 5.3 Extract specflow.apply.md.tmpl with appropriate insertion tags
- [x] 5.4 Extract specflow.design.md.tmpl with appropriate insertion tags
- [x] 5.5 Extract remaining command templates (specflow.review_design, specflow.review_apply, specflow.fix_design, specflow.fix_apply, etc.)
- [x] 5.6 Extract specflow.approve, specflow.reject, specflow.explore, specflow.setup templates
- [x] 5.7 Extract utility command templates (specflow.spec, specflow.readme, specflow.license, specflow.dashboard, specflow.decompose)
- [x] 5.8 Verify every command in commandBodies has a corresponding .md.tmpl file

## 6. Build Pipeline Integration ✓

> Wire resolveAllTemplates() into src/build.ts between validateContracts() and renderCommands()

> Depends on: template-resolver, type-extension-and-validation

- [x] 6.1 Implement resolveAllTemplates() that iterates contracts.commands and calls resolveTemplate() for each command with a templatePath
- [x] 6.2 Insert resolveAllTemplates() call in build.ts main() between validateContracts() and renderCommands()
- [x] 6.3 Ensure resolveAllTemplates() produces new CommandContract objects (immutable) with sections populated from templates
- [x] 6.4 Write integration test that runs the full build pipeline and verifies dist/ output matches pre-migration baselines

## 7. Slim Down command-bodies.ts ✓

> Refactor command-bodies.ts to export only frontmatter + templatePath per command, removing all inline string literal sections

> Depends on: template-extraction, build-pipeline-integration

- [x] 7.1 Replace each command entry's sections array with an empty array and add templatePath pointing to assets/commands/<id>.md.tmpl
- [x] 7.2 Remove unused imports (buildOpenspecPrereq, renderPhaseSection, etc.) from command-bodies.ts
- [x] 7.3 Remove buildDesignArtifactInstruction and renderPhaseSection from command-bodies.ts (now live in inserts.ts)
- [x] 7.4 Verify command-bodies.ts is ~100 lines of metadata declarations
- [x] 7.5 Run full build and verify dist/ output is unchanged

## 8. Snapshot Verification + Package Exclusion ✓

> Verify all snapshot tests pass post-migration and update package configuration to exclude template source files

> Depends on: command-bodies-refactor

- [x] 8.1 Run snapshot tests and verify all commands produce identical output to pre-migration baselines
- [x] 8.2 Update .npmignore or package.json files field to exclude assets/commands/ from the published package
- [x] 8.3 Run npm run build and verify dist/ output is complete and correct
- [x] 8.4 Run full test suite and verify 80%+ coverage for new modules (inserts.ts, template-resolver.ts)
- [x] 8.5 Verify no inline content strings remain in command-bodies.ts
