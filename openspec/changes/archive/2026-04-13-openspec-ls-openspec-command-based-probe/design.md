## Context

`src/contracts/command-bodies.ts` registers the body of every generated
`global/commands/specflow.*.md` guide as a string-literal section array.
Eleven of those command bodies currently open with a Prerequisites
section whose first instruction is:

> Run `ls openspec/` via Bash to confirm OpenSpec is initialized.

The failure copy that follows is inconsistent: some variants tell the
user to hand-create `openspec/config.yaml`, others tell them to run
`specflow-init`, and `specflow.decompose` embeds both inside the same
Prerequisites block. The hand-created `config.yaml` path is already
known to contradict the supported installation flow (#63, #121).

Two related issues — #120 (command-based probe) and #121 (failure copy
normalization) — touch identical string ranges in the same file. They
are unified into this change because splitting them would force the
second pass to re-edit every block the first pass just edited.

The proposal (`openspec/changes/openspec-ls-openspec-command-based-probe/proposal.md`)
and the spec delta
(`openspec/changes/openspec-ls-openspec-command-based-probe/specs/slash-command-guides/spec.md`)
already settle the probe invocation, localization policy, and
failure-mode disambiguation.

## Goals / Non-Goals

**Goals:**

- Replace every `ls openspec/` probe in `command-bodies.ts` with a
  single `openspec list --json > /dev/null 2>&1` invocation.
- Emit two distinct Japanese failure branches (exit 127 → missing CLI;
  other non-zero → uninitialized) in every affected Prerequisites block.
- Remove every instruction to hand-create `openspec/config.yaml`.
- Collapse `specflow.decompose`'s duplicated Prerequisites block into a
  single canonical block.
- Land the probe string, the two failure branches, and the
  decompose-dedupe in one atomic change so no intermediate state ships
  the mix of old/new copies.
- Keep the 11-command scope auditable via a test that scans all
  generated `global/commands/specflow.*.md` files.

**Non-Goals:**

- No new OpenSpec CLI subcommands are introduced. The existing
  `openspec list --json` is assumed to be stable in the pinned
  OpenSpec version.
- No English / bilingual copy. Existing Japanese copy conventions
  are preserved.
- No `timeout(1)` wrapper. Hang risk on local workspace I/O is
  judged not worth the coreutils dependency.
- No migration for `opsx:*` or other non-`specflow.*` command
  families. They do not currently appear in `command-bodies.ts`.
- No behavior change in `specflow-init` / `specflow-install`. Both
  CLIs already exist; only the way the guides reference them changes.

## Decisions

### D1. Centralize the Prerequisites block in a shared helper

Build a single function `buildOpenspecPrereq(commandName: string): string`
in a new file `src/contracts/prerequisites.ts`. Each command body
imports it and inlines the result into its Prerequisites section.

**Why over per-body string literals:**

- Guarantees byte-for-byte identical probe + failure copy across all
  11 bodies — the spec requirement is now enforced at the type system
  level, not by careful copy-paste.
- Future probe / copy changes are one-file edits.
- The only per-command variance (the command name in the "再実行してください"
  line) is an explicit parameter — no other drift is possible.

**Why not a Markdown include / template string:**

- Command bodies are already raw TypeScript string literals; a helper
  returning a string is the minimum delta.
- A template engine is overkill for one parameter.

### D2. Probe invocation: `openspec list --json > /dev/null 2>&1`

- `> /dev/null 2>&1` keeps the slash command output clean on success.
- Only exit code is inspected; no JSON parsing in the guide (see spec
  requirement "No slash command parses probe stdout").
- Chosen over `openspec status --json` because `list` has no side
  effects and a smaller output surface (C1 answer).

**Alternatives considered:**

| Option | Rejected because |
|---|---|
| `openspec status --json` | Larger output, heavier than needed |
| `openspec validate --strict` | Runs full validation; too slow for a gate |
| New `openspec probe` CLI | Out of scope; owned by upstream project |

### D3. Two failure branches driven by exit code

Shell snippet embedded in the Prerequisites block:

```bash
openspec list --json > /dev/null 2>&1
STATUS=$?
if [ $STATUS -eq 127 ]; then
  echo "❌ openspec CLI が見つかりません。"
  echo "次のステップで解消してください:"
  echo "1. specflow-install を実行"
  echo "2. /<command-name> を再実行してください"
  # → STOP
elif [ $STATUS -ne 0 ]; then
  echo "❌ OpenSpec が初期化されていません。"
  echo "次のステップで解消してください:"
  echo "1. specflow-init を実行"
  echo "2. /<command-name> を再実行してください"
  # → STOP
fi
```

The generated markdown documents this snippet verbatim. No logic is
hidden from the user.

**Why exit-127 specifically:**

- POSIX shell convention: exit 127 = "command not found".
- `which` / `command -v` would also work but add a second process and
  need a separate guard for coreutils. Relying on the shell's own
  lookup is idiomatic.

### D4. Scope of the migration is every `ls openspec/` hit in `command-bodies.ts`

Today there are exactly 11 occurrences (verified via `grep -c "ls openspec/"`).
Each is replaced by a call to `buildOpenspecPrereq(<current-command-name>)`.

The `specflow.decompose` duplicate Prerequisites block is removed in
the same edit — it collapses to the single helper call like every
other command.

**Auditability:** a new test in `src/tests/generation.test.ts` (or a
companion file) SHALL assert, over the full set of rendered
`global/commands/specflow.*.md` outputs, that:

1. every file with a Prerequisites section contains exactly one
   occurrence of `openspec list --json > /dev/null 2>&1`;
2. no file contains `ls openspec/`;
3. no file contains `openspec/config.yaml を作成`;
4. every file contains both failure-branch headers.

This freezes the requirement in the test suite; any regression
(a command body reverting to `ls` or adding the `config.yaml` path)
fails CI immediately.

### D5. Keep command-bodies.ts as the single source of truth

`global/commands/*.md` is generated from `command-bodies.ts` via the
existing build step (`npm run build`). We do not hand-edit the
generated markdown. All changes happen upstream and regenerate.

## Risks / Trade-offs

- **[Probe latency]** Replacing `ls` (millisecond-level) with
  `openspec list --json` adds one process spawn per slash command
  invocation. → Mitigation: `openspec list --json` reads local files
  only; measured latency is well under 100 ms on a warm FS. Accept as
  cost of the correctness win.
- **[`openspec list --json` contract drift]** If upstream OpenSpec
  changes `list --json` output shape or deprecates the flag, the
  probe still works as long as exit code semantics hold. → Mitigation:
  we rely solely on exit code, not on output shape.
- **[Shell snippet portability]** Using `$?` and `if [ $STATUS ... ]`
  targets POSIX `sh`/`bash`. → Mitigation: all current slash-command
  bodies already assume bash via the harness; no new assumption.
- **[Helper bloat]** Adding `prerequisites.ts` introduces a new file.
  → Mitigation: the file is ~30 lines and has exactly one exported
  function; complexity is lower than duplicating the block 11 times.
- **[Test-scope creep]** A generation-wide scan test reads every
  rendered command markdown. → Mitigation: test runs in <1 s and uses
  the same `dist/build.js` output path the existing suite already
  consumes.

## Migration Plan

This is a pure code-gen / documentation change with no persisted state
and no runtime behavior change beyond the probe itself.

Steps:

1. Land `src/contracts/prerequisites.ts` with the helper.
2. Update `src/contracts/command-bodies.ts` to call the helper in all
   11 Prerequisites blocks and remove duplication in
   `specflow.decompose`.
3. Update `src/tests/generation.test.ts` (or add a new test file) with
   the audit assertions from D4.
4. `npm run build` regenerates `global/commands/*.md`; the regenerated
   files are committed alongside the source edits so downstream
   consumers see a consistent snapshot.
5. Run `npm test` + `npm run typecheck` + `npm run lint`.

**Rollback:** pure code-gen change with no migrations. A single revert
of the implementation commit restores previous behavior.

## Open Questions

None remaining after proposal clarify + challenge rounds. C1–C5 are
all resolved in the proposal and spec delta.
