## 1. Rewrite apply Step 1 contract and regenerate dist ✓

> Update command-bodies.ts to mandate specflow-advance-bundle for apply-class mutations and regenerate the dist markdown guides.

- [x] 1.1 Rewrite specflow.apply Step 1 body in src/contracts/command-bodies.ts with three-way detection rule (absent → legacy fallback, present+valid → CLI-mandatory, present+malformed → fail-fast)
- [x] 1.2 Embed literal `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>` invocation instruction covering all four transitions (pending→in_progress, in_progress→done, pending→skipped, pending→done)
- [x] 1.3 Add explicit fail-fast language: on non-zero CLI exit surface JSON envelope, stay in apply_draft, no retry, no skip-and-continue, name recovery paths (regenerate task-graph / manual correction / /specflow.fix_apply)
- [x] 1.4 Add explicit prohibition of inline `node -e` / `jq` / manual edits to task-graph.json and tasks.md within the CLI-mandatory path
- [x] 1.5 Append one safety-net line to specflow.fix_apply → 'Important Rules' pointing fix loop at specflow-advance-bundle for any task-graph/tasks.md mutation
- [x] 1.6 Run the build pipeline (dist/build.js) to regenerate dist/package/global/commands/specflow.apply.md and specflow.fix_apply.md
- [x] 1.7 Verify regenerated dist files reflect all required language and commit them per repo convention

## 2. Add generation regression test for apply guide contract ✓

> Extend src/tests/generation.test.ts to lock in positive and negative assertions against the regenerated dist guides so drift cannot silently regress the contract.

> Depends on: contract-and-docs

- [x] 2.1 Add positive assertions against dist/package/global/commands/specflow.apply.md: contains literal `specflow-advance-bundle <CHANGE_ID> <BUNDLE_ID> <NEW_STATUS>`, fail-fast language, three-way detection rule phrases, and explicit prohibition of `node -e`
- [x] 2.2 Add negative assertions against dist/package/global/commands/specflow.apply.md: no example `node -e` snippet mutating bundle.status or tasks[*].status, no `jq` expression rewriting status in task-graph.json
- [x] 2.3 Add positive assertion against dist/package/global/commands/specflow.fix_apply.md: 'Important Rules' safety-net line mentions specflow-advance-bundle
- [x] 2.4 Run `node --test src/tests/generation.test.ts` and the full test suite; confirm new + existing tests pass
- [x] 2.5 Run `openspec validate tasks --type change --json` and confirm valid:true
