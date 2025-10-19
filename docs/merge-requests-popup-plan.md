**Merge Requests Popup Plan**

- Scope: Add Merge Request list and detail views inside `extension/src/components/floating-trigger/components/floating-trigger-popup.tsx`, focused, minimal, and fast.

**Core Requirements**
- Default list shows MRs where current user is assignee.
- Search by text and filter by project.
- List view renders compact “cards”.
- Detail view shows: description (MD), comments/reviews, assignee + reviewers, source branch → target branch.

**UX & Navigation**
- Entry: Add a top-level tab/segment “MRs” in the popup header bar.
- Views:
  - MR List: search input (debounced) + project filter + card list + infinite scroll.
  - MR Detail: sticky header with title + meta; sections for description, comments/reviews, people, branches.
- Back: “< Back to list” in detail header returns to last list state (search/filter/scroll preserved).

**Card Layout (Compact)**
- Title (bold) + optional checklist progress (e.g., `4/5 tasks`).
- Meta row: `!{iid} · {created_at_rel} · {author}`
- Branches: `{source_branch} → {target_branch}`
- Right-side badges (only when present): comments count, approvals status, pipeline state.

**Data & Endpoints (via backend GitLab service)**
- List: `GET /api/gitlab/merge_requests?assignee=me&search={q}&project_id={id}&page={n}&per_page=20`
- Detail: `GET /api/gitlab/merge_requests/:iid?project_id={id}`
- Notes (comments): `GET /api/gitlab/merge_requests/:iid/notes?project_id={id}`
- Approvals (reviewers): `GET /api/gitlab/merge_requests/:iid/approvals?project_id={id}`
- Projects for filter: `GET /api/gitlab/projects?membership=true&simple=true&search={q}`
- Auth: reuse existing session/JWT; backend holds GitLab token.

**Types (Extension)**
- `MergeRequestSummary`: { id, iid, project_id, project_name, title, source_branch, target_branch, author, assignees, updated_at, created_at, web_url, user_notes_count, approvals_required?, approvals_left?, pipeline_status?, checklist_progress? { completed, total } }
- `MergeRequestDetail`: `MergeRequestSummary` + { description_md, reviewers, approvals_state }
- `Note`: { id, body_md, author, created_at, system }

**Extension Implementation**
- View state: extend `ViewState` with `"mrList" | "mrDetail"`.
- Navigation: add “MRs” tab in header; on click sets `viewState = "mrList"`.
- Components (new):
  - `MergeRequestListPane` (search/filter + list)
  - `MergeRequestCard` (presentational)
  - `MergeRequestDetailPane` (detail)
- Data hooks (React Query):
  - `useMRList({ q, projectId })` using `useInfiniteQuery`
  - `useMRDetail({ projectId, iid })`, `useMRNotes(...)`, `useMRApprovals(...)`
- Filters: local state; project Select is async (fetch-on-type); persist last project in chrome storage.
- Loading/empty/error: skeleton rows; simple empty copy; retry button on error.

**Minimal UI Spec (Tailwind + Radix)**
- List toolbar: left `Input` (search, 300ms debounce), right `ProjectSelect`.
- Card: `flex justify-between items-start py-2 border-b` with stacked left info and right badges.
- Detail: two-column on wide, single-column in popup; Markdown render for description; timeline list for comments.

**Implementation Steps**
1) Add view state + header tab in `floating-trigger-popup.tsx`.
2) Create `MergeRequestListPane` + search/project filter + hook wiring.
3) Create `MergeRequestCard` and bind click to open detail with `{projectId, iid}`.
4) Create `MergeRequestDetailPane` (description MD, comments, assignee/reviewers, branches, link to GitLab).
5) Add hooks and lightweight API client for MR endpoints; map API → UI types.
6) Preserve list state when returning from detail; add loading/empty/error states.
7) Smoke tests for hooks (mocks) and basic render tests for panes.

**Acceptance Criteria**
- Opening “MRs” shows assigned-to-me MRs by default.
- Search and project filter refine the list.
- Cards render title, meta, branches, and optional badges.
- Clicking a card opens detail with description, comments/reviews, assignee/reviewers, branches.
- Back to list returns to the previous scroll, search, and filter state.

**Assumptions / Open Questions**
- Confirm backend GitLab endpoints naming/shape; add if missing.
- “Reviews” mapped to GitLab approvals + discussions; show both simply.
- Checklist progress sourced from task counts in description; omit if unavailable.

**Out of Scope (Now)**
- Editing description/comments; approvals change; merge actions.
- Virtualized lists (enable later if list > 50).

