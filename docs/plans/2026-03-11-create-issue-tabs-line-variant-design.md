# Design: Apply Line Variant to Create Issue Page

## Overview
The goal is to update the `Tabs` component usage in the `CreateIssuePage` to use the newly introduced `"line"` variant. This variant provides a more modern, underlined look for tabs, which is being standardized across the application.

## Components Involved
- `src/pages/issues/create/index.tsx`: The main page for creating issues, which contains the `Tabs` component.
- `src/components/ui/tabs.tsx`: The UI component that provides the `"line"` variant.

## Design Details
The `"line"` variant in `TabsList` and `TabsTrigger` will be applied.

### Proposed Changes in `src/pages/issues/create/index.tsx`
- Set `variant="line"` on the `TabsList` component.
- Set `variant="line"` on each `TabsTrigger` component.

### Layout Considerations
The `"line"` variant for `TabsList` includes `w-full`, `justify-start`, `bg-transparent`, and `border-b`. This will change the visual layout from a contained, pill-like background to a full-width underlined style. The `mb-6` on `TabsList` will be preserved to maintain spacing from the content below.

## Verification Plan
- Verify that the tabs are now underlined and full-width.
- Verify that the active tab has a thicker, dark underline.
- Verify that the layout remains clean and aligned with the page header.
- Verify that the "disabled" state of the "From Acceptance Criteria" tab still works correctly.
