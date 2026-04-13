## 1. Shared Prerequisites helper

- [x] 1.1 Create `src/contracts/prerequisites.ts` exporting
      `buildOpenspecPrereq(commandName: string): string` that returns the
      canonical Prerequisites section body: the `openspec list --json > /dev/null 2>&1`
      probe, the exit-127 → `specflow-install` branch with header
      `❌ openspec CLI が見つかりません。`, and the generic non-zero →
      `specflow-init` branch with header `❌ OpenSpec が初期化されていません。`,
      both ending with "`/<commandName>` を再実行してください" and `**STOP**`.
- [x] 1.2 Add unit test `src/tests/prerequisites.test.ts` that asserts
      the helper output contains the probe string, both failure headers,
      both remediation commands, the interpolated command name, neither
      `ls openspec/` nor `openspec/config.yaml を作成`, and is
      deterministic across calls with the same input.

## 2. Migrate command bodies to the helper

- [x] 2.1 Replace the Prerequisites section in `command-bodies.ts` for
      `specflow` with `buildOpenspecPrereq("specflow")`.
- [x] 2.2 Same for `specflow.apply`.
- [x] 2.3 Same for `specflow.dashboard`.
- [x] 2.4 Same for `specflow.decompose`; also remove the duplicate
      Prerequisites block so only one probe block remains.
- [x] 2.5 Same for `specflow.design`.
- [x] 2.6 Same for `specflow.explore`.
- [x] 2.7 Same for `specflow.fix_apply`.
- [x] 2.8 Same for `specflow.fix_design`.
- [x] 2.9 Same for `specflow.review_apply`.
- [x] 2.10 Same for `specflow.review_design`.
- [x] 2.11 Same for `specflow.spec`.

## 3. Generation-wide audit tests

- [x] 3.1 Added `src/tests/command-prereq-audit.test.ts` that loads every
      rendered `global/commands/specflow*.md` output from `dist/`.
- [x] 3.2 Asserts that every OpenSpec-probing command contains exactly
      one occurrence of `openspec list --json > /dev/null 2>&1`.
- [x] 3.3 Asserts that NO collected file contains `ls openspec/`.
- [x] 3.4 Asserts that NO collected file contains
      `openspec/config.yaml を作成`.
- [x] 3.5 Asserts that every OpenSpec-probing command contains both
      `❌ openspec CLI が見つかりません。` and
      `❌ OpenSpec が初期化されていません。` plus the corresponding
      remediations.
- [x] 3.6 Asserts that `specflow.decompose.md` contains exactly one
      Prerequisites heading and exactly one probe invocation.

## 4. Regenerate and verify

- [x] 4.1 Ran `npm run build` to regenerate `global/commands/*.md`.
- [ ] 4.2 ~~Commit regenerated markdown alongside source changes~~ —
      **N/A**: `dist/` is gitignored, downstream consumers install via
      the published package, not via committed generated files.
- [x] 4.3 Ran `npm test` — 195/195 tests pass (was 183 before, +12 new
      tests across `prerequisites.test.ts` and
      `command-prereq-audit.test.ts`).
- [x] 4.4 Ran `npm run typecheck` — zero errors.
- [x] 4.5 Ran `npm run lint` — 14 warnings total, same count as before,
      none on changed files.

## 5. Cross-reference closure

- [ ] 5.1 Link issues #120 and #121 in the eventual PR description so
      they close on merge. (Deferred to PR creation in `/specflow.approve`.)
