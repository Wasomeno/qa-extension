---
id: nav-setup
title: Implement Boards Page & Navigation
status: Done
priority: High
project: qa-extension
created: 2026-01-19
updated: 2026-01-19
links:
  - url: ../linear_ticket_parent.md
    title: Parent Ticket
labels: [frontend, nav]
assignee: Pickle Rick
---

# Description

## Problem to solve
Users cannot access the new Board view.

## Solution
1. Add "Issue Boards" item to `MENU_ITEMS` in `src/components/floating-trigger/components/main-menu-modal.tsx`.
2. Create `src/pages/boards/index.tsx` (Skeleton).
3. Connect the navigation to render the new page.
