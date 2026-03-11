# Design: Create Issue Page Styling Alignment

## Overview
This design outlines the changes required to align the styling of inputs and pickers on the "Create Issue" page with the filter triggers and search inputs on the "Issues" page.

## Reference Styles (Issues Page)
- **Background**: `bg-white`
- **Border**: `border-theme-border`
- **Border Radius**: `rounded-xl`
- **Focus**: `focus:ring-blue-500/20 focus:border-blue-500`

## Components to Update

### 1. `ProjectPicker` (`src/pages/issues/create/components/project-picker.tsx`)
- Update `Button` (trigger) className:
  - Remove: `bg-gray-50 border-gray-200 hover:bg-gray-100`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50`

### 2. `LabelPicker` (`src/pages/issues/create/components/label-picker.tsx`)
- Update `Button` (trigger) className:
  - Remove: `bg-gray-50 border-gray-200 hover:bg-gray-100`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50`

### 3. `AssigneePicker` (`src/pages/issues/create/components/assignee-picker.tsx`)
- Update `Button` (trigger) className:
  - Remove: `bg-gray-50 border-gray-200 hover:bg-gray-100`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50`

### 4. `RecordingPicker` (`src/pages/issues/create/components/recording-picker.tsx`)
- Update `Button` (trigger) className:
  - Remove: `bg-gray-50 border-gray-200 hover:bg-white`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50`

### 5. `DescriptionEditor` (`src/pages/issues/create/components/description-editor.tsx`)
- Update main container `div` className:
  - Remove: `bg-gray-50 border-gray-200`
  - Add: `bg-white border-theme-border rounded-xl`
- Update Toolbar `div` className:
  - Remove: `bg-gray-50/80 border-gray-200`
  - Add: `bg-white/80 border-theme-border`

### 6. `IssueFormFields` (`src/pages/issues/create/components/issue-form-fields.tsx`)
- Update Title `Input` className:
  - Remove: `bg-gray-50 border-gray-200`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500`

### 7. `ChildIssueFormFields` (`src/pages/issues/detail/components/child-issue-form-fields.tsx`)
- Update Title `Input` className:
  - Remove: `bg-gray-50 border-gray-200 focus:bg-white`
  - Add: `bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500`

## Success Criteria
- All inputs and pickers on the Create Issue page (and child issue forms) should have white backgrounds.
- All inputs should use `border-theme-border` and `rounded-xl` border radius.
- Consistent focus states across all inputs.
