# Create Issue Styling Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the styling of all inputs and pickers on the Create Issue page with the filter triggers on the Issues page.

**Architecture:** Update Tailwind CSS classes in React components to use white backgrounds, theme borders, and rounded-xl corners.

**Tech Stack:** React, Tailwind CSS, Lucide React (icons)

---

### Task 1: Update ProjectPicker Styling
**Files:**
- Modify: `src/pages/issues/create/components/project-picker.tsx`

**Step 1: Update Trigger Button Classes**
Change the trigger button to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-900"
// new
className="w-full justify-between text-left font-normal bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 hover:text-gray-900 transition-all"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/project-picker.tsx
git commit -m "style: update ProjectPicker styling to match filter triggers"
```

### Task 2: Update LabelPicker Styling
**Files:**
- Modify: `src/pages/issues/create/components/label-picker.tsx`

**Step 1: Update Trigger Button Classes**
Change the trigger button to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="h-auto py-2 px-3 w-full justify-start text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 relative min-h-[42px]"
// new
className="h-auto py-2 px-3 w-full justify-start text-left font-normal bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 relative min-h-[42px] transition-all"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/label-picker.tsx
git commit -m "style: update LabelPicker styling to match filter triggers"
```

### Task 3: Update AssigneePicker Styling
**Files:**
- Modify: `src/pages/issues/create/components/assignee-picker.tsx`

**Step 1: Update Trigger Button Classes**
Change the trigger button to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100"
// new
className="w-full justify-between text-left font-normal bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 transition-all"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/assignee-picker.tsx
git commit -m "style: update AssigneePicker styling to match filter triggers"
```

### Task 4: Update RecordingPicker Styling
**Files:**
- Modify: `src/pages/issues/create/components/recording-picker.tsx`

**Step 1: Update Trigger Button Classes**
Change the trigger button to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="w-full justify-between bg-gray-50 border-gray-200 hover:bg-white transition-all font-normal"
// new
className="w-full justify-between bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 transition-all font-normal"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/recording-picker.tsx
git commit -m "style: update RecordingPicker styling to match filter triggers"
```

### Task 5: Update DescriptionEditor Styling
**Files:**
- Modify: `src/pages/issues/create/components/description-editor.tsx`

**Step 1: Update Main Container and Toolbar Classes**
Change the container to use `bg-white`, `border-theme-border`, and `rounded-xl`.
Change the toolbar to use `bg-white/80` and `border-theme-border`.
```tsx
// old (container)
className="border border-gray-200 rounded-xl bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden flex flex-col shadow-sm "
// new (container)
className="border border-theme-border rounded-xl bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all overflow-hidden flex flex-col shadow-sm"

// old (toolbar)
className="flex flex-wrap items-center gap-1 p-1.5 bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10 backdrop-blur-sm"
// new (toolbar)
className="flex flex-wrap items-center gap-1 p-1.5 bg-white/80 border-b border-theme-border sticky top-0 z-10 backdrop-blur-sm"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/description-editor.tsx
git commit -m "style: update DescriptionEditor styling to match filter triggers"
```

### Task 6: Update IssueFormFields Title Input Styling
**Files:**
- Modify: `src/pages/issues/create/components/issue-form-fields.tsx`

**Step 1: Update Title Input Classes**
Change the input to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="bg-gray-50 border-gray-200"
// new
className="bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500"
```

**Step 2: Commit**
```bash
git add src/pages/issues/create/components/issue-form-fields.tsx
git commit -m "style: update Title Input styling in IssueFormFields"
```

### Task 7: Update ChildIssueFormFields Title Input Styling
**Files:**
- Modify: `src/pages/issues/detail/components/child-issue-form-fields.tsx`

**Step 1: Update Title Input Classes**
Change the input to use `bg-white`, `border-theme-border`, and `rounded-xl`.
```tsx
// old
className="h-9 text-sm bg-gray-50 border-gray-200 focus:bg-white transition-colors"
// new
className="h-9 text-sm bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
```

**Step 2: Commit**
```bash
git add src/pages/issues/detail/components/child-issue-form-fields.tsx
git commit -m "style: update Title Input styling in ChildIssueFormFields"
```
