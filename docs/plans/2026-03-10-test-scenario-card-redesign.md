# Design Document: Test Scenario Card Redesign

## Goal
Improve the visual appearance of the `ScenarioItem` card to be less dense and more professional, following the "Clean Metric Row" approach.

## Current Issues
- Information is stacked vertically with tight spacing.
- Visual weight is distributed evenly, making it hard to scan.
- "Icon soup" contributes to a cluttered feel.

## Proposed Design (Option 1: Clean Metric Row)

### 1. Header Section
- **Title**: Filename in `text-zinc-900` font-semibold.
- **Status**: Move the `Badge` to the top-right corner.
- **Timestamp**: Relative time (e.g., "4 minutes ago") as subtle subtext.

### 2. Metrics Section (Horizontal Row)
- A dedicated area with a subtle top border or background.
- Horizontal layout: `Sheets` | `Test Cases` | `Generated`.
- Use smaller icons (zinc-400) and clear labels.
- "Just text" representation for all metrics (no progress bars).

### 3. Footer Section
- **Project**: Project name at the bottom-left with a subtle icon.
- **Actions**: Keep the Delete/Generate buttons visible on hover in the top-right area (absolute positioning).

## Component Structure
- `ScenarioItem`:
    - `div` (container)
        - `div` (Header: Title + Badge)
        - `div` (Metrics Row: Sheets + Cases + Generated)
        - `div` (Footer: Project Name)
        - `div` (Hover Actions: Absolute positioned buttons)

## Implementation Details
- Use Tailwind CSS for layout (`flex`, `grid`, `gap-x`).
- Maintain existing logic for `isConfirmingDelete`, `isGenerating`, etc.
- Ensure the `ScenarioSkeleton` in `scenarios-list.tsx` is updated to match the new layout.
