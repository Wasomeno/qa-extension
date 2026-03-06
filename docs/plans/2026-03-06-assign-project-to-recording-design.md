# Design Doc: Assign Project to Recording Feature

## Overview
Implement a feature to assign projects to test recordings directly from the recording lists (grid and list views).

## Goals
- Provide an intuitive UI to assign/change the project of a recording.
- Support both main recordings page and compact list view.
- Maintain consistent UI patterns with existing project pickers.

## UI Components
- **`RecordingProjectPicker`**: A popover-based searchable project selector.
- **Recording Item Changes**: Update `RecordingItem` and `CompactRecordingsList` to replace static badges with `RecordingProjectPicker`.

## Data Flow
- Use `getProjects` to retrieve project options.
- Update project via `MessageType.UPDATE_BLUEPRINT` on change.
- Refresh recording state (e.g., refetching `blueprints`) on successful update.

## Implementation Steps
1. Create `RecordingProjectPicker` component.
2. Integrate `RecordingProjectPicker` into `RecordingItem`.
3. Integrate `RecordingProjectPicker` into `CompactRecordingsList`.
4. Add project update handlers.
5. Verify behavior with testing.
