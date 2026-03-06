# Automation Test Recordings Refactoring Design

## Goal
Transform the "Recordings" list and compact list views to look and feel like an automation test suite rather than a generic video recording library.

## Visual Language Updates
- **Terminology**: Replace "Recordings" with "Test Scripts" or "Automations" throughout the UI (headers, empty states, tooltips).
- **Grid View Placeholder**: Replace the `aspect-video` placeholder with a visual representation of a test script (e.g., code-like lines or a `Terminal` / `FileCode` icon) instead of a generic `FileText` icon inside a video-like box.
- **Primary Action**: Change the dominant "Play" action (which implies video playback) to a "Run Test" or "Execute" action. Use icons like `Zap`, `Terminal`, or a smaller `Play` icon labeled "Run Test".
- **List View Styling**: Adjust the list view to feel more like a file explorer or a test suite summary. Emphasize step counts and potential execution status or metadata.
- **Icons**: Use test-centric icons (`Terminal`, `Code`, `Zap`, `CheckCircle`) instead of generic file or video icons (`FileText`, `LayoutGrid` without context).

## Components Affected
- `src/pages/recordings/recordings-list.tsx`
- `src/pages/recordings/components/recording-item.tsx`
- (Potentially) related components like `details-panel.tsx` and `folder-item.tsx` to maintain consistency.

## Testing & Validation
- Ensure the refactored UI components render correctly in both grid and list views.
- Verify that the core functionalities (Rename, Delete, Run, Export) are still easily accessible and correctly linked to the new visual elements.
- Check that the terminology is consistently applied.
