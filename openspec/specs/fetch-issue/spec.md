# fetch-issue Specification

## Purpose

Resolve GitHub issue metadata from an issue URL for downstream workflow commands.

## Requirements

### Requirement: GitHub issue URL parsing

The system SHALL provide `bin/specflow-fetch-issue` as a Node-based CLI that accepts exactly one GitHub issue URL argument.

#### Scenario: Missing argument

- **WHEN** `specflow-fetch-issue` is executed without an issue URL
- **THEN** it SHALL exit with code 1 and print `Usage: specflow-fetch-issue <issue-url>` to stdout

#### Scenario: Invalid issue URL

- **WHEN** the provided URL does not match `https://<host>/<owner>/<repo>/issues/<number>`
- **THEN** it SHALL exit with code 1 and print `Invalid GitHub issue URL: <url>` to stdout

### Requirement: GitHub metadata lookup

The CLI SHALL invoke `gh issue view <number> --repo <owner>/<repo> --json number,title,body,url,labels,assignees,author,state` and write the resulting JSON to stdout unchanged.

#### Scenario: GitHub.com issue lookup

- **WHEN** the issue URL host is `github.com`
- **THEN** the CLI SHALL invoke `gh issue view` without overriding `GH_HOST`

#### Scenario: GitHub Enterprise issue lookup

- **WHEN** the issue URL host is not `github.com`
- **THEN** the CLI SHALL set `GH_HOST` to the parsed host before invoking `gh issue view`

#### Scenario: Successful metadata output

- **WHEN** `gh issue view` exits successfully
- **THEN** stdout SHALL contain JSON with at least `number`, `title`, `body`, `url`, `labels`, `assignees`, `author`, and `state`
