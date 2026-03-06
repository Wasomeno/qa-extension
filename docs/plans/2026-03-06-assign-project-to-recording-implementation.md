# Assign Project to Recording Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a feature to assign projects to recordings directly from list views.

**Architecture:** Create a `RecordingProjectPicker` component using `Popover` and `Command` (or similar list) pattern, and integrate it into `RecordingItem` and `CompactRecordingsList`.

**Tech Stack:** React, `@tanstack/react-query`, `lucide-react`, existing API utilities.

---

### Task 1: Create RecordingProjectPicker Component

**Files:**
- Create: `src/pages/recordings/components/recording-project-picker.tsx`

**Step 1: Define component structure**
```tsx
import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  currentProjectId?: string | number;
  projects: any[];
  onSelect: (projectId: number | null) => void;
  portalContainer?: HTMLElement | null;
}

export const RecordingProjectPicker: React.FC<Props> = ({ currentProjectId, projects, onSelect, portalContainer }) => {
  const [open, setOpen] = useState(false);
  const selectedProject = projects.find(p => p.id.toString() === currentProjectId?.toString());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-6 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
           {selectedProject ? selectedProject.name : 'Unassigned'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" container={portalContainer}>
        <ScrollArea className="h-[200px]">
           <div className="p-1">
             <div className="px-2 py-1.5 text-xs text-gray-500 cursor-pointer hover:bg-gray-100" onClick={() => { onSelect(null); setOpen(false); }}>
               Unassigned
             </div>
             {projects.map(project => (
               <div key={project.id} className="flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100" onClick={() => { onSelect(project.id); setOpen(false); }}>
                 {project.name}
               </div>
             ))}
           </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
```

**Step 2: Commit**
```bash
git add src/pages/recordings/components/recording-project-picker.tsx
git commit -m "feat(recordings): add RecordingProjectPicker component"
```

### Task 2: Integrate RecordingProjectPicker into RecordingItem

**Files:**
- Modify: `src/pages/recordings/components/recording-item.tsx`

**Step 1: Import and replace badge**
In `RecordingItem`, add import for `RecordingProjectPicker`. Locate the project badge rendering code and replace it with `RecordingProjectPicker`.
Handle `onUpdateProject` callback props to trigger the update.

**Step 2: Commit**
```bash
git add src/pages/recordings/components/recording-item.tsx
git commit -m "feat(recordings): integrate RecordingProjectPicker in RecordingItem"
```

### Task 3: Integrate RecordingProjectPicker into CompactRecordingsList

**Files:**
- Modify: `src/pages/recordings/components/compact-list.tsx`

**Step 1: Replace text with picker**
Import `RecordingProjectPicker` and replace the "Project #id" text with the new component. Pass the project update handler.

**Step 2: Commit**
```bash
git add src/pages/recordings/components/compact-list.tsx
git commit -m "feat(recordings): integrate RecordingProjectPicker in CompactRecordingsList"
```

### Task 4: Verify Implementation

**Steps:**
1. Open the recordings list.
2. Select a project for an unassigned recording.
3. Verify the project name updates and the API request is sent.
4. Refresh and ensure the project persists.
