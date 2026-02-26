 # Issue Filtering & Search Synchronization Implementation Plan
 
 > **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
 
 **Goal:** Synchronize UI filter state with backend API calls and implement debounced search for the Issues page.
 
 **Architecture:** Pass UI state to the `useGetIssues` hook, which maps the state to backend query parameters and handles debounced search to optimize performance.
 
 **Tech Stack:** React, TanStack Query, Lucide React.
 
 ---
 
 ### Task 1: Refactor `useGetIssues` to accept filter state
 
 **Files:**
 - Modify: `src/pages/issues/hooks/use-get-issues.ts`
 
 **Step 1: Update hook signature and remove default user filtering**
 Remove the logic that defaults `assignee_id` and `author_id` to the current user when no filters are present.
 
 **Step 2: Map all quickFilters to parameters**
 Ensure `assignedToMe`, `createdByMe`, `unassigned`, `highPriority`, `inQa`, and `blocked` are correctly mapped to API params.
 
 **Step 3: Update queryKey**
 Include the entire `filters` object in the `queryKey`.
 
 ### Task 2: Implement debounced search in `IssuesPage`
 
 **Files:**
 - Modify: `src/pages/issues/index.tsx`
 
 **Step 1: Add state for debounced search**
 Use a local `useEffect` to manage a `debouncedSearch` value based on `filters.search`.
 
 **Step 2: Pass filters to hook**
 Invoke `useGetIssues` with the current `filters` state, overriding `search` with `debouncedSearch`.
 
 ### Task 3: Verification
 
 **Step 1: Manual verification**
 - Verify that searching for an issue updates the list after 300ms.
 - Verify that toggling "Assigned to Me" filters the list correctly.
 - Verify that selecting a project/label works.
