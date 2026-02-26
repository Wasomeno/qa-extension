 # Design Doc: Issue Filtering & Search Synchronization
 
 ## Overview
 This document outlines the design for synchronizing the search and filter state in the Issues page with the data fetching layer. Currently, filters selected in the UI are not passed to the `useGetIssues` hook, and the hook itself defaults to filtering by the current user, which limits the visibility of issues.
 
 ## Proposed Changes
 
 ### 1. UI Layer (`src/pages/issues/index.tsx`)
 - Implement search debouncing (300ms) to prevent excessive API calls.
 - Pass the full `filters` state (with debounced search) to the `useGetIssues` hook.
 
 ### 2. Hook Layer (`src/pages/issues/hooks/use-get-issues.ts`)
 - Remove default `assignee_id` and `author_id` filtering when no filters are active.
 - Map all UI `quickFilters` to backend parameters.
 - Ensure `queryKey` includes all filter states to trigger proper cache invalidation and re-fetching.
 
 ### 3. Data Flow
 1. User interacts with `IssueFilterBar`.
 2. `IssuesPage` updates `filters` state.
 3. Search term is debounced.
 4. `useGetIssues` receives updated filters.
 5. `useQuery` triggers a new fetch with mapped parameters.
 
 ## Success Criteria
 - Changing project, label, or search term correctly updates the issue list.
 - Default view shows all accessible issues instead of just "assigned to me".
 - Quick filters (Assigned to Me, Created by Me, etc.) function correctly.
