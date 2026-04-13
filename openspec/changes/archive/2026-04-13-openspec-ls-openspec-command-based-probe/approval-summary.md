# Approval Summary: openspec-ls-openspec-command-based-probe

**Generated**: 2026-04-13 12:50
**Branch**: openspec-ls-openspec-command-based-probe
**Status**: ✅ No unresolved high

## 2a. What Changed

```
 bin/specflow-prepare-change                                                                |   0
 openspec/changes/openspec-ls-openspec-command-based-probe/.openspec.yaml                   |   2 +
 openspec/changes/openspec-ls-openspec-command-based-probe/current-phase.md                 |  12 ++
 openspec/changes/openspec-ls-openspec-command-based-probe/design.md                        | 204 +++++++++++++++++++++
 openspec/changes/openspec-ls-openspec-command-based-probe/proposal.md                      | 126 +++++++++++++
 openspec/changes/openspec-ls-openspec-command-based-probe/review-ledger-design.json        |  19 ++
 openspec/changes/openspec-ls-openspec-command-based-probe/review-ledger.json               |  61 ++++++
 openspec/changes/openspec-ls-openspec-command-based-probe/review-ledger.json.bak           |  50 +++++
 openspec/changes/openspec-ls-openspec-command-based-probe/specs/slash-command-guides/spec.md |  89 +++++++++
 openspec/changes/openspec-ls-openspec-command-based-probe/tasks.md                         |  64 +++++++
 src/contracts/command-bodies.ts                                                            |  34 ++--
 src/contracts/prerequisites.ts                                                             |  39 ++++
 src/tests/command-prereq-audit.test.ts                                                     | 122 ++++++++++++
 src/tests/prerequisites.test.ts                                                            |  78 ++++++++
 14 files changed, 878 insertions(+), 22 deletions(-)
```

## 2b. Files Touched

- bin/specflow-prepare-change (mode change only: 0644 → 0755)
- src/contracts/command-bodies.ts (migrated 11 Prerequisites blocks)
- src/contracts/prerequisites.ts (new shared helper)
- src/tests/command-prereq-audit.test.ts (new generation-wide audit test)
- src/tests/prerequisites.test.ts (new helper unit test)
- openspec/changes/openspec-ls-openspec-command-based-probe/* (proposal, design, tasks, specs, ledgers)

## 2c. Review Loop Summary

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

Impl review raised 2 LOW findings in Round 1 (F1: chmod scope, F2: audit test depends on dist/); both were resolved by auto-fix in Round 2.

## 2d. Proposal Coverage

Spec scenarios from `specs/slash-command-guides/spec.md`:

| # | Criterion (summary) | Covered? | Mapped Files |
|---|---------------------|----------|--------------|
| 1 | Every generated guide with a Prerequisites section renders `openspec list --json > /dev/null 2>&1` and none contain `ls openspec/` | Yes | src/contracts/prerequisites.ts, src/contracts/command-bodies.ts, src/tests/command-prereq-audit.test.ts |
| 2 | No slash command parses probe stdout (exit-code-only branching) | Yes | src/contracts/prerequisites.ts (exit-code-only), src/tests/prerequisites.test.ts |
| 3 | Missing-CLI branch shows `❌ openspec CLI が見つかりません。` + `specflow-install` | Yes | src/contracts/prerequisites.ts, src/tests/prerequisites.test.ts, src/tests/command-prereq-audit.test.ts |
| 4 | Uninitialized branch shows `❌ OpenSpec が初期化されていません。` + `specflow-init` | Yes | src/contracts/prerequisites.ts, src/tests/prerequisites.test.ts, src/tests/command-prereq-audit.test.ts |
| 5 | No guide advises hand-creating `openspec/config.yaml` | Yes | src/contracts/prerequisites.ts, src/tests/command-prereq-audit.test.ts |
| 6 | Probe is not wrapped in `timeout(1)` | Yes | src/contracts/prerequisites.ts (direct invocation, no timeout wrapper) |
| 7 | `specflow.decompose` has exactly one Prerequisites block and one probe | Yes | src/contracts/command-bodies.ts (duplicate removed), src/tests/command-prereq-audit.test.ts |

**Coverage Rate**: 7/7 (100%)

## 2e. Remaining Risks

1. **Deterministic risks** (from ledger): None. Both findings resolved.
2. **Untested new files**: None. All new `.md` files under `openspec/changes/` are auto-generated artifacts (proposal, design, tasks, specs, ledgers) that are not user-facing code. The new `.ts` files are all directly tested by `src/tests/prerequisites.test.ts` and `src/tests/command-prereq-audit.test.ts`.
3. **Uncovered criteria**: None. All 7 spec scenarios are covered by tests.

## 2f. Human Checkpoints

- [ ] Confirm the shared helper in `src/contracts/prerequisites.ts` produces the exact failure copy wording you want users to see (both Japanese error headers, both remediation commands, the `/<cmd>` を再実行してください line) — copy is hard to change later without touching 11 command bodies again.
- [ ] Verify `openspec list --json` is stable in the OpenSpec CLI version this repo currently installs (`1.2.0`). If a future OpenSpec release removes or renames that flag, every slash command's Prerequisites would fail universally.
- [ ] Decide whether the `bin/specflow-prepare-change` 0644→0755 mode change should be in this PR or split out. It's a hygiene fix unrelated to the probe migration; currently documented in proposal.md's Impact section.
- [ ] Confirm that closing both #120 (probe implementation) and #121 (copy normalization) in a single merge is the intended outcome — the proposal merged them into one scope after the initial clarify round.
