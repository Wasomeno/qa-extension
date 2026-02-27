# Issue Detail Data Synchronization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure `IssueDetailPage` always displays the correct and latest issue data by fetching it from the API instead of relying solely on props.

**Architecture:** Use the `useGetIssue` hook within `IssueDetailPage` to fetch full issue data. Sync the component's internal editable state (`description`, `labels`, `assignee`) with the fetched data to ensure consistency.

**Tech Stack:** React, TypeScript, React Query (TanStack Query), Tailwind CSS.

---

### Task 1: Integrate `useGetIssue` Hook

**Files:**
- Modify: `src/pages/issues/detail/index.tsx`

**Step 1: Import the hook**
Add `import { useGetIssue } from '../hooks/use-get-issue';` to imports.

**Step 2: Invoke the hook**
Inside `IssueDetailPage`, call `const { data: fetchedIssueData, isLoading: isFetching } = useGetIssue(projectId, issueId);`.

**Step 3: Update display logic**
Create a `currentIssue` variable that prioritizes `fetchedIssueData.data` over the `issue` prop.
```typescript
const currentIssue = fetchedIssueData?.data || issue;
```
Update the UI to use `currentIssue` for all display fields (title, author, dates, etc.).

**Step 4: Verify initial render**
Ensure the title and header still show up immediately using the prop data.

**Step 5: Commit**
```bash
git add src/pages/issues/detail/index.tsx
git commit -m "feat(issues): integrate useGetIssue hook in detail page"
```

---

### Task 2: Synchronize Component State

**Files:**
- Modify: `src/pages/issues/detail/index.tsx`

**Step 1: Add synchronization effect**
Add a `useEffect` to update local states when `fetchedIssueData` changes.
```typescript
useEffect(() => {
  if (fetchedIssueData?.data) {
    const data = fetchedIssueData.data;
    setDescription(data.description);
    setStatus(data.state === 'closed' ? 'closed' : 'opened');
    setSelectedAssignee(data.assignees?.[0] ? {
      id: String(data.assignees[0].id),
      name: data.assignees[0].name,
      username: data.assignees[0].username,
      avatarUrl: data.assignees[0].avatar_url,
      webUrl: data.assignees[0].web_url,
      state: data.assignees[0].state,
    } : undefined);
    setSelectedLabels(data.label_details ? data.label_details.map(l => ({
      id: String(l.id),
      name: l.name,
      color: l.color,
      textColor: l.text_color,
      description: l.description,
    })) : (data.labels || []).map(l => ({
      id: String(l),
      name: String(l),
      color: '#ccc',
      textColor: '#000',
      description: '',
    })));
  }
}, [fetchedIssueData]);
```

**Step 2: Handle description loading state**
Wrap the `MarkdownRenderer` in the description section with a skeleton if `isFetching` is true and `issue.description` is empty.

**Step 3: Commit**
```bash
git add src/pages/issues/detail/index.tsx
git commit -m "feat(issues): sync local state with fetched issue data"
```

---

### Task 3: Verification and Cleanup

**Step 1: Verify Dashboard flow**
Navigate from Dashboard to an issue. Verify description appears even if Dashboard data was partial.

**Step 2: Verify Boards flow**
Navigate from Boards to an issue. Verify labels and description are correct.

**Step 3: Run lint and typecheck**
Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**
```bash
git commit --allow-empty -m "test(issues): verify data synchronization across entry points"
```
