#!/usr/bin/env bash
set -uo pipefail

# ── Test runner for specflow-run ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN="${REPO_ROOT}/bin/specflow-run"
RUNS_DIR="${REPO_ROOT}/.specflow/runs"
PASS=0
FAIL=0
STUB_DIR=""

setup_stubs() {
  STUB_DIR="$(mktemp -d)"
  # Create a fake specflow-fetch-issue that returns deterministic JSON
  cat > "${STUB_DIR}/specflow-fetch-issue" <<'STUB'
#!/usr/bin/env bash
# Stub: return fixed issue metadata for valid URLs, error for invalid
URL="$1"
if echo "$URL" | grep -q '/issues/[0-9]'; then
  echo '{"number":71,"title":"Test issue title","body":"test body","url":"https://github.com/skr19930617/specflow/issues/71","labels":[],"assignees":[],"author":{"login":"test"},"state":"OPEN"}'
else
  echo "Invalid GitHub issue URL: $URL" >&2
  exit 1
fi
STUB
  chmod +x "${STUB_DIR}/specflow-fetch-issue"
  export SPECFLOW_FETCH_ISSUE="${STUB_DIR}/specflow-fetch-issue"
}

teardown_stubs() {
  [[ -n "$STUB_DIR" && -d "$STUB_DIR" ]] && rm -rf "$STUB_DIR"
}

cleanup() {
  rm -rf "${RUNS_DIR}/workflow-state-machine"
}

ensure_test_change() {
  # Create a dummy openspec change directory so validate_run_id passes
  mkdir -p "${REPO_ROOT}/openspec/changes/workflow-state-machine"
}

teardown_test_change() {
  rm -rf "${REPO_ROOT}/openspec/changes/workflow-state-machine"
}

setup_stubs
ensure_test_change

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: ${label}"
    ((PASS++))
  else
    echo "  FAIL: ${label} — expected '${expected}', got '${actual}'"
    ((FAIL++))
  fi
}

assert_exit() {
  local label="$1" expected_code="$2"
  shift 2
  local actual_code=0
  "$@" >/dev/null 2>/dev/null || actual_code=$?
  assert_eq "$label" "$expected_code" "$actual_code"
}

assert_json_field() {
  local label="$1" json="$2" field="$3" expected="$4"
  local actual
  actual="$(echo "$json" | jq -r "$field")"
  assert_eq "$label" "$expected" "$actual"
}

assert_stderr_contains() {
  local label="$1" expected="$2"
  shift 2
  local stderr_out
  stderr_out="$("$@" 2>&1 1>/dev/null || true)"
  if echo "$stderr_out" | grep -q "$expected"; then
    echo "  PASS: ${label}"
    ((PASS++))
  else
    echo "  FAIL: ${label} — stderr did not contain '${expected}': ${stderr_out}"
    ((FAIL++))
  fi
}

# ── Tests ──────────────────────────────────────────────────────────────

echo "=== Test 1: Full lifecycle ==="
cleanup
out="$("$BIN" start workflow-state-machine)"
assert_json_field "start phase" "$out" ".current_phase" "start"
assert_json_field "start status" "$out" ".status" "active"
assert_json_field "start has propose" "$out" '.allowed_events | contains(["propose"])' "true"

out="$("$BIN" advance workflow-state-machine propose)"
assert_json_field "propose phase" "$out" ".current_phase" "proposal"

out="$("$BIN" advance workflow-state-machine accept_proposal)"
assert_json_field "accept_proposal phase" "$out" ".current_phase" "design"

out="$("$BIN" advance workflow-state-machine accept_design)"
assert_json_field "accept_design phase" "$out" ".current_phase" "apply"

out="$("$BIN" advance workflow-state-machine accept_apply)"
assert_json_field "accept_apply phase" "$out" ".current_phase" "approved"
assert_json_field "history length" "$out" '.history | length' "4"

echo ""
echo "=== Test 2: Invalid transition ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
assert_exit "invalid transition exits 1" "1" "$BIN" advance workflow-state-machine approve
assert_stderr_contains "invalid transition lists allowed" "Allowed events" "$BIN" advance workflow-state-machine approve

echo ""
echo "=== Test 3: revise_design self-transition ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
"$BIN" advance workflow-state-machine propose >/dev/null
"$BIN" advance workflow-state-machine accept_proposal >/dev/null
out="$("$BIN" advance workflow-state-machine revise_design)"
assert_json_field "revise_design stays in design" "$out" ".current_phase" "design"
assert_json_field "revise_design history from" "$out" '.history[-1].from' "design"
assert_json_field "revise_design history to" "$out" '.history[-1].to' "design"
assert_json_field "revise_design history event" "$out" '.history[-1].event' "revise_design"

echo ""
echo "=== Test 4: Start with --issue-url ==="
cleanup
out="$("$BIN" start workflow-state-machine --issue-url "https://github.com/skr19930617/specflow/issues/71")"
assert_json_field "issue url" "$out" ".issue.url" "https://github.com/skr19930617/specflow/issues/71"
assert_json_field "issue number" "$out" ".issue.number" "71"
assert_json_field "issue repo" "$out" ".issue.repo" "skr19930617/specflow"

echo ""
echo "=== Test 5: Duplicate start ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
assert_exit "duplicate start exits 1" "1" "$BIN" start workflow-state-machine

echo ""
echo "=== Test 6: Status of nonexistent run ==="
assert_exit "nonexistent status exits 1" "1" "$BIN" status nonexistent-xyz-run

echo ""
echo "=== Test 7: Advance on nonexistent run ==="
assert_exit "nonexistent advance exits 1" "1" "$BIN" advance nonexistent-xyz-run propose

echo ""
echo "=== Test 8: Invalid --issue-url ==="
cleanup
assert_exit "bad url exits 1" "1" "$BIN" start workflow-state-machine --issue-url "https://example.com/not-issue"

echo ""
echo "=== Test 9: Stdout/stderr contract ==="
cleanup
stdout_out="$("$BIN" start workflow-state-machine 2>/dev/null)"
echo "$stdout_out" | jq empty 2>/dev/null
assert_eq "success stdout is valid JSON" "0" "$?"
error_stdout="$("$BIN" start workflow-state-machine 2>/dev/null || true)"
# Second start should fail — check stdout is empty for errors
error_stdout_only="$("$BIN" advance nonexistent-xyz-run propose 2>/dev/null || true)"
assert_eq "error stdout is empty" "" "$error_stdout_only"

echo ""
echo "=== Test 10: Path traversal rejection ==="
assert_exit "path traversal rejected" "1" "$BIN" start "../escape"
assert_stderr_contains "traversal error message" "invalid run_id" "$BIN" start "../escape"

echo ""
echo "=== Test 11: Allowed events recomputed ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
out="$("$BIN" advance workflow-state-machine propose)"
assert_json_field "proposal allowed has accept_proposal" "$out" '.allowed_events | contains(["accept_proposal"])' "true"
assert_json_field "proposal allowed has reject" "$out" '.allowed_events | contains(["reject"])' "true"

echo ""
echo "=== Test 12: updated_at refreshes ==="
cleanup
out1="$("$BIN" start workflow-state-machine)"
ts1="$(echo "$out1" | jq -r '.updated_at')"
sleep 1
out2="$("$BIN" advance workflow-state-machine propose)"
ts2="$(echo "$out2" | jq -r '.updated_at')"
if [[ "$ts1" != "$ts2" ]]; then
  echo "  PASS: updated_at changed after advance"
  ((PASS++))
else
  echo "  FAIL: updated_at did not change"
  ((FAIL++))
fi

echo ""
echo "=== Test 13: Explore branch path ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
out="$("$BIN" advance workflow-state-machine explore_start)"
assert_json_field "explore_start phase" "$out" ".current_phase" "explore"
out="$("$BIN" advance workflow-state-machine explore_complete)"
assert_json_field "explore_complete returns to start" "$out" ".current_phase" "start"

echo ""
echo "=== Test 14: Spec bootstrap branch path ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
out="$("$BIN" advance workflow-state-machine spec_bootstrap_start)"
assert_json_field "spec_bootstrap_start phase" "$out" ".current_phase" "spec_bootstrap"
out="$("$BIN" advance workflow-state-machine spec_bootstrap_complete)"
assert_json_field "spec_bootstrap_complete returns to start" "$out" ".current_phase" "start"

echo ""
echo "=== Test 15: Enriched metadata in initial run state ==="
cleanup
expected_repo_path="$(git rev-parse --show-toplevel)"
expected_branch="$(git rev-parse --abbrev-ref HEAD)"
expected_project_id="$(git remote get-url origin | sed -E 's|\.git$||' | sed -E 's|^.*[:/]([^/]+/[^/]+)$|\1|')"
out="$("$BIN" start workflow-state-machine)"
assert_json_field "project_id matches git" "$out" '.project_id' "$expected_project_id"
assert_json_field "repo_name equals project_id" "$out" '(.repo_name == .project_id)' "true"
assert_json_field "repo_path matches git" "$out" '.repo_path' "$expected_repo_path"
assert_json_field "branch_name matches git" "$out" '.branch_name' "$expected_branch"
assert_json_field "worktree_path matches git" "$out" '.worktree_path' "$expected_repo_path"
assert_json_field "has agents.main" "$out" '.agents.main' "claude"
assert_json_field "has agents.review" "$out" '.agents.review' "codex"
assert_json_field "last_summary_path is null" "$out" '.last_summary_path' "null"

echo ""
echo "=== Test 16: Metadata preserved across transitions ==="
cleanup
out1="$("$BIN" start workflow-state-machine)"
pid1="$(echo "$out1" | jq -r '.project_id')"
out2="$("$BIN" advance workflow-state-machine propose)"
pid2="$(echo "$out2" | jq -r '.project_id')"
assert_eq "project_id preserved" "$pid1" "$pid2"
assert_json_field "agents preserved" "$out2" '.agents.main' "claude"
assert_json_field "repo_path preserved" "$out2" ".repo_path" "$(echo "$out1" | jq -r '.repo_path')"

echo ""
echo "=== Test 17: --agent-main / --agent-review flags ==="
cleanup
out="$("$BIN" start workflow-state-machine --agent-main custom-agent --agent-review custom-rev)"
assert_json_field "custom agent main" "$out" '.agents.main' "custom-agent"
assert_json_field "custom agent review" "$out" '.agents.review' "custom-rev"

echo ""
echo "=== Test 18: revise_apply self-transition ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
"$BIN" advance workflow-state-machine propose >/dev/null
"$BIN" advance workflow-state-machine accept_proposal >/dev/null
"$BIN" advance workflow-state-machine accept_design >/dev/null
out="$("$BIN" advance workflow-state-machine revise_apply)"
assert_json_field "revise_apply stays in apply" "$out" ".current_phase" "apply"
assert_json_field "revise_apply history event" "$out" '.history[-1].event' "revise_apply"

echo ""
echo "=== Test 19: Branch path allowed_events ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
out="$("$BIN" advance workflow-state-machine explore_start)"
assert_json_field "explore only allows explore_complete" "$out" '.allowed_events | join(",")' "explore_complete"

echo ""
echo "=== Test 20: Removed revise event returns error ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
"$BIN" advance workflow-state-machine propose >/dev/null
"$BIN" advance workflow-state-machine accept_proposal >/dev/null
assert_exit "revise event rejected" "1" "$BIN" advance workflow-state-machine revise
assert_stderr_contains "revise error lists allowed" "Allowed events" "$BIN" advance workflow-state-machine revise

echo ""
echo "=== Test 21: update-field subcommand ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
out="$("$BIN" update-field workflow-state-machine last_summary_path "/path/to/summary.md")"
assert_json_field "updated last_summary_path" "$out" '.last_summary_path' "/path/to/summary.md"

echo ""
echo "=== Test 22: update-field rejects disallowed fields ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
assert_exit "reject disallowed field" "1" "$BIN" update-field workflow-state-machine current_phase hacked
assert_stderr_contains "rejects disallowed field" "not updatable" "$BIN" update-field workflow-state-machine current_phase hacked

echo ""
echo "=== Test 23: Pre-2.0 run.json fails validation ==="
cleanup
mkdir -p "${RUNS_DIR}/workflow-state-machine"
echo '{"run_id":"workflow-state-machine","change_name":"workflow-state-machine","current_phase":"start","status":"active","allowed_events":["propose"],"created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","history":[],"issue":null}' > "${RUNS_DIR}/workflow-state-machine/run.json"
assert_exit "old schema fails advance" "1" "$BIN" advance workflow-state-machine propose
assert_stderr_contains "old schema error message" "missing required fields" "$BIN" status workflow-state-machine

# ── Cleanup and summary ───────────────────────────────────────────────
cleanup
teardown_test_change
teardown_stubs
echo ""
echo "==============================="
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "==============================="
[[ "$FAIL" -eq 0 ]] || exit 1
