## Why

The design-side control flow (`specflow.design`, `specflow.review_design`, `specflow.fix_design`) currently embeds deterministic logic — artifact dependency loops, ledger read/write/match cycles, re-review classification, and next-state derivation — directly inside slash command markdown that an LLM interprets at runtime. This mirrors the problem that was already solved on the apply-side by extracting `bin/specflow-review-apply`. Moving the design-side logic into a Bash orchestrator (`bin/specflow-review-design`) produces deterministic, testable, and faster execution while reducing LLM token cost and eliminating prompt-interpretation variability.

## What Changes

- **New `bin/specflow-review-design` Bash orchestrator** with three subcommands:
  - `review <CHANGE_ID>` — initial design review pipeline (read artifact files → codex invocation → ledger init/update → score → current-phase.md → result JSON). No diff filtering — artifact files (design.md, tasks.md, spec.md) are passed directly to Codex.
  - `fix-review <CHANGE_ID> [--autofix]` — re-review pipeline only (codex re-review → ledger update → score). The "fix" step (modifying artifacts) remains in the slash command (LLM). Bash handles re-review + ledger update only.
  - `autofix-loop <CHANGE_ID> [--max-rounds N]` — auto-fix loop with baseline snapshot, divergence warnings, and stop conditions
- **New `bin/specflow-design-artifacts` Bash orchestrator** for the artifact dependency loop (loop control + metadata only):
  - `generate <CHANGE_ID>` — loops `openspec status` → identify ready artifacts → `openspec instructions` → outputs JSON metadata (template, instructions, outputPath) to stdout per artifact. Content generation (writing design.md, tasks.md, spec.md) remains the LLM's responsibility in the slash command.
  - `validate <CHANGE_ID>` — structural validation wrapper
- **Parameterize `lib/specflow-ledger.sh`** via `ledger_init` function: callers invoke `ledger_init "review-ledger-design.json"` to set the filename; if `ledger_init` is not called, the default `review-ledger.json` is used (backward-compatible with apply-side)
- **Result JSON schema** matches the apply-side (`{status, action, review, ledger, autofix, handoff}`) for unified slash command parsing
- **Slash commands become thin wrappers**: `specflow.design`, `specflow.review_design`, and `specflow.fix_design` delegate deterministic control flow to the orchestrator scripts and retain only user-facing prompts, AskUserQuestion handoffs, and artifact content generation

## Capabilities

### New Capabilities
- `design-orchestrator`: Bash orchestrator for design-side review/fix/autofix-loop lifecycle, including design ledger management, re-review classification, score aggregation, current-phase.md generation, and next-state derivation
- `design-artifact-loop`: Bash orchestrator for the artifact dependency loop that drives `openspec status` → `openspec instructions` → file creation cycles

### Modified Capabilities
- `apply-orchestrator`: Parameterize ledger filename constants in `lib/specflow-ledger.sh` so both apply-side (`review-ledger.json`) and design-side (`review-ledger-design.json`) can share the same library functions

## Impact

- **Scripts**: New `bin/specflow-review-design`, new `bin/specflow-design-artifacts`; modified `lib/specflow-ledger.sh` (parameterized filenames with backward-compatible defaults)
- **Slash commands**: `global/commands/specflow.design.md`, `global/commands/specflow.review_design.md`, `global/commands/specflow.fix_design.md` will be simplified to thin wrappers
- **Dependencies**: Requires `jq`, `openspec` CLI, `codex` CLI (same as apply-side)
- **Backward compatibility**: No change to user-facing command interface; all existing specflow slash commands continue to work identically
