import assert from "node:assert/strict";
import test from "node:test";
import {
	ArtifactSchemaValidationError,
	ArtifactStoreError,
	ChangeArtifactType,
	changeArtifactTypes,
	changeRef,
	isChangeArtifactType,
	isReviewLedgerKind,
	isRunArtifactType,
	MissingRequiredArtifactError,
	ReviewLedgerKind,
	refQualifier,
	reviewLedgerKinds,
	runArtifactTypes,
	runRef,
	UnknownArtifactTypeError,
} from "../lib/artifact-types.js";

test("changeArtifactTypes enumerates all 8 types", () => {
	assert.equal(changeArtifactTypes.length, 8);
	assert.ok(changeArtifactTypes.includes("proposal"));
	assert.ok(changeArtifactTypes.includes("design"));
	assert.ok(changeArtifactTypes.includes("tasks"));
	assert.ok(changeArtifactTypes.includes("task-graph"));
	assert.ok(changeArtifactTypes.includes("spec-delta"));
	assert.ok(changeArtifactTypes.includes("review-ledger"));
	assert.ok(changeArtifactTypes.includes("current-phase"));
	assert.ok(changeArtifactTypes.includes("approval-summary"));
});

test("runArtifactTypes enumerates exactly run-state", () => {
	assert.equal(runArtifactTypes.length, 1);
	assert.ok(runArtifactTypes.includes("run-state"));
});

test("reviewLedgerKinds enumerates proposal, design, apply", () => {
	assert.equal(reviewLedgerKinds.length, 3);
	assert.ok(reviewLedgerKinds.includes("proposal"));
	assert.ok(reviewLedgerKinds.includes("design"));
	assert.ok(reviewLedgerKinds.includes("apply"));
});

test("isChangeArtifactType accepts valid types", () => {
	assert.ok(isChangeArtifactType("proposal"));
	assert.ok(isChangeArtifactType("spec-delta"));
	assert.ok(isChangeArtifactType("review-ledger"));
});

test("isChangeArtifactType rejects invalid types", () => {
	assert.ok(!isChangeArtifactType("run-state"));
	assert.ok(!isChangeArtifactType("unknown"));
	assert.ok(!isChangeArtifactType(""));
});

test("isRunArtifactType accepts run-state", () => {
	assert.ok(isRunArtifactType("run-state"));
});

test("isRunArtifactType rejects invalid types", () => {
	assert.ok(!isRunArtifactType("proposal"));
	assert.ok(!isRunArtifactType("unknown"));
});

test("isReviewLedgerKind accepts valid kinds", () => {
	assert.ok(isReviewLedgerKind("proposal"));
	assert.ok(isReviewLedgerKind("design"));
	assert.ok(isReviewLedgerKind("apply"));
});

test("isReviewLedgerKind rejects invalid kinds", () => {
	assert.ok(!isReviewLedgerKind("review"));
	assert.ok(!isReviewLedgerKind(""));
});

test("changeRef creates singleton ref without qualifier", () => {
	const ref = changeRef("my-change", ChangeArtifactType.Proposal);
	assert.equal(ref.changeId, "my-change");
	assert.equal(ref.type, "proposal");
	assert.equal(refQualifier(ref), undefined);
});

test("changeRef creates spec-delta ref with qualifier", () => {
	const ref = changeRef(
		"my-change",
		ChangeArtifactType.SpecDelta,
		"run-identity-model",
	);
	assert.equal(ref.changeId, "my-change");
	assert.equal(ref.type, "spec-delta");
	assert.equal(refQualifier(ref), "run-identity-model");
});

test("changeRef creates review-ledger ref with kind qualifier", () => {
	const ref = changeRef(
		"my-change",
		ChangeArtifactType.ReviewLedger,
		ReviewLedgerKind.Design,
	);
	assert.equal(ref.changeId, "my-change");
	assert.equal(ref.type, "review-ledger");
	assert.equal(refQualifier(ref), "design");
});

test("runRef creates run-state ref", () => {
	const ref = runRef("my-run-1");
	assert.equal(ref.runId, "my-run-1");
	assert.equal(ref.type, "run-state");
});

test("ArtifactStoreError with kind not_found includes ref details in message", () => {
	const ref = changeRef("my-change", ChangeArtifactType.Proposal);
	const error = new ArtifactStoreError({ kind: "not_found", message: `Artifact not found: my-change (proposal)`, ref });
	assert.ok(error.message.includes("my-change"));
	assert.ok(error.message.includes("proposal"));
	assert.equal(error.name, "ArtifactStoreError");
	assert.equal(error.kind, "not_found");
	assert.equal(error.ref, ref);
});

test("ArtifactStoreError with kind not_found works with run refs", () => {
	const ref = runRef("my-run-1");
	const error = new ArtifactStoreError({ kind: "not_found", message: `Artifact not found: my-run-1 (run-state)`, ref });
	assert.ok(error.message.includes("my-run-1"));
	assert.ok(error.message.includes("run-state"));
	assert.equal(error.kind, "not_found");
});

test("UnknownArtifactTypeError stores type", () => {
	const error = new UnknownArtifactTypeError("bogus");
	assert.ok(error.message.includes("bogus"));
	assert.equal(error.artifactType, "bogus");
});

test("ArtifactSchemaValidationError stores ref and errors", () => {
	const ref = changeRef(
		"my-change",
		ChangeArtifactType.ReviewLedger,
		ReviewLedgerKind.Apply,
	);
	const error = new ArtifactSchemaValidationError(ref, ["bad field"]);
	assert.ok(error.message.includes("bad field"));
	assert.equal(error.ref, ref);
	assert.deepEqual(error.validationErrors, ["bad field"]);
});

test("MissingRequiredArtifactError stores requirement and context", () => {
	const requirement = {
		domain: "change" as const,
		type: ChangeArtifactType.Proposal,
	};
	const error = new MissingRequiredArtifactError(requirement, {
		changeId: "my-change",
	});
	assert.ok(error.message.includes("my-change"));
	assert.ok(error.message.includes("proposal"));
	assert.equal(error.requirement, requirement);
});
