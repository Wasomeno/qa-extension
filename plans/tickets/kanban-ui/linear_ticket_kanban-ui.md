---
id: kanban-ui
title: Implement Kanban Board Components & Mock Data
status: Done
priority: High
project: qa-extension
created: 2026-01-19
updated: 2026-01-19
links:
  - url: ../linear_ticket_parent.md
    title: Parent Ticket
labels: [frontend, ui, mock-data]
assignee: Pickle Rick
---

# Description

## Problem to solve
The Board view needs to actually display data in a Kanban format.

## Solution
1. Create `src/pages/boards/components/board-column.tsx`.
2. Create `src/pages/boards/components/board-card.tsx`.
3. Create `src/pages/boards/mock-data.ts` to generate realistic dummy data (Projects -> Columns -> Issues).
4. Render the board structure in `src/pages/boards/index.tsx`.
