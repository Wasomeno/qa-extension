# Relocate Global Reload Trigger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal**: Move the global data refresh trigger in the main menu modal from the top-right to the bottom-right of the content area.

**Architecture**: The refresh button is absolutely positioned within the relative container of the content area. We'll update its Tailwind CSS classes.

**Tech Stack**: React, Tailwind CSS, Lucide React (icons), TanStack Query.

---

### Task 1: Update Reload Trigger Position

**Files**:
- Modify: `src/components/floating-trigger/components/main-menu-modal.tsx:325-344`

**Step 1: Update the positioning classes**

```tsx
<<<<
                {/* Global Refresh Icon */}
                <div className="absolute top-4 right-4 z-[60]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
====
                {/* Global Refresh Icon */}
                <div className="absolute bottom-4 right-4 z-[60]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
>>>>
```

**Step 2: Verify the change**

Ensure the `div` wrapper for the `TooltipProvider` now uses `bottom-4` instead of `top-4`.

**Step 3: Commit**

```bash
git add src/components/floating-trigger/components/main-menu-modal.tsx
git commit -m "feat(ui): move global reload trigger to bottom-right"
```

### Task 2: Verify Tooltip and Functionality

**Step 1: Check Tooltip position**

The tooltip should still appear on the left (`side="left"`).

**Step 2: Verify button functionality**

Ensure the `onClick={handleRefresh}` still works as expected.

**Step 3: Commit**

```bash
git commit --amend --no-edit
```
