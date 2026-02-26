# Design: Issue Filter Bar Reorganization

This document outlines the changes to reorganize the search and filter UI in the Issues page.

## Goal
Move the search bar to the top (full width) and place the label pickers, project pickers, and sort options in a row below it, each taking equal width.

## Changes

### 1. `IssueFilterBar` Component Re-layout
- **File**: `src/pages/issues/components/filter-bar.tsx`
- **Current Layout**: Single horizontal flex row for search + 3 filters.
- **New Layout**: 
    - Outer container: `flex flex-col gap-4`.
    - Row 1: Search input (full width).
    - Row 2: Grid container (`grid grid-cols-3 gap-3`) containing:
        - Project Picker
        - Label Picker
        - Sort Select
- **Styling**: Remove fixed widths (`w-[200px]`, `min-w-[140px]`) from individual picker containers to allow them to fill grid cells equally.

## Success Criteria
- Search bar is on its own row at the top.
- Project, Label, and Sort filters are on the second row.
- Each of the three filters on the second row has the same width.
- Layout is responsive and preserves existing functionality.
