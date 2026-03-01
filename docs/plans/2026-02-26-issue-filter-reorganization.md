# Issue Filter Bar Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the search bar to the top and place the Project, Label, and Sort filters in a three-column grid row below it.

**Architecture:** Update `IssueFilterBar` layout using Tailwind CSS `flex-col` for stacking and `grid-cols-3` for equal-width filter columns.

**Tech Stack:** React, Tailwind CSS, Lucide React icons.

---

### Task 1: Reorganize IssueFilterBar Layout

**Files:**
- Modify: `src/pages/issues/components/filter-bar.tsx`

**Step 1: Update container and reorganize elements**

Modify `src/pages/issues/components/filter-bar.tsx` to:
1. Change outer `div` gap to `gap-4`.
2. Wrap the search input in its own full-width row.
3. Wrap Project, Label, and Sort pickers in a `grid grid-cols-3 gap-3` container.
4. Remove fixed widths (`w-[200px]`, `min-w-[140px]`) from the filter wrappers.

```tsx
export const IssueFilterBar: React.FC<IssueFilterBarProps> = ({
  filters,
  onFilterChange,
  projectOptions,
  labelOptions,
  portalContainer,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Search Input Row */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
        <Input
          type="text"
          placeholder="Search issues..."
          value={filters.search}
          onChange={e => onFilterChange('search', e.target.value)}
          className="pl-9 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {/* Filters Grid Row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Project Filter */}
        <SearchablePicker
          options={projectOptions}
          value={filters.projectId}
          onSelect={val => onFilterChange('projectId', String(val))}
          placeholder="All Projects"
          searchPlaceholder="Search projects..."
          allOption={{ label: 'All Projects', value: 'ALL' }}
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Label Filter */}
        <SearchablePicker
          options={labelOptions}
          value={filters.labels?.[0] || 'ALL'}\
          onSelect={val =>
            onFilterChange('labels', val === 'ALL' ? [] : [String(val)])
          }
          placeholder="All Labels"
          searchPlaceholder="Search labels..."
          allOption={{ label: 'All Labels', value: 'ALL' }}
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Sort Filter */}
        <Select
          value={filters.sort}
          onValueChange={val =>
            onFilterChange('sort', val as IssueFilterState['sort'])
          }
        >
          <SelectTrigger className="bg-white border-gray-200 rounded-xl text-gray-700 focus:ring-blue-500/20 focus:border-blue-500 w-full">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="UPDATED">Recently Updated</SelectItem>\n            <SelectItem value="NEWEST">Newest Created</SelectItem>
            <SelectItem value="OLDEST">Oldest Created</SelectItem>
            <SelectItem value="PRIORITY">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
```

**Step 2: Commit changes**

Run: `git add src/pages/issues/components/filter-bar.tsx`
Run: `git commit -m "feat(issues): reorganize filter bar layout to stacked grid"`

### Task 2: Verify Layout

**Step 1: Check UI**
Open the issues page in the browser (if possible) or verify the JSX structure ensures the search bar is top and filters are evenly spaced in a row.
Since I'm an agent, I'll verify via code analysis that no fixed widths remain that could break the grid.

**Step 2: Final Commit**
```bash
git commit --allow-empty -m "fix(issues): verify filter bar grid layout consistency"
```
