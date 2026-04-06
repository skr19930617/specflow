# Feature Specification: Spec Decompose Command

**Feature Branch**: `017-spec-decompose-command`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: GitHub Issue #39: "spec分解コマンドの追加"

## Clarifications

### Session 2026-04-06

- Q: specの「大きすぎる」判定基準は？ → A: AI分析ベース（specの内容と独立機能領域の数で判定）
- Q: sub-issueの実装順序管理方法は？ → A: Issue番号プレフィックス + ラベル（Milestoneは使わない）。**Design Decision Override**: Issue本文では「マイルストーンも設定できるなら...マイルストーンにして」と記載されているが、issue author（spec author と同一人物）がこの仕様策定中にMilestoneの乱立によるリポジトリ汚染を懸念し、軽量な代替手段（タイトルプレフィックス + ラベル）への変更を明示的に承認した。この決定はissue本文の意図（順序の明示化）を満たしつつ、実装手段を変更するものである。
- Q: コマンドの実装形態は？ → A: specflowコマンド (`/specflow.decompose`) として実装
- Q: GitHub API エラー時のリカバリ戦略は？ → A: 作成済みissueを保持し、失敗分のみリトライ
- Q: P3カスタマイズのMVPスコープは？ → A: 確認/キャンセルのみ（インタラクティブ編集は後日追加）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Decompose Issue-Linked Spec into Sub-Issues (Priority: P1)

A developer has created a spec from a GitHub issue URL via `/specflow`. The spec turns out to be too large for a single implementation cycle. The developer runs `/specflow.decompose`, which uses AI analysis to evaluate the spec's content and identify independent functional areas. If decomposition is warranted, the system splits the spec into logically independent sub-features, creates GitHub issues for each sub-feature with phase-prefixed titles (e.g., "Phase 1: ...") and labels for ordering.

**Why this priority**: This is the core value of the feature — automating the tedious process of manually breaking down large specs into trackable, ordered work items on GitHub.

**Independent Test**: Can be fully tested by running `/specflow.decompose` on a known large spec that originated from a GitHub issue, then verifying that sub-issues with correct phase prefixes and labels are created on GitHub.

**Acceptance Scenarios**:

1. **Given** a spec created from a GitHub issue URL that contains multiple distinct functional areas, **When** the user runs `/specflow.decompose`, **Then** the system analyzes the spec content via AI and presents a proposed decomposition into sub-features with a suggested implementation order.
2. **Given** the user confirms the proposed decomposition, **When** the system creates the sub-issues, **Then** each sub-issue is created on GitHub with a phase-prefixed title (e.g., "Phase 1: User authentication"), a description derived from the relevant spec sections, appropriate labels, and a reference back to the parent issue.
3. **Given** the decomposition is complete, **When** the user views the parent issue on GitHub, **Then** a comment on the parent issue contains links to all created sub-issues listed in implementation order.
4. **Given** an API error occurs mid-way through issue creation (e.g., 3 of 5 issues created), **When** the error is reported, **Then** the system retains the already-created issues, reports the partial result to the user, and offers to retry the failed issues.

---

### User Story 2 - Warn About Large Inline Specs (Priority: P2)

A developer creates a spec via inline text input (not from a GitHub issue). The spec grows large enough that it would benefit from decomposition. The system detects this and warns the user that the spec is too large, recommending manual decomposition.

**Why this priority**: Inline specs lack a GitHub issue context, so automatic issue creation is not applicable. However, warning the user about oversized specs helps maintain manageable feature scopes.

**Independent Test**: Can be tested by providing a large inline spec and verifying the warning message appears with actionable guidance.

**Acceptance Scenarios**:

1. **Given** a spec created from inline text input that the AI analysis determines contains multiple independent functional areas, **When** `/specflow.decompose` is run, **Then** the system displays a warning that the spec is too large and recommends splitting it into smaller features manually.
2. **Given** a spec created from inline text input that is at a reasonable granularity, **When** `/specflow.decompose` is run, **Then** the system confirms the spec is appropriately scoped and no decomposition is needed.

---

### User Story 3 - Confirm or Cancel Decomposition (Priority: P3)

A developer runs the decompose command and reviews the proposed split. In the MVP, the system presents the decomposition plan and offers a simple confirm/cancel choice. Interactive editing (merge, split, reorder, rename) is deferred to a future iteration.

**Why this priority**: Basic user control over decomposition (accept or reject) is sufficient for MVP. Full interactive editing adds complexity without being essential for the initial release.

**Independent Test**: Can be tested by running decompose on a large spec, choosing cancel, and verifying no issues are created.

**Acceptance Scenarios**:

1. **Given** the system presents a decomposition proposal, **When** the user confirms, **Then** issues are created according to the proposed plan.
2. **Given** the system presents a decomposition proposal, **When** the user cancels, **Then** no GitHub issues are created and the spec remains unchanged.

---

### Edge Cases

- What happens when the spec is already small enough and does not need decomposition? → AI analysis confirms the spec is at reasonable granularity; no action taken.
- How does the system handle a spec with no clear boundaries for splitting (highly interconnected requirements)? → AI reports that decomposition is not recommended and suggests the spec be implemented as-is.
- What happens if the GitHub API rate limit is reached during issue creation? → System retains already-created issues, reports partial result, and offers retry for remaining issues.
- What happens if issue creation is interrupted by an API error after some issues are already created? → Already-created issues are retained; user is informed of which issues were created and offered retry for the remaining ones (covered by FR-010). Note: user-initiated cancellation is only available before issue creation begins (FR-007); once confirmed, issue creation runs to completion or fails via API error.
- How does the system handle a spec that references a closed parent issue? → A closed parent issue is still a valid decomposition target; the system proceeds normally since closed issues can still receive comments and linked sub-issues.
- How does the system handle a spec that references a deleted or unreachable parent issue? → System reports the parent issue is unavailable and asks the user to provide a valid issue URL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST use AI analysis to evaluate spec content and determine whether it contains multiple independent functional areas warranting decomposition.
- **FR-002**: System MUST propose a decomposition of a large spec into logically independent sub-features, each with a clear scope boundary.
- **FR-003**: System MUST present the decomposition plan to the user for confirmation or cancellation before creating any GitHub issues.
- **FR-004**: For issue-linked specs, the system MUST create GitHub issues for each sub-feature with phase-prefixed titles (e.g., "Phase 1: ..."), descriptive labels, descriptions derived from relevant spec sections, and a reference back to the parent issue.
- **FR-005**: System MUST use issue title prefixes (e.g., "Phase 1:", "Phase 2:") and labels to indicate the recommended implementation order of sub-issues. This replaces the milestone-based ordering mentioned in the original issue body; the decision to use prefixes + labels instead of milestones was made by the spec author to avoid repository clutter (see Clarifications). This is the authoritative ordering mechanism. The system MUST create any missing phase labels (e.g., `phase-1`, `phase-2`) automatically if they do not already exist in the repository.
- **FR-006**: For inline specs (not linked to an issue), the system MUST display a warning and decomposition guidance instead of creating issues.
- **FR-007**: System MUST allow the user to confirm or cancel the proposed decomposition before any GitHub operations (MVP scope; interactive editing deferred).
- **FR-008**: System MUST post a comment on the parent issue with links to all created sub-issues listed in implementation order.
- **FR-009**: Each created sub-issue MUST contain the following mandatory sections: (a) a scoped description of the sub-feature, (b) the relevant functional requirements extracted from the parent spec, (c) acceptance criteria specific to the sub-feature, (d) a "Parent Issue" link back to the original issue, and (e) phase number (e.g., "Phase 1 of 4"). Dependencies between sub-issues are not tracked in MVP; the phase number alone indicates recommended implementation order.
- **FR-010**: If issue creation partially fails, the system MUST retain already-created issues, report the partial result, and offer to retry the failed issues.

### Key Entities

- **Parent Spec**: The original spec being decomposed; contains all requirements and user stories.
- **Sub-Feature**: A logically independent subset of the parent spec that can be implemented and tested in isolation.
- **Sub-Issue**: A GitHub issue created from a sub-feature, with a phase-prefixed title and labels for ordering, linked to the parent issue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can decompose a large spec into sub-issues in under 5 minutes (vs. 30+ minutes manually).
- **SC-002**: Each generated sub-issue contains all mandatory sections defined in FR-009 (scoped description, relevant requirements, acceptance criteria, parent link, phase number) and can be understood without reading the full parent spec.
- **SC-003**: 90% of proposed decompositions are accepted by users without modification (confirm on first attempt).
- **SC-004**: All created sub-issues are correctly linked to the parent issue and ordered via phase prefixes and labels.
- **SC-005**: Inline spec users receive a clear, actionable warning when AI analysis determines their spec exceeds a reasonable scope.

## Assumptions

- The user has `gh` CLI installed and authenticated with sufficient permissions to create issues.
- The GitHub repository has issues enabled.
- The decompose command is implemented as `/specflow.decompose`.
- AI analysis determines decomposition need based on the number and independence of functional areas in the spec, not line count alone.
- Phase labels follow a convention like `phase-1`, `phase-2`, etc. GitHub Milestones are intentionally not used to avoid repository clutter; title prefixes and labels serve the same ordering purpose with less overhead (see Clarifications for rationale).
- Interactive editing of decomposition proposals is out of scope for MVP and will be added in a future iteration.
