# Design: Fix Issue Detail Data Sync

## Status: Approved
## Date: 2026-02-27

## Context
Navigating to `IssueDetailPage` from `DashboardPage` or `BoardsPage` currently relies on partial `Issue` data passed via props. This leads to incorrect or missing descriptions and metadata in the detail view because these sources don't always fetch the full issue object.

## Problem
- `DashboardPage` activities provide a minimal `Issue` object.
- `BoardsPage` maps board issues to a simplified `Issue` structure.
- `IssueDetailPage` uses these props directly to initialize its state, leading to "Wrong description data" as reported by the user.

## Proposed Solution
Modify `IssueDetailPage` to use the `useGetIssue` hook to fetch the complete issue data from the API upon mounting.

### Architecture Changes
- **Data Flow**: Prop-based data -> API-based data (Source of Truth).
- **State Management**: Sync component state (`description`, `labels`, `assignee`) with the fetched API data once it becomes available.

### Component Updates
#### `IssueDetailPage` (`src/pages/issues/detail/index.tsx`)
- Call `useGetIssue(issue.project_id, issue.iid)`.
- Use the fetched `data.data` (if available) as the primary source for the UI.
- Use the `issue` prop as a fallback/initial state to prevent UI flickering for stable fields like `title`.
- Use a `useEffect` or React Query's `onSuccess` (though deprecated in v5, so `useEffect` or derived state) to update local editable states when new data arrives.

## Trade-offs
- **Pros**: 
    - Consistent data regardless of entry point.
    - Automatic updates when the cache is invalidated.
    - Decouples detail view from the specific fetching logic of parent pages.
- **Cons**:
    - One additional API call per detail view entry (offset by React Query's caching).

## Verification Plan
1.  **Dashboard Test**: Click an activity and verify the full description loads.
2.  **Boards Test**: Click an issue card and verify all labels and descriptions are present.
3.  **Real-time Update**: Edit an issue and verify the list and detail views sync correctly via query invalidation.
