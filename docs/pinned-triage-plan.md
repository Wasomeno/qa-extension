# Pinned Triage (Mini Todo in Floating Trigger)

This plan describes how to implement a “Pinned Triage” feature: users can pin up to 5 issues to the floating trigger popup and manage them in a compact, todo-like layout.

---

## Ultrathink Implementation Blueprint

- Status: Ready for implementation
- Owner: Extension team
- Scope: Extension UI/UX, local storage, API usage, offline queue, optional backend batch endpoint

### Problem Statement
Users jump between a handful of priority issues while browsing. They need a fast, persistent mini-list with quick actions (done, assign, label, open) that works even if offline or when APIs intermittently fail.

### Solution Overview
Add a “Pinned” view in the floating trigger. Users can pin/unpin issues from the Issue List and manage up to 5 items in a compact DnD list with quick actions. Persist order and local state. Queue actions for retry when offline.

### Constraints & Assumptions
- Max 5 pinned items (hard cap, UX enforced).
- Works without extra permissions beyond existing.
- Offline first: show cached summaries; queue write actions.
- Minimal backend changes; batch fetch endpoint is optional.

### Success Metrics (KPIs)
- Time-to-action: < 2s from opening popup to marking done.
- Offline resilience: > 95% queued actions eventually succeed automatically.
- Error rate: < 1% user-visible action failures after retries.
- Adoption: ≥ 30% of active users pin at least 1 issue in week 1 post-launch.

---

## 1) Goals and Non‑Goals

- Goals:
  - Let users select up to 5 issues to keep at hand in the floating trigger popup.
  - Fast actions: mark done (or resolved), assign to me, quick labels, copy/open, reorder.
  - Work well offline (local state + queued updates).
- Non‑Goals:
  - Full issue editing (keep to quick actions only).
  - Complex bulk operations (beyond pin/unpin and quick state changes).

## 2) UX Overview

- Entry points:
  - From Issue List (inside floating trigger) each row has a Pin/Unpin toggle.
  - When 1+ issues are pinned, a new "Pinned" feature appears in the floating trigger menu (or opens by default if configured).
- Pinned View (todo-like):
  - Max 5 items, vertical list.
  - Each row: checkbox (done), drag handle, title, labels, assignee avatar, actions menu (Assign to me, Labels, Copy, Open, Unpin, Share to Slack).
  - Reorder by drag-and-drop; order persists.
  - Checking the box maps to status update (e.g., in_progress ↔ resolved). If API fails or offline, store local done state and queue the update.
- States:
  - Empty: short hint to pin issues from the Issue List.
  - Limit reached: disable further pinning and show a tip.
  - Inaccessible item: faded row with “No longer accessible” and an Unpin button.

## 3) Data Model (Storage)

- Add to `StorageData` in `extension/src/services/storage.ts`:
  - `pinnedIssues: { id: string; order: number }[]`
  - `pinnedDoneState?: Record<string, 'open' | 'done'>` // local override if no perms/offline
  - `pendingActions?: { id: string; action: 'update' | 'assign' | 'label' | 'resolve'; payload: any; tries: number; lastTriedAt?: number }[]`

- Helper methods (storageService):
  - `getPinnedIssues() / setPinnedIssues(list)`
  - `pinIssue(id)`, `unpinIssue(id)` (enforce max 5)
  - `reorderPinnedIssues(idsInOrder)`
  - `getPinnedDoneState() / setPinnedDoneState(map)`
  - `enqueuePendingAction(action)`, `dequeuePendingAction(predicate)`

Example TS additions (illustrative, not committed yet):
```
interface PinnedIssueRef { id: string; order: number }

interface StorageData {
  // ...existing
  pinnedIssues?: PinnedIssueRef[];
  pinnedDoneState?: Record<string, 'open' | 'done'>;
  pendingActions?: Array<{
    id: string;
    action: 'update' | 'assign' | 'label' | 'resolve';
    payload: any;
    tries: number;
    lastTriedAt?: number;
  }>;
}
```

Additional types for strongly-typed helpers (extension-only):
```
type PinnedDone = 'open' | 'done'

type PendingActionType = 'update' | 'assign' | 'label' | 'resolve'

interface PendingAction<T = any> {
  id: string
  action: PendingActionType
  payload: T
  tries: number
  lastTriedAt?: number
}
```

Storage migration strategy:
- On `storageService.initialize()`, if keys are missing, seed with:
  - `pinnedIssues: []`
  - `pinnedDoneState: {}`
  - `pendingActions: []`
  - Backfill for legacy users without affecting other keys.

## 4) API & Backend (Optional Enhancements)

- Batch fetch by IDs (optional, improves efficiency): `GET /api/issues?ids=<id1,id2,...>`
  - Fallback: call `GET /api/issues/:id` multiple times.
- Standard updates (already present): `updateIssue(id, partial)` for status, assignee, labels.
- Slack share (reuse existing Slack integration): endpoint to post issue summary and return thread link.

Contracts used by the extension:
- `GET /api/issues/:id` → `Issue`
- `PATCH /api/issues/:id` → partial update, returns updated `Issue`
- `POST /api/slack/share` → `{ issueId, channel? }` → `{ ok: boolean, url?: string }`

Optional batch endpoint:
- `GET /api/issues?ids=<id,id,...>` → `{ issues: Issue[] }`
- Extension should detect 404 and fallback to N single fetches.

## 5) Extension Changes

### 5.1 Components

- `extension/src/components/issue-list/index.tsx`
  - Add Pin/Unpin button per row (star icon). Disable when pinned count = 5 (show tooltip).
  - Show pinned state visually.
- `extension/src/components/floating-trigger/components/floating-trigger-popup.tsx`
  - Add new feature key `pinned`:
    - Feature list shows "Pinned" when `pinnedIssues.length > 0`.
    - Pinned view component (new, see below).
  - Optional: open Pinned by default if user preference set.
- New: `extension/src/components/pinned-issues/index.tsx`
  - Renders the todo-like list of pinned issues.
  - Props: `portalContainer` for Radix menus inside Shadow DOM.
  - Capabilities:
    - Load pinned issue details (batch or individual) and cache minimal fields.
    - Reorder via HTML5 DnD; persist order.
    - Checkbox toggles done → calls `api.updateIssue({ status })`; fallback to local `pinnedDoneState` + queue.
    - Actions menu: Assign to me, Labels (favorite quick picks), Copy link, Open, Unpin, Share to Slack.

Suggested component contract:
```
type PinnedIssueLite = {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'resolved' | string
  labels?: string[]
  assignee?: { id: string; name: string; avatarUrl?: string }
  webUrl?: string
}

interface PinnedIssuesProps {
  portalContainer?: HTMLElement
}
```

Key UI interactions:
- DnD: use pointer events; onDrop compute final array and call `reorderPinnedIssues(newOrder)`.
- Checkbox: optimistic UI. Immediately flip local state, enqueue `resolve` when API unavailable.
- Kebab menu: each action optimistic with toast confirmations; failures revert local state and show error toast.

### 5.2 Services & Logic

- `extension/src/services/storage.ts`
  - Add keys + helpers described in section 3.
  - Initialize defaults in `initialize()`.
- `extension/src/services/api.ts`
  - Optional: `getIssuesByIds(ids: string[])` (probes batch endpoint; fallback to sequential fetches).
  - Ensure `updateIssue`, Slack share, etc. are accessible.
- Background refresh (lightweight):
  - In floating trigger view mount, refresh pinned issue details; then every 60–120s or on window focus.
  - If offline, skip network and render cached data; show small “Offline” badge.
- Offline queue:
  - A small retry worker (in popup/floating trigger lifecycle): try pending actions with exponential backoff; limit retries; surface failure with an icon.

Pseudocode: storage helpers
```
async function pinIssue(id: string) {
  const pinned = (await get('pinnedIssues')) ?? []
  if (pinned.length >= 5 || pinned.some(p => p.id === id)) return pinned
  const nextOrder = pinned.length > 0 ? Math.max(...pinned.map(p => p.order)) + 1 : 0
  const updated = [...pinned, { id, order: nextOrder }]
  await set('pinnedIssues', updated)
  return updated
}

async function unpinIssue(id: string) {
  const pinned = (await get('pinnedIssues')) ?? []
  const updated = pinned.filter(p => p.id !== id)
  await set('pinnedIssues', updated)
  return updated
}

async function reorderPinnedIssues(idsInOrder: string[]) {
  const updated = idsInOrder.map((id, idx) => ({ id, order: idx }))
  await set('pinnedIssues', updated)
  return updated
}
```

Pseudocode: offline queue worker
```
const MAX_TRIES = 6 // ~ 1m total with exp backoff

async function processQueue(now = Date.now()) {
  const queue = (await get('pendingActions')) ?? []
  const next: PendingAction[] = []

  for (const item of queue) {
    const delay = 1000 * 2 ** Math.min(item.tries, 5)
    if (item.lastTriedAt && now - item.lastTriedAt < delay) {
      next.push(item)
      continue
    }
    try {
      await performAction(item)
    } catch (e) {
      const tries = item.tries + 1
      if (tries >= MAX_TRIES) {
        // Surface a permanent error indicator for this issue
        markActionFailed(item)
      } else {
        next.push({ ...item, tries, lastTriedAt: now })
      }
    }
  }
  await set('pendingActions', next)
}
```

## 6) UI Behavior Details

- Row anatomy:
  - Checkbox: toggles status between `in_progress` ↔ `resolved` (configurable mapping; default `done` ⇢ `resolved`).
  - Drag handle: drag to reorder; drop updates `order` in storage.
  - Title: ellipsized; click to open GitLab.
  - Labels: compact chips (first 2–3), overflow count.
  - Assignee: small avatar; click to quick-assign to me (if unassigned) or open assignment menu.
  - Kebab menu: Assign to me, Labels (quick favorites), Copy link, Open, Unpin, Share to Slack.
- Limits & messages:
  - When adding beyond 5, show toast: “You can pin up to 5 issues.”
  - Inaccessible: faded with Unpin; hover explains why (403/404).

Visual cues and states:
- Offline badge: small dot and “Offline” hint in the Pinned header when `navigator.onLine === false`.
- Pending sync: show a subtle spinner/clock icon next to a row after an optimistic action until confirmed.
- Error state: red exclamation on row if queued action failed permanently; click reveals “Retry” and details.

## 7) A11y & Keyboard

- Row focus with arrows; Space toggles checkbox; Enter opens; context menu accessible with keyboard.
- Proper roles/labels for controls; focus outlines in floating trigger.

## 8) Performance Considerations

- Batch fetch when possible; debounce refresh.
- Cache issue summaries in `storageService.cache` keyed by ID.
- Keep component lightweight; avoid heavy images; lazy-load avatars if needed.

Micro-optimizations:
- Memoize derived lists (e.g., ordered pinned ids) to avoid unnecessary re-renders.
- Batch state writes to storage when reordering (single `set` call).

## 9) Privacy & Security

- No extra permissions required beyond existing.
- Respect current auth; do not expose hidden details in the floating trigger.

## 10) Telemetry (Optional, Opt‑in)

- Count pin/unpin, reorder, quick actions usage to improve UX (behind opt‑in setting).

## 11) Testing Plan

- Unit: storage helpers, pin/unpin logic, order persistence, queue retry logic.
- Integration (extension):
  - Pin/unpin across sessions; limit enforcement.
  - Offline mode: local done state + queued update.
  - Reorder and persistence.
  - Actions: assign/label/status; verify API calls.
- Manual:
  - Accessibility: keyboard navigation; focus traps in floating trigger.
  - Error states: unauthorized/forbidden issues; remove-orphan pins.

Acceptance criteria (checklist):
- Can pin/unpin issues from the Issue List and see them appear/disappear in Pinned view.
- Enforced max 5 pins with explanatory tooltip/toast when exceeded.
- Reordering persists after popup close and browser restart.
- Checkbox toggles status optimistically and syncs when online; offline toggles are queued and later applied.
- Assign to me and Quick labels work; failures show error and revert local state.
- Inaccessible items display with “Unpin” and do not break the list.
- A11y: fully operable with keyboard; screen readers announce controls and state.
- No regression to baseline popup performance (open under 250ms on warm cache).

## 12) Rollout Plan

1. Storage + API helpers (no UI): create getters/setters, queue infra.
2. Add Pin button in Issue List; enforce max 5; simple pinned badge.
3. Pinned view component in floating trigger (read-only first).
4. Enable actions: unpin, open, copy link; then checkbox → status update.
5. Add assign-to-me, quick labels, Slack share.
6. Background refresh + offline queue polish.

Launch controls and rollback:
- Feature flag (extension-only, persisted in settings): `features.pinnedTriage` default ON for beta channel, then stable.
- Rollback by hiding Pinned menu and Pin buttons via the flag; no data migration required.

## 13) Open Questions

- Status mapping: should “checked” always set `resolved`, or user-configurable mapping (e.g., `in_progress`)?
- Batch endpoint: add `/api/issues?ids=...` to reduce N requests?
- Favorite labels: per-user presets in settings or global defaults per project?

Assumptions (until decided):
- Checkbox maps open ↔ resolved by default; make it user-configurable in Options later if requested.
- No new backend endpoints are required for MVP; batch fetch is a later optimization.
- Favorite labels: begin with “recent labels” heuristic stored per-user locally; upgrade to settings page later.

---

This implementation leverages existing Issue List plumbing and floating trigger architecture while focusing the pinned experience on speed and clarity.

---

## File-by-File Task List (Do This)

- `extension/src/services/storage.ts`
  - Add types: `PinnedIssueRef`, `PinnedDoneState`, `PendingAction`.
  - Extend `StorageData` with `pinnedIssues`, `pinnedDoneState`, `pendingActions`.
  - Add helpers: `getPinnedIssues`, `setPinnedIssues`, `pinIssue`, `unpinIssue`, `reorderPinnedIssues`, `getPinnedDoneState`, `setPinnedDoneState`, `enqueuePendingAction`, `dequeuePendingAction`.
  - Update `initialize()` to seed defaults.

- `extension/src/services/api.ts`
  - Add optional `getIssuesByIds(ids: string[])` with batch probe + fallback.
  - Ensure `updateIssue(id, partial)`, Slack share exist and export typed contracts.

- `extension/src/components/issue-list/index.tsx`
  - Add Pin/Unpin toggle on each row; show disabled state when count = 5.
  - Trigger storage updates and fire toast on limit.

- `extension/src/components/floating-trigger/components/floating-trigger-popup.tsx`
  - Add “Pinned” entry and lazy-render `PinnedIssues` when there is at least one pinned item.
  - Persist last-opened subview (optional nice-to-have).

- `extension/src/components/pinned-issues/index.tsx` (new)
  - Render pinned list, manage DnD reorder, actions, checkboxes.
  - Use React Query to fetch issue details; cache by id; refetch on focus.
  - Show offline badge; optimistic updates with queue fallback.

- `extension/src/styles` (if needed)
  - Minor styles for compact chips, drag handle cursor, subtle state icons.

## Risks & Mitigations

- Race conditions on reorder and updates → Always write full ordered array; debounce rapid reorder writes.
- API shape variance for issues (GitLab vs internal) → Normalize to `PinnedIssueLite` in selector.
- Offline edge cases with tab suspend → Retry worker bound to popup/floating trigger focus and visibility.
- Performance in heavy pages → Keep component isolated, throttle refresh, avoid heavy avatars.

## Developer Notes

- Prefer idempotent storage writes; read-modify-write with latest snapshot.
- Keep UI resilient: never block UI on network; always show actionable fallback.
- Log queue failures with bounded history in memory for debugging (do not spam storage).
