## 1. Workflow Definition

- [x] 1.1 Create `global/workflow/` directory
- [x] 1.2 Create `global/workflow/state-machine.json` with states, events, and transitions arrays as defined in design.md
- [x] 1.3 Validate the JSON is parseable by `jq` and contains all required states/events/transitions

## 2. Run State Infrastructure

- [x] 2.1 Create `.specflow/` directory structure (`.specflow/runs/` will be created on first run)
- [x] 2.2 Add `.specflow/runs/` to `.gitignore`

## 3. specflow-run Command

- [x] 3.1 Create `bin/specflow-run` with subcommand dispatch (start / advance / status) and shared helper functions
- [x] 3.2 Implement `start` subcommand — create run.json with initial state, allowed_events, optional --issue-url flag (use `specflow-fetch-issue` to resolve issue metadata)
- [x] 3.3 Implement `advance` subcommand — load state-machine.json, validate transition, update run.json atomically (mktemp + mv), append history entry
- [x] 3.4 Implement `status` subcommand — read and output run.json
- [x] 3.5 Implement CLI output contract: success → JSON to stdout, failure → human-readable error to stderr with non-zero exit code
- [x] 3.6 Implement error detail: invalid transition lists allowed events for the current state in error message
- [x] 3.7 Make `bin/specflow-run` executable (`chmod +x`)

## 4. Testing

- [x] 4.1 Test full lifecycle: start → propose → accept_proposal → accept_design → accept_apply → approved
- [x] 4.2 Test invalid transition is rejected with correct error message and exit code 1
- [x] 4.3 Test revise self-transition records history entry correctly
- [x] 4.4 Test start with --issue-url populates issue metadata
- [x] 4.5 Test start when run already exists returns error
- [x] 4.6 Test status of nonexistent run returns error
- [x] 4.7 Test advance on nonexistent run returns error with exit code 1
- [x] 4.8 Test start with invalid --issue-url returns error
- [x] 4.9 Verify all success outputs are valid JSON on stdout and all error outputs go to stderr
