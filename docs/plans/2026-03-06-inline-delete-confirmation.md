# Inline Delete Confirmation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline confirmation UI for deleting recordings in both `RecordingItem` and `CompactRecordingsList`.

**Architecture:** Use local component state to toggle between standard display/actions and a confirmation view.

**Tech Stack:** React, Lucide-react (Check/X icons), Tailwind CSS.

---

### Task 1: Add Inline Delete Confirmation to RecordingItem

**Files:**
- Modify: `src/pages/recordings/components/recording-item.tsx`

**Step 1: Add confirmation state**

```typescript
const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
```

**Step 2: Update Actions menu to trigger confirmation**

```typescript
<DropdownMenuItem
  className="gap-2 text-red-600 focus:text-red-600"
  onClick={(e) => {
    e.stopPropagation();
    setIsConfirmingDelete(true);
  }}
>
  <Trash2 className="w-4 h-4" /> Delete
</DropdownMenuItem>
```

**Step 3: Implement confirmation UI overlay**

Add an overlay or replace the content when `isConfirmingDelete` is true. For the list view, we can replace the action buttons. For the grid view, we can show an overlay on the card.

**Step 4: Commit**

```bash
git add src/pages/recordings/components/recording-item.tsx
git commit -m "feat: add inline delete confirmation to RecordingItem"
```

### Task 2: Add Inline Delete Confirmation to CompactRecordingsList

**Files:**
- Modify: `src/pages/recordings/components/compact-list.tsx`

**Step 1: Add confirmation state tracking ID**

```typescript
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
```

**Step 2: Update delete button to trigger confirmation**

```typescript
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
  onClick={e => {
    e.stopPropagation();
    setConfirmDeleteId(rec.id);
  }}
>
  <Trash2 className="w-3.5 h-3.5" />
</Button>
```

**Step 3: Render confirmation buttons instead of actions when ID matches**

```typescript
{confirmDeleteId === rec.id ? (
  <div className="flex items-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-[10px] text-red-600 hover:bg-red-50"
      onClick={e => {
        e.stopPropagation();
        handleDelete(rec.id);
        setConfirmDeleteId(null);
      }}
    >
      Confirm
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-[10px] text-gray-500 hover:bg-gray-100"
      onClick={e => {
        e.stopPropagation();
        setConfirmDeleteId(null);
      }}
    >
      Cancel
    </Button>
  </div>
) : (
  // existing actions
)}
```

**Step 4: Commit**

```bash
git add src/pages/recordings/components/compact-list.tsx
git commit -m "feat: add inline delete confirmation to CompactRecordingsList"
```

### Task 3: Verification

**Step 1: Run Lint**

Run: `npx eslint src/pages/recordings/components/recording-item.tsx src/pages/recordings/components/compact-list.tsx`
Expected: exit 0

**Step 2: Final Commit**

```bash
git commit -m "chore: final verification for delete confirmation feature"
```
