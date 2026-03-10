# Project Selector Organization Name Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the project selector to display projects in the format "Organization Name / Project Name".

**Architecture:** Update the `FilterableProject` interface and `ProjectFilter` component to utilize `name_with_namespace`.

**Tech Stack:** React, TypeScript.

---

### Task 1: Update FilterableProject Interface

**Files:**
- Modify: `src/pages/boards/components/project-filter.tsx`

**Step 1: Update interface**
```typescript
export interface FilterableProject {
  id: number | string;
  name: string;
  name_with_namespace?: string; // Add this
  avatar_url?: string;
  avatarUrl?: string;
}
```

### Task 2: Update ProjectFilter Rendering

**Files:**
- Modify: `src/pages/boards/components/project-filter.tsx`

**Step 1: Update display logic**
In `ProjectFilter`, change the rendering of project name:

```tsx
// Inside ProjectFilter, in the CommandItem map
<span className=\"truncate\">{project.name_with_namespace || project.name}</span>
```

And in `PopoverTrigger`:
```tsx
<span className=\"truncate\">{selectedProject.name_with_namespace || selectedProject.name}</span>
```

### Task 3: Ensure data passed from BoardsPage

**Files:**
- Modify: `src/pages/boards/index.tsx`

**Step 1: Map project data to FilterableProject**
In `BoardsPage`, ensure projects passed to `ProjectFilter` include `name_with_namespace`.

```tsx
<ProjectFilter
  projects={projects.map(p => ({
    id: p.id,
    name: p.name,
    name_with_namespace: p.name_with_namespace,
    avatar_url: p.avatar_url
  }))}
  ...
/>
```

### Task 4: Verify and Commit

**Step 1: Run build**
Run: `npm run build`
Expected: PASS

**Step 2: Commit**
Run:
```bash
git add src/pages/boards/components/project-filter.tsx src/pages/boards/index.tsx
git commit -m "feat: display organization name in project selector"
```
