/**
 * Strict issue URL pattern for raw-input auto-detection in specflow-prepare-change.
 * Only matches exact issue URLs (no trailing path segments like /comments).
 */
export const ISSUE_URL_PATTERN =
	/^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/issues\/([0-9]+)\/?$/;

/**
 * Lenient issue URL pattern used by specflow-fetch-issue.
 * Allows trailing path segments for backward compatibility.
 */
export const ISSUE_URL_PATTERN_LENIENT =
	/^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/issues\/([0-9]+)(?:\/.*)?$/;

export interface IssueUrlMatch {
	readonly host: string;
	readonly owner: string;
	readonly repo: string;
	readonly number: string;
}

export function matchIssueUrl(input: string): IssueUrlMatch | null {
	const match = input.trim().match(ISSUE_URL_PATTERN);
	if (!match) {
		return null;
	}
	const [, host, owner, repo, number] = match;
	if (!host || !owner || !repo || !number) {
		return null;
	}
	return { host, owner, repo, number };
}

export function matchIssueUrlLenient(input: string): IssueUrlMatch | null {
	const match = input.trim().match(ISSUE_URL_PATTERN_LENIENT);
	if (!match) {
		return null;
	}
	const [, host, owner, repo, number] = match;
	if (!host || !owner || !repo || !number) {
		return null;
	}
	return { host, owner, repo, number };
}
