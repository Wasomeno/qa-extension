# Create Merge Request Feature Plan

## Objectives
- Deliver an end-to-end “Create Merge Request” flow inside the floating trigger experience.
- Reuse proven UX patterns from `extension/src/components/compact-issue-creator.tsx` for AI assistance, metadata pickers, and Slack notifications.
- Reduce manual GitLab MR prep by auto-populating description, labels, reviewers, approvals, and target/source branches, plus optional Slack handoff.

## Current Reference Points
- `extension/src/components/compact-issue-creator.tsx`: AI drafting, structured pickers, Slack notification UI.
- `extension/src/components/floating-trigger/components/floating-trigger-popup.tsx`: Entry point to list new MR tool alongside existing quick actions.
- `backend/` GitLab integrations (confirm available endpoints/services for MR creation and metadata fetching).
- Slack integration hooks currently used by the issue creator.

## Milestones & Workstreams

### 1. Foundations & API Contracts
- Audit existing GitLab service layer; extend to support MR template fetch, default target branch, reviewers, labels, approval rules, and Slack metadata.
- Define TypeScript interfaces for `MergeRequestDraft`, `MergeRequestTemplate`, `MergeRequestPreset`, and Slack notification payloads.
- Ensure backend endpoints (or direct GitLab API calls) return enriched data (project templates, branches, members, label catalog, approval rules, Slack channels).

### 2. Data Fetching & Preset Management
- Add React Query hooks for MR templates, project presets, project members, labels, approval rules, and branch lists.
- Introduce preset CRUD (if needed) or at minimum query existing project-scoped presets; support default preset resolution.
- Store “last used” selections locally for quick reuse when no preset exists.

### 3. UI Architecture
- Create `MergeRequestCreator` component modeled after `CompactIssueCreator` with modular pill pickers for:
  - Project (if multiple projects supported by extension)
  - Source branch / target branch (with smart defaults)
  - Labels (multi-select with preset support)
  - Reviewers & assignee (Avatar list, preset-aware)
  - Approval rule set (show effective requirements)
  - Slack notification (optional checkbox + selectors)
- Support keyboard isolation, loading states, and error messaging consistent with existing patterns.
- Embed the component in the floating trigger popup (new view state + navigation).

### 4. AI-Assisted Description Drafting
- Add hook that composes AI prompt using:
  - Selected MR template (resolve placeholders)
  - Commit summaries + diff snippets (fetch through backend service)
  - Issue context (if invoked from issue view)
- Mirror AI loading/error UX from `CompactIssueCreator` with “Regenerate”, “Insert template fields”, and manual edit controls.
- Cache AI drafts per source branch to avoid redundant calls.

### 5. Presets, Auto-Assignments, and Smart Defaults
- Auto-apply project default template + preset when component loads; surface subtle status message with ability to swap.
- Implement preset preview (labels/reviewers/approvals) before applying; allow overrides with inline editing.
- Resolve source/target branches:
  - Check linked issue metadata for associated branch (`issue.references?.branch` or similar).
  - Fall back to user’s currently active branch or project default target without unexpected changes.
- Auto-assign reviewers/assignee from preset but allow replacement; show avatar pills.

### 6. Submission & Slack Notification
- On submit, call MR creation endpoint with compiled payload (template-applied description, metadata).
- Provide optimistic UI state while awaiting response; surface success + follow-up options.
- If Slack notify selected, send composed summary (MR title, bullet list of changes, MR link, mention list) through existing Slack bot integration.
- Show Slack preview before sending and confirmation after success/failure.

### 7. QA, Telemetry, and Polish
- Add unit tests for new hooks/services (React Query hooks, AI prompt builder, preset utilities).
- Write integration tests (Jest + MSW) covering happy path, AI failure fallback, preset overrides.
- Instrument usage analytics (if existing telemetry pipeline) for draft generation clicks, preset adoption, Slack sends.
- Conduct UX polish: focus management, accessible labels, consistent animations; verify responsive layout inside popup.

## Open Questions
- Do we need project-level management UI for MR presets inside the extension, or just consume existing backend-configured presets?
- What is the maximum branch list size, and do we need typeahead search or pagination?
- Should Slack notifications support multiple channels or only one at a time?
- How do we handle GitLab approval rules conflicts when presets diverge from project defaults?

## Suggested Iteration Order
1. Foundations & data hooks
2. Baseline MR creator UI with template auto-apply
3. Presets + auto-assignment
4. AI description generation
5. Slack notification add-on
6. QA hardening and telemetry
