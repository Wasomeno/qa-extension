# Issues List Accordion Adjustment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the project accordion in the issues list when exactly one project is selected, and remove the unsupported "ALL" state from the project picker.

**Architecture:** Update the filtering logic in the `IssuesPage` container to pass a refined `isProjectFiltered` boolean to `IssueList`, and clean up the `IssueFilterBar` to remove the redundant "ALL" option for projects.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

### Task 1: Update IssuesPage State and Props

**Files:**
- Modify: `src/pages/issues/index.tsx`

**Step 1: Update initial state**
Remove `'ALL'` from the initial `projectIds` array.

```tsx
// src/pages/issues/index.tsx

// Old
projectIds: ['ALL'],

// New
projectIds: [],
```

**Step 2: Update isProjectFiltered logic**
Change the condition for `isProjectFiltered` to hide the accordion when exactly one project is selected.

```tsx
// src/pages/issues/index.tsx

// Old
isProjectFiltered={!filters.projectIds.includes('ALL')}

// New
isProjectFiltered={filters.projectIds.length === 1}
```

**Step 3: Verify with existing tests if any**
Run: `npm test src/pages/issues/index.tsx` (if tests exist)

**Step 4: Commit**
```bash
git add src/pages/issues/index.tsx
git commit -m "feat(issues): hide project accordion when exactly one project is selected"
```

---

### Task 2: Remove "ALL" Option from Project Picker

**Files:**
- Modify: `src/pages/issues/components/filter-bar.tsx`

**Step 1: Remove allOption from SearchablePicker**
Remove the `allOption` prop from the project filter `SearchablePicker`.

```tsx
// src/pages/issues/components/filter-bar.tsx

// Old
<SearchablePicker
  multiple
  options={projectOptions}
  value={filters.projectIds}
  onSelect={val => onFilterChange('projectIds', val as string[])}
  placeholder="All Projects"
  searchPlaceholder="Search projects…"
  allOption={{ label: 'All Projects', value: 'ALL' }}
  portalContainer={portalContainer}
  className="w-full"
/>

// New
<SearchablePicker
  multiple
  options={projectOptions}
  value={filters.projectIds}
  onSelect={val => onFilterChange('projectIds', val as string[])}
  placeholder="All Projects"
  searchPlaceholder="Search projects…"
  portalContainer={portalContainer}
  className="w-full"
/>
```

**Step 2: Commit**
```bash
git add src/pages/issues/components/filter-bar.tsx
git commit -m "refactor(issues): remove unsupported 'ALL' option from project picker"
```

---

### Task 3: Final Verification

**Step 1: Run Lint and Typecheck**
Run: `npm run lint && npm run typecheck`

**Step 2: Manual Check (Simulation/Reasoning)**
- No projects selected (`[]`): `length === 0` → `isProjectFiltered === false` → Accordion shows.
- 1 project selected (`['p1']`): `length === 1` → `isProjectFiltered === true` → Flat list (No accordion).
- 2 projects selected (`['p1', 'p2']`): `length === 2` → `isProjectFiltered === false` → Accordion shows.
