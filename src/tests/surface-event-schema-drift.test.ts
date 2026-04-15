// Schema drift test — validates TypeScript surface event types against JSON
// Schema files to detect drift between the two representations.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import _Ajv2020 from "ajv/dist/2020.js";

// ajv's ESM export requires this workaround for TypeScript module interop.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;

import type {
	ActorIdentity,
	ApprovalPayload,
	ClarifyRequestPayload,
	ClarifyResponsePayload,
	CorrelationContext,
	RejectPayload,
	ResumePayload,
	ReviewOutcomePayload,
	SurfaceEventEnvelope,
	SurfaceIdentity,
} from "../contracts/surface-events.js";

const SCHEMAS_DIR = resolve("assets/global/schemas/surface-events");

// --- Helpers ---------------------------------------------------------------

function loadSchemas(): Record<string, unknown> {
	const schemas: Record<string, unknown> = {};
	for (const name of readdirSync(SCHEMAS_DIR)) {
		if (!name.endsWith(".schema.json")) continue;
		const raw = readFileSync(join(SCHEMAS_DIR, name), "utf8");
		schemas[name] = JSON.parse(raw);
	}
	return schemas;
}

function createAjv(
	schemas: Record<string, unknown>,
): InstanceType<typeof Ajv2020> {
	const ajv = new Ajv2020({ strict: false, allErrors: true });
	for (const [name, schema] of Object.entries(schemas)) {
		ajv.addSchema(schema as object, name);
	}
	return ajv;
}

// --- Fixtures: one sample per concrete event type --------------------------

const ACTOR: ActorIdentity = {
	actor: "human",
	actor_id: "user-123",
};

const SURFACE: SurfaceIdentity = {
	surface: "local-cli",
};

const CORRELATION: CorrelationContext = {
	run_id: "my-feature-1",
	change_id: "my-feature",
};

function makeEnvelope<T extends string>(
	eventKind: "approval" | "reject" | "clarify" | "resume",
	eventType: T,
	direction: "inbound" | "outbound",
	payload: unknown,
): SurfaceEventEnvelope {
	return {
		schema_version: "1.0",
		event_id: "evt-001",
		event_kind: eventKind,
		event_type: eventType,
		direction,
		timestamp: "2026-04-15T00:00:00Z",
		correlation: CORRELATION,
		actor: ACTOR,
		surface: SURFACE,
		payload,
	} as SurfaceEventEnvelope;
}

const APPROVAL_PAYLOAD: ApprovalPayload = {
	phase_from: "spec_ready",
	phase_to: "design_draft",
	record_id: "approval-my-feature-1-1",
};

const REJECT_PAYLOAD: RejectPayload = {
	phase_from: "proposal_draft",
	reason: "not aligned with roadmap",
};

const CLARIFY_REQ_PAYLOAD: ClarifyRequestPayload = {
	question: "What auth method?",
	context: "The proposal mentions auth but not which method",
	record_id: "clarify-my-feature-1-1",
};

const CLARIFY_RESP_PAYLOAD: ClarifyResponsePayload = {
	answer: "Use OAuth2",
	question_event_id: "evt-000",
	record_id: "clarify-my-feature-1-1",
};

const RESUME_PAYLOAD: ResumePayload = {
	phase_from: "design_draft",
};

const REVIEW_OUTCOME_PAYLOAD: ReviewOutcomePayload = {
	phase_from: "design_review",
	reviewer_actor: { actor: "ai-agent", actor_id: "codex" },
	summary: "Looks good",
	issues: [{ id: "P1", severity: "medium", detail: "Minor gap" }],
};

const SAMPLE_EVENTS: readonly SurfaceEventEnvelope[] = [
	makeEnvelope("approval", "accept_spec", "inbound", APPROVAL_PAYLOAD),
	makeEnvelope("approval", "accept_design", "inbound", APPROVAL_PAYLOAD),
	makeEnvelope("approval", "accept_apply", "inbound", APPROVAL_PAYLOAD),
	makeEnvelope("reject", "reject", "inbound", REJECT_PAYLOAD),
	makeEnvelope("clarify", "clarify_request", "outbound", CLARIFY_REQ_PAYLOAD),
	makeEnvelope("clarify", "clarify_response", "inbound", CLARIFY_RESP_PAYLOAD),
	makeEnvelope("resume", "resume", "inbound", RESUME_PAYLOAD),
	makeEnvelope(
		"approval",
		"design_review_approved",
		"inbound",
		REVIEW_OUTCOME_PAYLOAD,
	),
	makeEnvelope(
		"approval",
		"apply_review_approved",
		"inbound",
		REVIEW_OUTCOME_PAYLOAD,
	),
	makeEnvelope(
		"approval",
		"request_changes",
		"inbound",
		REVIEW_OUTCOME_PAYLOAD,
	),
	makeEnvelope("approval", "block", "inbound", REVIEW_OUTCOME_PAYLOAD),
];

// --- Tests -----------------------------------------------------------------

test("all JSON Schema files parse as valid JSON", () => {
	const schemas = loadSchemas();
	assert.ok(
		Object.keys(schemas).length >= 10,
		`expected >= 10 schema files, got ${Object.keys(schemas).length}`,
	);
});

test("envelope schema validates all 11 concrete event samples", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("envelope.schema.json");
	assert.ok(validate, "envelope.schema.json should compile");

	for (const event of SAMPLE_EVENTS) {
		const valid = validate(event);
		assert.ok(
			valid,
			`event_type=${event.event_type} failed envelope validation: ${JSON.stringify(validate.errors)}`,
		);
	}
});

test("actor-identity schema validates sample actor", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("actor-identity.schema.json");
	assert.ok(validate);
	assert.ok(validate(ACTOR));
});

test("surface-identity schema validates sample surface", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("surface-identity.schema.json");
	assert.ok(validate);
	assert.ok(validate(SURFACE));
});

test("correlation schema validates sample correlation", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("correlation.schema.json");
	assert.ok(validate);
	assert.ok(validate(CORRELATION));
});

// --- Negative tests --------------------------------------------------------

test("envelope schema rejects event missing required schema_version", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("envelope.schema.json");
	assert.ok(validate);

	const invalid = { ...SAMPLE_EVENTS[0] } as Record<string, unknown>;
	delete invalid.schema_version;
	assert.ok(!validate(invalid), "should reject missing schema_version");
});

test("envelope schema rejects event missing required event_id", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("envelope.schema.json");
	assert.ok(validate);

	const invalid = { ...SAMPLE_EVENTS[0] } as Record<string, unknown>;
	delete invalid.event_id;
	assert.ok(!validate(invalid), "should reject missing event_id");
});

test("envelope schema rejects event missing required correlation", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("envelope.schema.json");
	assert.ok(validate);

	const invalid = { ...SAMPLE_EVENTS[0] } as Record<string, unknown>;
	delete invalid.correlation;
	assert.ok(!validate(invalid), "should reject missing correlation");
});

test("actor-identity schema rejects actor missing required actor_id", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("actor-identity.schema.json");
	assert.ok(validate);

	assert.ok(!validate({ actor: "human" }), "should reject missing actor_id");
});

test("correlation schema rejects correlation missing required run_id", () => {
	const schemas = loadSchemas();
	const ajv = createAjv(schemas);
	const validate = ajv.getSchema("correlation.schema.json");
	assert.ok(validate);

	assert.ok(!validate({ change_id: "x" }), "should reject missing run_id");
});
