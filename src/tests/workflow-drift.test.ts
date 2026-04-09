import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workflowContract } from "../contracts/workflow.js";

test("workflow contract matches generated state-machine", () => {
  const rendered = JSON.parse(readFileSync("global/workflow/state-machine.json", "utf8")) as {
    version: string;
    states: string[];
    events: string[];
    transitions: unknown[];
  };

  assert.equal(rendered.version, workflowContract.version);
  assert.deepEqual(rendered.states, workflowContract.states);
  assert.deepEqual(rendered.events, workflowContract.events);
  assert.deepEqual(rendered.transitions, workflowContract.transitions);
});

test("workflow OpenSpec stays aligned with phase-specific revise events and run update-field coverage", () => {
  const workflowSpec = readFileSync("openspec/specs/workflow-definition/spec.md", "utf8");
  const transitionSpec = readFileSync("openspec/specs/transition-core/spec.md", "utf8");
  const runStateSpec = readFileSync("openspec/specs/run-state-management/spec.md", "utf8");

  assert.ok(workflowSpec.includes("revise_design"));
  assert.ok(workflowSpec.includes("revise_apply"));
  assert.ok(!workflowSpec.includes("result SHALL include events `accept_design`, `reject`, and `revise`"));
  assert.ok(transitionSpec.includes("update-field"));
  assert.ok(runStateSpec.includes("update-field <run_id> <field> <value>"));
});
