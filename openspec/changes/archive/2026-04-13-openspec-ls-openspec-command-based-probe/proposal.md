## Why

Slash command bodies currently verify OpenSpec initialization by running
`ls openspec/`. This only proves that a directory exists — it does not
confirm that the workspace is actually interpretable by OpenSpec or that
the next specflow step can proceed. The check is also duplicated across
11 command bodies with inconsistent failure UX, and couples each command
to an implementation detail (directory layout) rather than to workspace
readiness.

On top of the probe itself being wrong, the failure copy across those
commands is inconsistent: some tell the user to create `openspec/config.yaml`
by hand, others tell them to run `specflow-init`, and `specflow.decompose`
even documents both inside a single Prerequisites block. The `config.yaml`
hand-creation path is explicitly not the supported onboarding flow
(see #63, #121) and should not appear in any guidance.

Replacing the probe with a single command-based readiness check and
normalizing the failure copy at the same time keeps the change atomic:
both changes touch the same Prerequisites sections, and splitting them
would force the second pass to re-edit every command body just edited.

- Source provider: github
- Source reference: https://github.com/skr19930617/specflow/issues/120
- Related issue (merged into scope): https://github.com/skr19930617/specflow/issues/121

## What Changes

- **Probe invocation** (C1): Replace `ls openspec/` with
  `openspec list --json > /dev/null 2>&1` in every Prerequisites block.
  Success = exit 0; failure = non-zero exit. The command body SHALL NOT
  parse the JSON output; only the exit code is consulted. stdout and
  stderr are suppressed on success to keep the slash-command surface
  quiet.
- **Timeout** (C5): The probe SHALL NOT wrap the invocation in a
  `timeout` utility or otherwise impose a wall-clock limit. `openspec
  list --json` reads local workspace files only; hang risk is low and
  introducing a `timeout(1)` dependency is not justified.
- **Failure-mode disambiguation** (C2): The Prerequisites block SHALL
  distinguish two failure modes:
  - **Exit 127** (command not found) → message: `"❌ openspec CLI が
    見つかりません。"` → remediation: `specflow-install` を実行。
  - **Any other non-zero exit** (workspace uninitialized or probe
    failure) → message: `"❌ OpenSpec が初期化されていません。"` →
    remediation: `specflow-init` を実行。
  Both paths end with "その後 `<current slash command>` を再実行してください。"
  and `**STOP**`.
- **Localization** (C3): The normalized header and remediation copy
  SHALL remain Japanese-only, matching the existing command body
  language. Bilingual / English-only variants are out of scope.
- **Command scope** (C4): Every Prerequisites block in
  `src/contracts/command-bodies.ts` that currently documents
  `ls openspec/` or `openspec/config.yaml` hand-creation is in scope.
  `command-bodies.ts` currently contains 11 such blocks, all in
  `specflow.*` command bodies (no `opsx:*` commands live in this file);
  all 11 SHALL be migrated to the new probe + normalized copy in a
  single pass.
- **`specflow.decompose` duplication** (from #121): Resolve the
  duplicated Prerequisites block that currently documents both
  `openspec/config.yaml` creation and `specflow-init` as remediation.
- **BREAKING guidance removal**: No slash command SHALL continue to
  advise the user to hand-create `openspec/config.yaml`. The new probe
  does not depend on `openspec/config.yaml` existing.
- **Out of scope**:
  - Introducing new OpenSpec CLI subcommands.
  - Non-`specflow.*` command families (`opsx:*` etc.) are out of scope
    for this change; they do not currently appear in
    `command-bodies.ts`.
  - A timeout-capable probe helper is out of scope (see C5 above).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `slash-command-guides`: The prerequisite section of each generated
  slash-command guide changes from a `ls openspec/` probe to a single
  OpenSpec command-based readiness probe
  (`openspec list --json > /dev/null 2>&1`), and the failure copy is
  normalized into two distinct remediation paths (missing CLI →
  `specflow-install`; uninitialized workspace → `specflow-init`).
  Generated markdown SHALL NOT contain `ls openspec/` as an
  initialization check and SHALL NOT instruct the user to hand-create
  `openspec/config.yaml`. The shared probe invocation and both
  normalized failure branches SHALL appear consistently across every
  affected command.

## Impact

- Affected code:
  - `src/contracts/command-bodies.ts`: every Prerequisites section that
    currently documents `ls openspec/` or `openspec/config.yaml`
    creation (specflow, specflow.apply, specflow.dashboard,
    specflow.decompose, specflow.design, specflow.explore,
    specflow.fix_apply, specflow.fix_design, specflow.review_apply,
    specflow.review_design, specflow.spec).
  - Any shared helper or constant introduced to encode the probe line
    and the two normalized failure branches.
  - Regenerated `global/commands/*.md` outputs derived from the
    contracts.
  - `bin/specflow-prepare-change`: file mode normalized from `0644` to
    `0755` to match every other script in `bin/` (all of which are
    already executable). This is a hygiene fix bundled with this change
    because the script was discovered to be non-executable while
    validating the probe-flow end-to-end; the mode bit has no
    behavioral relationship to the probe migration itself.
- Affected specs: `openspec/specs/slash-command-guides/spec.md` gains
  requirements that the prerequisite check is the unified probe, that
  exit 127 and other non-zero exits map to distinct failure copies, and
  that the failure copy does not reference `openspec/config.yaml`.
- Tests under `src/tests/` covering generated command markdown must be
  updated to assert:
  - the new probe text appears in every affected command body,
  - both failure branches (missing CLI / uninitialized) appear with
    their distinct remediations,
  - neither `ls openspec/` nor `openspec/config.yaml` hand-creation
    guidance remains.
- No runtime change for end users beyond:
  - a more accurate readiness check (workspace verifiably usable, not
    just "directory exists"),
  - a consistent, two-branch remediation flow, and
  - a slight cold-start latency cost of invoking `openspec list --json`
    (single local process, no network) instead of `ls`.
