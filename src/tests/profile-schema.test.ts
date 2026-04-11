import assert from "node:assert/strict";
import test from "node:test";
import { validateProfile } from "../lib/profile-schema.js";

test("validateProfile enforces the v1 profile shape strictly", () => {
	const errors = validateProfile({
		schemaVersion: "01",
		languages: ["typescript", "go"],
		toolchain: "npm",
		commands: {
			build: "npm run build",
			test: "npm test",
			lint: "npm run lint",
			format: "npm run format",
		},
		directories: {
			source: ["src/"],
			test: ["tests/"],
			generated: ["dist/"],
		},
		forbiddenEditZones: null,
		contractSensitiveModules: null,
		codingConventions: null,
		verificationExpectations: null,
		extraField: true,
	});

	assert.match(
		errors.join(" "),
		/\$\.schemaVersion must be a monotonic integer string\./,
	);
	assert.match(
		errors.join(" "),
		/\$\.languages must contain exactly one language in v1\./,
	);
	assert.match(errors.join(" "), /\$\.extraField is an unknown key\./);
});
