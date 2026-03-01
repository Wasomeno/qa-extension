# Design Doc: Relocate Global Reload Trigger

**Date**: 2026-03-02
**Topic**: Move reload trigger from top-right to bottom-right of the main menu modal.

## Summary

The global data refresh trigger in the main menu modal is currently located at the top-right of the content area. We'll relocate it to the bottom-right of the content area to improve the layout and fulfill the user's request.

## Design

The reload trigger is a button that invalidates TanStack Query queries. It is wrapped in a `TooltipProvider` and positioned absolutely within the relative container of the content area.

### Changes

- **File**: `src/components/floating-trigger/components/main-menu-modal.tsx`
- **Component**: `MainMenuInner`
- **Location**: Update the wrapper `div` of the reload button from `absolute top-4 right-4 z-[60]` to `absolute bottom-4 right-4 z-[60]`.

## Success Criteria

- The reload trigger appears at the bottom-right of the main menu content area.
- The button functionality (refresh data) remains unchanged.
- The tooltip remains functional and positioned correctly (`side="left"`).
