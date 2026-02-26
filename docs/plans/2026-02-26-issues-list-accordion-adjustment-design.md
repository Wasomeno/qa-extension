# Design: Issues List Project Accordion Adjustment

Adjust the issues list in `@src/pages/issues/index.tsx` to conditionally show the project accordion based on project selection.

## Context

Currently, the issues list always shows project headers (accordions) unless `isProjectFiltered` is true. We want to refine this logic:
- If 0 projects selected (default/initial state): Show accordion (since it might show multiple projects).
- If >1 projects selected: Show accordion.
- If exactly 1 project selected: Hide accordion (show flat list).

Additionally, the "ALL" state in the project picker is not supported by the backend and should be removed.

## Changes

### 1. `IssuesPage` (`src/pages/issues/index.tsx`)

- Update the initial state of `filters.projectIds` to be an empty array `[]` instead of `['ALL']`.
- Update the `isProjectFiltered` prop passed to `IssueList` to be `filters.projectIds.length === 1`.

### 2. `IssueFilterBar` (`src/pages/issues/components/filter-bar.tsx`)

- Remove the `allOption` from the project `SearchablePicker`.
- Ensure it handles the empty array state correctly.

### 3. `useGetIssues` (`src/pages/issues/hooks/use-get-issues.ts`)

- Ensure it handles empty `projectIds` by fetching global issues (this seems already implemented but good to double check).

### 4. `IssueList` (`src/pages/issues/components/issue-list.tsx`)

- No changes needed if we correctly update `isProjectFiltered` in the parent.

## Verification Plan

### Automated Tests
- Run existing tests for issues page.
- Run lint and typecheck.

### Manual Verification
1. Open Issues page.
2. Initially (no projects selected), see issues grouped by projects in accordions.
3. Select one project: see issues in a flat list without project header.
4. Select two projects: see issues grouped by projects in accordions.
5. Deselect all projects: see accordions again.
