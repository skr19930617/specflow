// Unit tests for `lintCommandTemplates` — the build-time guard that
// prevents `$1`..`$9` / `$ARGUMENTS` from sneaking back into fenced
// bash/sh blocks of `assets/commands/*.md.tmpl`.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { lintCommandTemplates } from "../contracts/template-resolver.js";
import { makeTempDir, removeTempDir } from "./test-helpers.js";

function fixture(body: string): string {
	const dir = makeTempDir("tmpl-lint-");
	const path = join(dir, "sample.md.tmpl");
	writeFileSync(path, body, "utf8");
	return path;
}

test("lint: empty template is clean", () => {
	const path = fixture("");
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: text-fenced $ARGUMENTS is allowed", () => {
	const body = "## User Input\n\n```text\n$ARGUMENTS\n```\n";
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: plain-prose $ARGUMENTS outside a fence is allowed", () => {
	const body = "The `$ARGUMENTS` placeholder is substituted at call time.\n";
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: $1 inside ```bash fence fails with file:line:token", () => {
	const body = 'Preamble\n```bash\nlocal x="$1"\necho "$1"\n```\nTail\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 2);
		assert.equal(errs[0].line, 3);
		assert.equal(errs[0].token, "$1");
		assert.equal(errs[1].line, 4);
		assert.equal(errs[1].token, "$1");
		assert.match(errs[0].message, /sample\.md\.tmpl:3:/);
		assert.match(errs[0].message, /forbidden positional-arg placeholder \$1/);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: $ARGUMENTS inside ```sh fence fails", () => {
	const body = "```sh\nprintf '%s' \"$ARGUMENTS\"\n```\n";
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 1);
		assert.equal(errs[0].token, "$ARGUMENTS");
		assert.equal(errs[0].line, 2);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: \\$1 backslash-escaped form is allowed", () => {
	const body = '```bash\nlocal x="\\$1"\n```\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: \\$ARGUMENTS backslash-escaped form is allowed", () => {
	const body = '```bash\necho "\\$ARGUMENTS"\n```\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: ${1} brace form is allowed", () => {
	const body = '```bash\nlocal x="${1}"\n```\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: $10 two-digit is allowed (not a positional-arg placeholder)", () => {
	const body = '```bash\necho "$10"\n```\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: untagged fence is out of scope", () => {
	const body = '```\nlocal x="$1"\n```\n';
	const path = fixture(body);
	try {
		const errs = lintCommandTemplates([path]);
		assert.equal(errs.length, 0);
	} finally {
		removeTempDir(join(path, ".."));
	}
});

test("lint: multiple files accumulate errors across all of them", () => {
	const bodyA = '```bash\nlocal x="$1"\n```\n';
	const bodyB = '```sh\ncase "$2" in a) ;; esac\n```\n';
	const pathA = fixture(bodyA);
	const pathB = fixture(bodyB);
	try {
		const errs = lintCommandTemplates([pathA, pathB]);
		assert.equal(errs.length, 2);
		assert.equal(errs[0].token, "$1");
		assert.equal(errs[1].token, "$2");
		assert.ok(errs[0].filePath !== errs[1].filePath);
	} finally {
		removeTempDir(join(pathA, ".."));
		removeTempDir(join(pathB, ".."));
	}
});

test("lint: mixed clean + dirty templates only flag the dirty ones", () => {
	const clean = fixture("```text\n$ARGUMENTS\n```\n");
	const dirty = fixture('```bash\necho "$3"\n```\n');
	try {
		const errs = lintCommandTemplates([clean, dirty]);
		assert.equal(errs.length, 1);
		assert.equal(errs[0].filePath, dirty);
	} finally {
		removeTempDir(join(clean, ".."));
		removeTempDir(join(dirty, ".."));
	}
});
