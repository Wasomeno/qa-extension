# Unify Filter and Search Bar Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize the styling of search bars and project filters across the application to match the "Issues" page design (rounded-xl, bg-white, border-theme-border).

**Architecture:** Update shared components (`SearchablePicker`, `ProjectFilter`) to use the new default styles and adjust page-level overrides in `RecordingsPage` and `TestScenariosPage`.

**Tech Stack:** React, Tailwind CSS, Lucide icons.

---

### Task 1: Update `SearchablePicker` shared component

**Files:**
- Modify: `src/pages/issues/components/searchable-picker.tsx`

**Step 1: Update default styles**

```tsx
// src/pages/issues/components/searchable-picker.tsx
// Replace:
// 'w-[200px] justify-between bg-white border-gray-200 rounded-xl text-gray-700 font-normal hover:bg-gray-50',
// With:
'w-[200px] justify-between bg-white border-theme-border rounded-xl text-theme-text font-normal hover:bg-gray-50',
```

**Step 2: Commit**

```bash
git add src/pages/issues/components/searchable-picker.tsx
git commit -m "style: update SearchablePicker default border and text color"
```

---

### Task 2: Update `ProjectFilter` shared component (Boards)

**Files:**
- Modify: `src/pages/boards/components/project-filter.tsx`

**Step 1: Update Button trigger styles**

```tsx
// src/pages/boards/components/project-filter.tsx
// Replace:
// <Button
//   variant="outline"
//   role="combobox"
//   aria-expanded={open}
//   className={cn('w-[250px] justify-between', className)}
// >
// With:
<Button
  role="combobox"
  aria-expanded={open}
  className={cn(
    'w-[250px] justify-between bg-white border-theme-border rounded-xl text-theme-text font-normal hover:bg-gray-50 h-10',
    className
  )}
>
```

**Step 2: Commit**

```bash
git add src/pages/boards/components/project-filter.tsx
git commit -m "style: update ProjectFilter trigger to match unified design"
```

---

### Task 3: Standardize `RecordingsPage` styling

**Files:**
- Modify: `src/pages/recordings/recordings-list.tsx`

**Step 1: Update search Input and SearchablePicker usage**

```tsx
// src/pages/recordings/recordings-list.tsx

// Update Input:
// Replace:
// className="pl-9 w-64 h-10 bg-gray-100 border-none rounded-lg focus-visible:ring-2 focus-visible:ring-zinc-900"
// With:
className="pl-9 w-64 h-10 bg-white border-theme-border rounded-xl focus-visible:ring-2 focus-visible:ring-zinc-900"

// Update SearchablePicker:
// Remove:
// className="h-10 w-[180px] bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-zinc-900 pointer-events-auto"
// (Let it use the new default styles)
```

**Step 2: Commit**

```bash
git add src/pages/recordings/recordings-list.tsx
git commit -m "style: standardize RecordingsPage search and filter styling"
```

---

### Task 4: Standardize `TestScenariosPage` styling

**Files:**
- Modify: `src/pages/test-scenarios/scenarios-list.tsx`

**Step 1: Update search Input and SearchablePicker usage**

```tsx
// src/pages/test-scenarios/scenarios-list.tsx

// Update Input:
// Replace:
// className="pl-9 w-64 h-10 bg-gray-100 border-none rounded-lg focus-visible:ring-2 focus-visible:ring-zinc-900"
// With:
className="pl-9 w-64 h-10 bg-white border-theme-border rounded-xl focus-visible:ring-2 focus-visible:ring-zinc-900"

// Update SearchablePicker:
// Remove:
// className="h-10 w-[180px] bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-zinc-900 pointer-events-auto"
// (Let it use the new default styles)
```

**Step 2: Commit**

```bash
git add src/pages/test-scenarios/scenarios-list.tsx
git commit -m "style: standardize TestScenariosPage search and filter styling"
```

---

### Task 5: Verify all pages

**Step 1: Manual Verification**
Check the following pages in the UI:
1. Issues List
2. Issue Boards
3. Test Recordings
4. Test Scenarios

**Step 2: Check for styling regressions**
Ensure that the hover states and focus rings still look correct on all modified components.
