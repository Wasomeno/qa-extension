# Design: Main Menu Modal Size Reduction

## Overview
Reduce the dimensions of the Main Menu Modal by 10% to improve visual balance and usability.

## Proposed Changes
Update the dimensions in `src/components/floating-trigger/components/main-menu-modal.tsx`:

| Parameter | Original | New (10% Reduction) |
|-----------|----------|---------------------|
| `MODAL_WIDTH` | `1200px` | `1080px` |
| `MODAL_HEIGHT` | `840px` | `756px` |
| `MODAL_MAX_WIDTH` | `98vw` | `88vw` |
| `MODAL_MAX_HEIGHT` | `95vh` | `85vh` |

## Impact
- The modal will occupy less screen real estate.
- Content within pages (Dashboard, Issues, etc.) will have slightly less space but should remain functional given the responsive nature of the components.
- Centering logic remains unchanged.

## Testing
- Verify that the modal opens with the new dimensions.
- Ensure that the modal remains centered in the viewport.
- Check that all menu items and content pages are still readable and accessible.
