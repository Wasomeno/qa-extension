# Dashboard Color Adjustment (Dark and Neutral) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace blue, purple, and orange accents in the dashboard with a dark, neutral, and high-contrast palette using the `theme-text` (#0b1220) color.

**Architecture:** Update the activity feed configuration logic to use tiered grayscale values from the `secondary` palette and apply `theme-text` to interactive elements.

**Tech Stack:** React, Tailwind CSS, Lucide Icons.

---

### Task 1: Update Activity Feed Color Configuration

**Files:**
- Modify: `src/pages/dashboard/components/activity-item.tsx`

**Step 1: Write the minimal implementation for new color tiers**

```typescript
// Inside getActionConfig function in src/pages/dashboard/components/activity-item.tsx
const getActionConfig = (type: ActivityFeedItem['action_type']) => {
  switch (type) {
    case 'comment':
      return {
        label: 'commented on',
        icon: MessageSquare,
        color: 'text-secondary-900',
        bg: 'bg-secondary-100',
        border: 'border-secondary-200',
      };
    case 'system_note':
      return {
        label: 'updated status',
        icon: Settings2,
        color: 'text-secondary-700',
        bg: 'bg-secondary-50',
        border: 'border-secondary-100',
      };
    case 'issue_update':
      return {
        label: 'updated',
        icon: RefreshCw,
        color: 'text-secondary-500',
        bg: 'bg-gray-50',
        border: 'border-gray-100',
      };
    default:
      return {
        label: 'interacted with',
        icon: RefreshCw,
        color: 'text-gray-400',
        bg: 'bg-gray-50',
        border: 'border-gray-100',
      };
  }
};
```

**Step 2: Commit**

```bash
git add src/pages/dashboard/components/activity-item.tsx
git commit -m "feat(dashboard): neutralize activity feed action colors"
```

### Task 2: Apply High-Contrast Highlights

**Files:**
- Modify: `src/pages/dashboard/components/activity-item.tsx`

**Step 1: Update hover states to use theme-text**

Change:
- `group-hover:text-blue-600` -> `group-hover:text-theme-text`
- `hover:text-blue-500` -> `hover:text-theme-text`

**Step 2: Commit**

```bash
git add src/pages/dashboard/components/activity-item.tsx
git commit -m "feat(dashboard): use theme-text for activity highlights"
```

### Task 3: Global Dashboard Style Polish

**Files:**
- Modify: `src/pages/dashboard/index.tsx`
- Modify: `src/pages/dashboard/components/stat-card.tsx`

**Step 1: Check StatCard usage in Dashboard**

Review `src/pages/dashboard/index.tsx` for any `StatCard` usage and ensure colors are neutral.

**Step 2: Update StatCard if necessary**

If any blue text colors are found in Dashboard stats, update them to `text-theme-text`.

**Step 3: Commit**

```bash
git add src/pages/dashboard/index.tsx src/pages/dashboard/components/stat-card.tsx
git commit -m "feat(dashboard): ensure all dashboard components use neutral colors"
```

### Task 4: Final Verification

**Step 1: Run build to verify Tailwind classes**

Run: `npm run build` (or equivalent build command)
Expected: Success

**Step 2: Manual Check (Simulated)**

Verify all blue accents are gone and replaced by grays or the dark theme-text color.
