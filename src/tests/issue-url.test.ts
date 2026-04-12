import assert from "node:assert/strict";
import test from "node:test";
import { matchIssueUrl } from "../lib/issue-url.js";

test("matchIssueUrl matches valid github.com issue URL", () => {
	const result = matchIssueUrl("https://github.com/owner/repo/issues/123");
	assert.deepEqual(result, {
		host: "github.com",
		owner: "owner",
		repo: "repo",
		number: "123",
	});
});

test("matchIssueUrl matches GitHub Enterprise URL", () => {
	const result = matchIssueUrl(
		"https://gh.corp.example.com/team/project/issues/42",
	);
	assert.deepEqual(result, {
		host: "gh.corp.example.com",
		owner: "team",
		repo: "project",
		number: "42",
	});
});

test("matchIssueUrl returns null for pull request URL", () => {
	const result = matchIssueUrl("https://github.com/owner/repo/pull/123");
	assert.equal(result, null);
});

test("matchIssueUrl returns null for shorthand ref", () => {
	assert.equal(matchIssueUrl("#123"), null);
	assert.equal(matchIssueUrl("owner/repo#123"), null);
});

test("matchIssueUrl returns null for plain text", () => {
	assert.equal(matchIssueUrl("add user authentication"), null);
	assert.equal(matchIssueUrl("some-slug-like-text"), null);
});

test("matchIssueUrl trims whitespace", () => {
	const result = matchIssueUrl("  https://github.com/owner/repo/issues/1  ");
	assert.deepEqual(result, {
		host: "github.com",
		owner: "owner",
		repo: "repo",
		number: "1",
	});
});

test("matchIssueUrl rejects issue comment URLs", () => {
	const result = matchIssueUrl(
		"https://github.com/owner/repo/issues/99/comments",
	);
	assert.equal(result, null);
});

test("matchIssueUrl accepts URL with trailing slash", () => {
	const result = matchIssueUrl("https://github.com/owner/repo/issues/99/");
	assert.deepEqual(result, {
		host: "github.com",
		owner: "owner",
		repo: "repo",
		number: "99",
	});
});
