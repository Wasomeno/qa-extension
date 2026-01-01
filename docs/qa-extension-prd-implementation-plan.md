# QA Extension Implementation Plan (PRD-Based)

## Goals & Guardrails
- Deliver a GitLab-first browser extension that speeds QA/dev workflows via structured issue handling, bulk edits, and guided templates.
- Ship incrementally with a usable v1 (core UX + bulk ops + templates + saved views) and a v1.5 AI layer (similarity, child issues, test data helpers).
- Keep GitLab as system of record; extension augments via API, not DOM scraping. Prioritize performance, security (scoped tokens), and low-friction keyboard flows.

## Phases & Milestones (sequence)
1. **Foundation & Auth (wk 1-2)**  
   - GitLab OAuth (cloud + self-hosted), token storage, scope validation, logout/reauth flows.  
   - Project/org bootstrap: fetch accessible projects, cache minimal metadata.  
   - Extension scaffolding: MV3 service worker, Redux Toolkit store, React Query client, base UI kit, routing for popup/content/background.
2. **Shell & Entry Points (wk 2-3)**  
   - Quick Action Capsule: floating button with customizable shortcuts, keyboard trigger, permission-aware visibility.  
   - Full Popup shell: Notion-like layout with sidebar navigation (Workboard, Saved Views, Templates, Test Data, Settings), responsive layout, error/empty states.
3. **Issue Data & Bulk Ops (wk 3-5)**  
   - Issue fetch layer: GitLab REST/GraphQL client, pagination, filtering, cached queries, rate-limit handling.  
   - Multi-select + bulk actions: labels, assignee, milestone/sprint, column move, close/reopen with optimistic UI + rollback.  
   - MR linkage clarity: status pill, quick “Create MR” (branch naming convention), side-panel diff preview.  
   - Role checklists + readiness states: Dev-ready, QA-ready, Release-ready; stored per issue with audit trail.
4. **Views, Templates, Workboard (wk 5-7)**  
   - Saved filters & quick chips (Me, Bug, P1, Has MR, Blocked, This Sprint) with persistence and sharing.  
   - Cross-project “My Workboard”: unified columns, per-column filters, drag/drop moves, real-time refresh.  
   - Guided creation templates: Bug/Feature forms, snippets insertion, validation for required fields (repro, env, expected/actual, AC).  
   - Test data/env helpers: project-level env URLs, accounts, reusable data snippets surfaced on cards.
5. **Keyboard & Command Palette (wk 6-7)**  
   - Global command palette (Cmd/Ctrl+K) with actions: assign to me, add label, move column, toggle readiness, open env.  
   - J/K navigation and Enter/Space quick view; shortcut cheat sheet.
6. **AI Layer v1.5 (wk 7-9)**  
   - Similar issue detection while typing title (cross-project search + embedding cache); one-click mark duplicate.  
   - Parent/child generation from AC or list input with bulk label/assignee propagation.  
   - AC ↔ test scenario helpers; generate test scenarios or user manual drafts; quality checks for completeness.  
   - Safety: rate-limit, PII minimization, user confirmation before writing to GitLab.
7. **Hardening & Launch (wk 9-10)**  
   - Perf (bundle splitting, caching), resilience (retry/backoff), telemetry on success metrics.  
   - QA pass: e2e flows on GitLab SaaS + self-managed instance, permission matrix, offline/rehydration checks.  
   - Docs, rollout playbook, feature flags/toggles.

## Workstreams & Key Deliverables
- **Backend / Services**
  - GitLab OAuth service + token store; project/issue query service with rate-limit handling.
  - Bulk mutation endpoints (labels, milestone, assignee, state, column move) with audit trail.
  - Saved Views + Templates + Test Data APIs (scoped per user/project/team) with validation and versioning.
  - MR linkage service: fetch status, create MR with branch naming convention, diff summaries for side panel.
  - AI service wrappers (OpenAI) with caching and safety filters; similarity index for issues.
- **Extension (Popup/Content/Background)**
  - MV3 service worker orchestrating GitLab requests; React UI for popup; content script for capsule overlay.  
  - State: Redux Toolkit for UI/session, React Query for remote data; optimistic updates with rollback.  
  - UI: Quick Action Capsule, Popup shell, Workboard, card quick view, templates modal, command palette, keyboard nav.  
  - Error handling + toasts; loading skeletons; access/permission banners.
- **Data Model (initial)**
  - User tokens, projects cache, saved views, templates (bug/feature), checklists/readiness states, test data/env entries, AI similarity embeddings, parent/child issue sets.
- **Testing & Quality**
  - Unit: GitLab client wrappers, reducers/selectors, template validators.  
  - Integration: bulk ops flows, MR creation, saved views persistence, command palette actions.  
  - E2E: critical happy paths on GitLab test projects (SaaS + self-hosted), keyboard navigation, offline/rehydration.  
  - AI eval: similarity precision, template completeness scoring, generation guardrails.

## Success Metrics (from PRD)
- ↓ Time per sprint for bulk assignment/labeling and structured bug creation.  
- ↑ % issues with filled bug template + linked MR.  
- ↓ duplicate issues.  
- Qualitative: QA/dev satisfaction on speed/readiness clarity.

## Risks & Mitigations
- GitLab API limits / scopes → caching, incremental fetch, backoff, clear scope prompts.  
- Extension permissions/security → minimal scopes, secure storage, explicit consent UI.  
- Adoption/friction → keyboard-first defaults, saved views/templates, feature flags for gradual rollout.  
- Cross-project variance → normalized columns/labels mapping, per-project configs with sensible defaults.
