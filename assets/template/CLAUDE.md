## Contract Discipline

- Prefer explicit, enforceable contracts over implicit behavior.
- Strengthen contracts instead of relying on hidden assumptions or hardcoded logic.
- Avoid hardcoding behavior that should be defined by contracts, schemas, configuration, or shared generators.
- Do not add special-case behavior unless it is explicitly part of the contract.
- If a contract changes, update the corresponding tests in the same change.
- Contract validation is required, not optional.