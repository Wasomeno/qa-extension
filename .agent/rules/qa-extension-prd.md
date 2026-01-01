---
trigger: always_on
---

QA Extension PRD  1. TL;DR
A browser extension that sits on top of GitLab (and any web app) to make QA and dev workflows faster, clearer, and less repetitive, with AI-assisted flows for creating, managing, and validating issues and test scenarios.
Primary users: QA. Secondary: Developers (FE/BE), optionally PM.

2. Problem
   Current GitLab usage in a software house environment is:

- Too repetitive for bulk operations (labels, assignees, milestones).
- Too fragmented across projects and repos.
- Too unstructured for bug reporting and acceptance criteria.
- Too noisy for PM/QA to see status at a glance.
- Too manual for mapping acceptance criteria ↔ test scenarios ↔ user manuals.
  Result: Wasted time, duplicated bugs, unclear handoffs, and missed details in QA & dev cycles.

3. Target Users
   Primary: Quality Assurance (QA)

- Needs fast triage, clear test data/env, and easy evidence attachment.
- Moves across multiple client projects and repos.
  Secondary: Developers
- Needs clear reproducible bugs and acceptance criteria.
- Wants fast bulk edits and keyboard-first workflows.
  (Optionally later: PMs who want status views an d cross-project visibility.)

4. Product Vision
   “Make GitLab issue management for QA & dev feel like a powerful command center instead of a spreadsheet with friction.”
   The extension should:

- Sit as a universal layer on top of GitLab (and possibly related tools).
- Focus on speed, structure, and clarity for QA flows.
- Use AI to remove repetitive work: templates, child issues, test scenarios, documentation.

5. UX Model
   Entry Points
1. Quick Action Capsule (bottom center of any page)
   - Customizable set of actions (e.g. “Create bug from page”, “Bulk edit selected issues”, “Open My Workboard”).
   - Keyboard-accessible.
1. Full Popup (Notion-like layout)
   - Centered popup with:
     - Sidebar: menus (Workboard, Saved Views, Templates, Test Data, Settings, etc.).
     - Content: Kanban boards, issue views, forms, AI tools, etc.
   - Shows the full power of the extension.

1. Core Use Cases (v1)
1. Bulk operations on issues
   - Multi-select GitLab cards from the extension UI.
   - Bulk:
     - Change labels
     - Change milestone / sprint
     - Change assignee
     - Move columns
     - Close / reopen issues
1. Role-based handoff clarity
   - Dev & QA checklists inside each card.
   - Visual “readiness” indicators:
     - Dev-ready, QA-ready, Ready for Release.
1. Issue ↔ MR linkage clarity
   - Show MR status pill on card:
     - No MR / Open / Merged / Closed.
   - Quick actions:
     - “Create MR from this issue” (branch naming convention enforced).
     - “View diff” in side panel.
1. Better searching & saved views
   - Saved filters like:
     - “My Bugs Today”
     - “QA: In QA column, last 7 days”
     - “PM: High impact bugs without assignee”
   - Quick filter chips (Me, Bug, P1, Has MR, Blocked, This Sprint…).
1. Templates & guided issue creation
   - Enforced / guided forms for:
     - Bug template (repro, expected/actual, env, logs, risk).
     - Feature template (problem, user story, AC, design link, impacted systems).
   - Quick insert snippets into descriptions and comments.
1. Cross-project “My Workboard”
   - One Kanban that aggregates issues from multiple GitLab projects.
   - Unified columns & filters.
1. Keyboard & command palette
   - J/K navigation, Enter/Space quick view.
   - Command palette (Ctrl/Cmd + K) for:
     - Assign to me
     - Add label: bug
     - Move to In QA
     - Toggle Dev-ready / QA-ready

1. AI / Smart Features (v1.5+ or parallel)

- Similar issue detection
  - While typing a title, surface “Similar issues” across projects.
  - One-click “Mark as duplicate”.
- Parent / child issue generation
  - Create parent with structured child issues (e.g. from a list or from AC).
  - Apply labels / assignees in bulk to children.
- Test environment & data helpers
  - Store and surface per-project:
    - Env URLs (staging, UAT, prod)
    - Test accounts / credentials
    - Test data snippets (SQL, payloads, IDs)
  - On card: “Open env”, “Use test account X”, “Use test data snippet Y”.
- AC ↔ Test scenario ↔ User manual
  - Generate issues or test scenarios from:
    - Acceptance criteria
    - Excel/Sheets docs of test scenarios
  - Generate user manuals from AC or scenarios.

8. Non-Goals (for now)

- Replacing GitLab itself as the system of record.
- Full-blown test management suite.
- Deep customization per client beyond configs/templates.

9. Success Metrics (examples)

- ↓ Time spent per sprint on:
  - Bulk assignment / labeling.
  - Creating structured bug reports.
- ↑ Percentage of issues with:
  - Complete bug template filled.
  - Linked MR.
- ↓ Number of duplicate issues created.
- Qualitative:
  - “QA says: I can triage + test faster, with fewer context switches.”

10. Risks & Assumptions

- Assumes teams already use GitLab heavily.
- Browser extension permissions & security concerns.
- GitLab API rate limits / permission scopes.
- Change management: QAs and devs need to adopt new workflows.
