# Issue Boards & Kanban View PRD

## HR Eng

| Issue Boards & Kanban View PRD |  | Create a visually rich Kanban board interface for managing issues across multiple projects, integrated into the main menu modal. |
| :---- | :---- | :---- |
| **Author**: Pickle Rick **Contributors**: User **Intended audience**: Engineering | **Status**: Draft **Created**: 2026-01-19 | **Self Link**: N/A **Context**: QA Extension |

## Introduction

The current extension provides list views for issues but lacks a spatial, process-oriented view. The "Issue Boards" feature will introduce a Kanban-style interface, allowing users to visualize work states (To Do, Doing, Done) across multiple projects in a single, cohesive view.

## Problem Statement

**Current Process:** Users view issues in a linear list. Hard to gauge velocity or state distribution.
**Primary Users:** QA Engineers, Developers using the extension.
**Pain Points:** "Wall of text" effect with lists. No visual separation of workflow stages.
**Importance:** Visual management is key to rapid QA/Dev cycles.

## Objective & Scope

**Objective:** Implement a high-fidelity UI for "Issue Boards" within the `MainMenuModal`, using dummy data to demonstrate UX patterns.
**Ideal Outcome:** A user opens "Issue Boards" and sees a beautiful, horizontally scrolling set of columns for each project they track.

### In-scope or Goals
-   **New Menu Item**: Add "Issue Boards" to the sidebar.
-   **Board Layout**: Horizontal columns (Kanban) for issue states.
-   **Multi-Project View**: Stacked boards for different projects, separated by distinct, visually appealing headers.
-   **Mock Data**: robust dummy data generation for projects, columns, and cards.
-   **UI/UX**: Focus on spacing, typography, and visual hierarchy (Shadow DOM compatible).

### Not-in-scope or Non-Goals
-   Real API integration (GitLab API) - strictly mock data for this iteration.
-   Drag and drop persistence (Visual only).
-   Complex filtering (Basic view only).

## Product Requirements

### Critical User Journeys (CUJs)
1.  **Access Boards**: User opens the extension -> Clicks "Issue Boards" in sidebar -> Sees the board view.
2.  **Navigate Projects**: User scrolls down -> Sees Project A's board -> Continues scrolling -> Sees "Nice Separator" -> Sees Project B's board.

### Functional Requirements

| Priority | Requirement | User Story |
| :---- | :---- | :---- |
| P0 | Sidebar Integration | As a user, I want to click "Issue Boards" in the sidebar to access the view. |
| P0 | Project Separation | As a user, I want clear visual distinction between Project A and Project B boards so I don't mix up contexts. |
| P0 | Kanban Columns | As a user, I want standard columns (Open, Doing, Closed) populated with cards. |
| P1 | Card Detail | As a user, I want to see title, labels, and assignee on the card. |

## UI/UX Specifications
-   **Separator**: A stylized divider with the project icon/avatar and name, possibly with a subtle background gradient or distinct border to break up the vertical rhythm.
-   **Columns**: Gray background (`bg-gray-50/50`), rounded corners.
-   **Cards**: White, shadow-sm, hover effects.

## Assumptions
-   The user prefers a "Stacked" view (Project A on top of Project B) rather than a tabbed view for this iteration.
-   Tailwind CSS is available and configured.

## Risks & Mitigations
-   **Risk**: Horizontal scrolling within vertical scrolling might be janky. -> **Mitigation**: Use proper flexbox constraints and `overflow-x-auto` for board containers, `overflow-y-auto` for the main page.

## Stakeholders / Owners

| Name | Team/Org | Role | Note |
| :---- | :---- | :---- | :---- |
| Pickle Rick | Engineering | Lead Architect | *Belch* |
