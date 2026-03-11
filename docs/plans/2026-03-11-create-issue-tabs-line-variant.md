# Create Issue Page Tabs Line Variant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the "line" variant to the Tabs component on the Create Issue page to match the new design language.

**Architecture:** Update the `TabsList` and `TabsTrigger` components in the `CreateIssuePage` to use the `variant="line"` prop provided by the UI library.

**Tech Stack:** React, Tailwind CSS, Lucide React, shadcn/ui (Tabs component).

---

### Task 1: Update Create Issue Page Tabs

**Files:**
- Modify: `src/pages/issues/create/index.tsx`

**Step 1: Update TabsList and TabsTrigger variant**

Change:
```tsx
        <Tabs defaultValue="issue" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="issue">Issue</TabsTrigger>
            <TabsTrigger value="child">Issue with Child</TabsTrigger>
            <TabsTrigger value="ac" disabled>
              From Acceptance Criteria
            </TabsTrigger>
          </TabsList>
```
To:
```tsx
        <Tabs defaultValue="issue" className="w-full">
          <TabsList className="mb-6" variant="line">
            <TabsTrigger value="issue" variant="line">Issue</TabsTrigger>
            <TabsTrigger value="child" variant="line">Issue with Child</TabsTrigger>
            <TabsTrigger value="ac" variant="line" disabled>
              From Acceptance Criteria
            </TabsTrigger>
          </TabsList>
```

**Step 2: Verify changes**
Check that the layout renders correctly without syntax errors. (Since I cannot see the UI, I will verify the code structure).

**Step 3: Commit**

```bash
git add src/pages/issues/create/index.tsx docs/plans/2026-03-11-create-issue-tabs-line-variant-design.md docs/plans/2026-03-11-create-issue-tabs-line-variant.md
git commit -m "style: apply line variant to Create Issue page tabs"
```
