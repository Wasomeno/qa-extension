# Design Document: Tabs Line Variant

## Problem Statement
The Create Issue page currently uses the default "pill" style for tabs. We want to update it to use a "line" style variant, which is more appropriate for main page navigation and consistent with other parts of the application (like `ScenarioDetail`).

## Proposed Solution
Add a `variant` prop to the `TabsList` and `TabsTrigger` components in `src/components/ui/tabs.tsx`. This allows for a reusable "line" style across the project.

### Architecture & Components

#### `src/components/ui/tabs.tsx`
- Update `TabsList` to support a `variant` prop.
- Update `TabsTrigger` to support a `variant` prop.
- Define styles for the `line` variant:
    - `TabsList`: Transparent background, no padding, bottom border, gap between items.
    - `TabsTrigger`: No background, no shadow, bottom border on active state, specific text colors.

#### `src/pages/issues/create/index.tsx`
- Update the `Tabs` usage to apply the `line` variant to `TabsList` and `TabsTrigger`.

## Implementation Plan
1.  **Modify `src/components/ui/tabs.tsx`**:
    - Add `variant` prop to `TabsList` and `TabsTrigger` interfaces.
    - Update `cn` calls to include conditional classes based on the `variant`.
2.  **Update `src/pages/issues/create/index.tsx`**:
    - Pass `variant="line"` to `TabsList`.
    - (Optional) Pass `variant="line"` to `TabsTrigger` if needed, or have `TabsList` context handle it if possible. (Note: Since they are separate components, both might need the prop or we can use a Context).

## Verification Plan
- Manually verify the Create Issue page tabs visually match the "line" style.
- Check `ScenarioDetail` to ensure it still looks correct (though it uses local styles currently, it could eventually be refactored to use this new variant).
- Run existing tests to ensure no regressions in tab functionality.
