# Design: Include Organization Name in Project Selector

## Problem
The current project selector in the board view only displays the project name, making it difficult to distinguish between projects with similar names across different organizations or groups.

## Goal
Update the project selector to display projects in the format "Organization Name / Project Name".

## Proposed Design
1.  **Interface Update**: Update `FilterableProject` in `src/pages/boards/components/project-filter.tsx` to include `name_with_namespace: string;`.
2.  **Rendering Update**: Update the `ProjectFilter` component to prefer `name_with_namespace` over `name` when rendering project labels.
3.  **Data Flow**: Ensure that `BoardsPage` passes the `name_with_namespace` property to `ProjectFilter` when available.

## Implementation Details
-   Update `FilterableProject` interface.
-   Refactor `ProjectFilter` to use `project.name_with_namespace || project.name`.
-   Verify that all usages of `ProjectFilter` correctly pass the data.
