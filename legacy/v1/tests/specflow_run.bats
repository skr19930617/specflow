#!/usr/bin/env bats
# Tests for specflow-run get-field

load test_helper

# specflow-run requires git repo context and openspec/changes/<run_id>/ directory.
# We create a minimal mock environment in TEST_TEMP_DIR to isolate tests.

setup() {
  TEST_TEMP_DIR="$(mktemp -d)"

  # Create a minimal git repo so specflow-run can resolve PROJECT_ROOT
  git init --quiet "${TEST_TEMP_DIR}/repo"
  mkdir -p "${TEST_TEMP_DIR}/repo/openspec/changes/test-run"
  touch "${TEST_TEMP_DIR}/repo/openspec/changes/test-run/proposal.md"

  # Create a state machine file
  mkdir -p "${TEST_TEMP_DIR}/repo/global/workflow"
  cat > "${TEST_TEMP_DIR}/repo/global/workflow/state-machine.json" <<'SM'
{
  "version": "2.0",
  "transitions": [
    {"from":"start","event":"propose","to":"proposal"},
    {"from":"proposal","event":"accept_proposal","to":"design"}
  ]
}
SM

  # Create a run state file
  mkdir -p "${TEST_TEMP_DIR}/repo/.specflow/runs/test-run"
  cat > "${TEST_TEMP_DIR}/repo/.specflow/runs/test-run/run.json" <<'RUN'
{
  "run_id": "test-run",
  "change_name": "test-run",
  "current_phase": "start",
  "status": "active",
  "allowed_events": ["propose"],
  "issue": null,
  "project_id": "test/repo",
  "repo_name": "test/repo",
  "repo_path": "/tmp/test",
  "branch_name": "main",
  "worktree_path": "/tmp/test",
  "agents": {"main":"claude","review":"codex"},
  "last_summary_path": null,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z",
  "history": []
}
RUN

  # Set git remote so detect_project_id works
  cd "${TEST_TEMP_DIR}/repo"
  git remote add origin "https://github.com/test/repo.git" 2>/dev/null || true
}

teardown() {
  if [[ -n "${TEST_TEMP_DIR:-}" && -d "$TEST_TEMP_DIR" ]]; then
    rm -rf "$TEST_TEMP_DIR"
  fi
}

@test "get-field returns field value" {
  cd "${TEST_TEMP_DIR}/repo"

  run "${BIN_DIR}/specflow-run" get-field test-run current_phase

  [ "$status" -eq 0 ]
  [[ "$output" == *"start"* ]]
}

@test "get-field errors on nonexistent field" {
  cd "${TEST_TEMP_DIR}/repo"

  run "${BIN_DIR}/specflow-run" get-field test-run nonexistent_field_xyz

  [ "$status" -ne 0 ]
}

@test "get-field errors on missing run" {
  cd "${TEST_TEMP_DIR}/repo"

  # Create the openspec change dir for the nonexistent run to pass validate_run_id
  mkdir -p "${TEST_TEMP_DIR}/repo/openspec/changes/no-such-run"

  run "${BIN_DIR}/specflow-run" get-field no-such-run current_phase

  [ "$status" -ne 0 ]
  [[ "$output" == *"not found"* ]]
}
