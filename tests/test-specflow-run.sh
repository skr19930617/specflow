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

setup_stubs

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
assert_json_field "start allowed" "$out" '.allowed_events | join(",")' "propose"

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
echo "=== Test 3: Revise self-transition ==="
cleanup
"$BIN" start workflow-state-machine >/dev/null
"$BIN" advance workflow-state-machine propose >/dev/null
"$BIN" advance workflow-state-machine accept_proposal >/dev/null
out="$("$BIN" advance workflow-state-machine revise)"
assert_json_field "revise stays in design" "$out" ".current_phase" "design"
assert_json_field "revise history from" "$out" '.history[-1].from' "design"
assert_json_field "revise history to" "$out" '.history[-1].to' "design"
assert_json_field "revise history event" "$out" '.history[-1].event' "revise"

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

# ── Cleanup and summary ───────────────────────────────────────────────
cleanup
teardown_stubs
echo ""
echo "==============================="
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "==============================="
[[ "$FAIL" -eq 0 ]] || exit 1
