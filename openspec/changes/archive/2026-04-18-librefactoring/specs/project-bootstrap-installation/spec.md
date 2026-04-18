## REMOVED Requirements

### Requirement: `setup` rerun performs deterministic diff-and-resolve on existing profile

**Reason**: The implementation modules backing this requirement (`src/lib/profile-diff.ts` and `src/lib/ecosystem-detector.ts`) have never been wired into a shipped `setup` CLI and are being deleted as part of the `librefactoring` cleanup. The rerun-diff behaviour is not available today and is not scheduled — retaining the requirement on paper only makes the spec diverge from the shipped code.

**Migration**: None needed. No `setup` CLI exists, so no user relies on rerun-diff behaviour. A future change that reintroduces `setup` rerun semantics MUST reopen this requirement with a fresh design and implementation.
