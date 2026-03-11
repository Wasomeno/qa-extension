# Design: Unify Filter and Search Bar Styling

## Overview
Standardize the styling of search bars and project filters across the application to match the "Issues" page design. This involves updating shared components and page-level overrides to use `rounded-xl` (12px), `bg-white`, and `border-theme-border`.

## Proposed Changes

### 1. Shared Components

#### `SearchablePicker` (`src/pages/issues/components/searchable-picker.tsx`)
*   Change the default border from `border-gray-200` to `border-theme-border`.
*   Ensure it consistently uses `rounded-xl` and `bg-white`.

#### `ProjectFilter` (`src/pages/boards/components/project-filter.tsx`)
*   Update the `Button` trigger to use `rounded-xl`, `bg-white`, and `border-theme-border`.
*   Remove `variant="outline"` to avoid styling conflicts.

### 2. Page-level Updates

#### `RecordingsPage` (`src/pages/recordings/recordings-list.tsx`)
*   Update search `Input`: Change `bg-gray-100`, `border-none`, and `rounded-lg` to `bg-white`, `border-theme-border`, and `rounded-xl`.
*   Remove the `bg-gray-100 border-none` overrides passed to `SearchablePicker`.

#### `TestScenariosPage` (`src/pages/test-scenarios/scenarios-list.tsx`)
*   Update search `Input`: Change `bg-gray-100`, `border-none`, and `rounded-lg` to `bg-white`, `border-theme-border`, and `rounded-xl`.
*   Remove the `bg-gray-100 border-none` overrides passed to `SearchablePicker`.

#### `IssueFilterBar` (`src/pages/issues/components/filter-bar.tsx`)
*   Ensure the `Input` uses `border-theme-border` and `rounded-xl` (already mostly aligned, but will verify).

## Testing Plan
*   Verify the visual appearance of search bars and project filters on the following pages:
    *   Issues List
    *   Issue Boards
    *   Test Recordings
    *   Test Scenarios
*   Check for responsiveness and hover states.
