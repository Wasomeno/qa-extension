# Auth + Background Fetch Refactor Plan (ULTRATHINK)

This document proposes a comprehensive refactor to unify authentication and data fetching across the extension (popup, floating trigger/content, options) with a single session source of truth and a centralized, CORS-proof background fetch layer.

## Outcomes (What “Done” Looks Like)
- A single `session` governs auth state across all contexts; `auth`/`user` are kept for backward compatibility during migration.
- All network traffic (JSON, uploads, binary) routes through the background service worker and never fails with CORS from any context.
- Popup is simplified; OAuth, token refresh, and retries are centralized. Floating trigger shows a clear CTA when unauthenticated.
- Token refreshes deduplicated (single flight), automatic retry once on 401.
- Storage changes propagate reliably to all contexts (no stale UI after login/logout).

## Non‑Goals
- Changing backend contracts or auth strategy server-side.
- Adding new product features outside of auth/fetch/UX guardrails.

---

## Current State Snapshot
- Session data split across `auth` and `user` in `chrome.storage.local` via `storageService`.
- Popup (`extension/src/popup/index.tsx`) handles OAuth, polling, and local state transitions.
- `apiService` injects `Authorization` per request and handles refresh on 401; most requests go via `fetch-bridge` (background), but uploads/transcribe previously used direct `fetch` in UI contexts (CORS risk). We patched those to background already.
- Floating trigger panels call `apiService`; unauthenticated UX surfaces generic errors in some places (e.g., issue list shows an auth banner, others implicit).

---

## Proposed Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                   Chrome Extension (MV3)                            │
├──────────────┬───────────────────────┬──────────────────────────────┤
│ Popup (React)│ Floating Trigger (CS) │ Options / Other UIs (React)  │
│   useAuth()  │   useAuth()           │   useAuth()                  │
│   apiService │   apiService          │   apiService                 │
├──────────────┴───────────────▲───────┴───────────────▲─────────────┤
│ storageService  (chrome.storage.local + change bridge)             │
├───────────────────────────────┼────────────────────────────────────┤
│ Background Service Worker (single source for network + session)    │
│  • AuthController: session, OAuth, refresh (mutex), logout         │
│  • FetchController: BACKGROUND_FETCH, FILE_UPLOAD, AI_TRANSCRIBE   │
│  • Bridge ports: keepalive + message routing                       │
└───────────────────────────────┴────────────────────────────────────┘
```

Key properties:
- UI never directly hits cross‑origin endpoints; always uses background bridge.
- `session` mirrors `auth`/`user` during migration, then becomes canonical.
- Settings changes (e.g., base URL) propagate and take effect without reload.

---

## Data Model

```ts
// New canonical session model
type Session = {
  user: UserData | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null; // epoch ms
};

// Stored under chrome.storage.local key: 'session'
// During migration, keep writing 'auth' + 'user' for compatibility.
```

---

## Background Controllers

1) AuthController
- Responsibilities: start OAuth, poll/complete OAuth, store session, refresh tokens (single-flight), logout, broadcast `AUTH_SESSION_UPDATED`.
- API (messages):
  - `AUTH_START { sessionId? } -> { authUrl, sessionId }`
  - `AUTH_GET_SESSION -> { session }`
  - `AUTH_LOGOUT -> { ok }`
  - `AUTH_SESSION_UPDATED` (port/broadcast event)
- Refresh mutex: serialize refresh; queue waiters return same refreshed token.

2) FetchController
- Responsibilities: receive bridged requests and perform `fetch` in SW, inject `Authorization`, retry once after refresh on 401.
- Existing: `BACKGROUND_FETCH` (JSON/text/binary via bridgeFetch).
- Added (already implemented):
  - `FILE_UPLOAD` (FormData, Authorization)
  - `AI_TRANSCRIBE` (FormData, Authorization)

Retry flow:
1. Build request with latest `Authorization`.
2. If 401 and endpoint is not refresh → call refresh (AuthController) once → rebuild headers → retry once → return.

---

## UI/Services Layer

1) storageService
- Add a `chrome.storage.onChanged` bridge that fans out to `onChanged(key, cb)` subscribers across contexts.
- Migrate helpers to read/write `session` while maintaining legacy keys for now.

2) useAuth() hook
- Returns `{ session, user, isAuthenticated }` with live updates via storage change bridge.
- Exposes `login()` and `logout()` wrappers that call background messages.

3) useOAuth() hook (popup)
- Thin wrapper: initiates `AUTH_START`, opens `authUrl`, listens for `AUTH_SESSION_UPDATED` to transition UI.
- Removes polling logic from popup component.

4) apiService
- Keep endpoint surface; delegate all HTTP to background bridge.
- Remove per-call header/refresh code; rely on background.
- React to base URL changes via storage change bridge (settings.apiEndpoint).

5) Floating Trigger UX
- Guard API‑backed panels with `useAuth().isAuthenticated`.
- If unauthenticated or 401 detected, surface a small CTA: “Open extension popup to sign in”.

---

## Migration Plan (Phased)

Phase 1: Storage Change Bridge + Session Model
- Add `chrome.storage.onChanged` bridge in `storageService`.
- Introduce `session` key; write to both `session` and legacy `auth`/`user`.
- Implement `useAuth()` reading `session`.

Phase 2: Centralized Background Fetch
- Ensure all JSON requests use `BACKGROUND_FETCH` (already in place via `bridgeFetch`).
- Add/complete multipart/binary routes: `FILE_UPLOAD`, `AI_TRANSCRIBE` (done).
- Verify no remaining direct cross‑origin `fetch()` in UI/content.

Phase 3: Background Auth Controller
- Implement `AUTH_START`, `AUTH_GET_SESSION`, `AUTH_LOGOUT`, `AUTH_SESSION_UPDATED`.
- Move refresh logic behind a mutex; remove refresh code from `apiService`.
- Popup uses `useOAuth()` → background messages; UI reacts to `AUTH_SESSION_UPDATED`.

Phase 4: UI Cleanups & Guardrails
- Popup: extract components (Header, Messages, UserCard, Actions), reduce side effects.
- Floating trigger: add unauthenticated CTA; ensure panels handle auth gracefully.
- Options page: switch to `useAuth()` for consistency.

Phase 5: Hardening & De‑risking
- Add refresh single‑flight tests; retry once semantics.
- Add storage migration fallback: if `session` absent but `auth`/`user` exist, synthesize `session`.
- Logging: guard noisy logs behind a debug flag.

---

## File‑Level Tasks (Checklist)

Background
- [ ] `extension/src/background/auth-controller.ts` (new): session store, refresh mutex, OAuth start/poll.
- [ ] `extension/src/background/index.ts`: wire auth messages; ensure BACKGROUND_FETCH integrates refresh retry.

Services
- [ ] `extension/src/services/storage.ts`: add `chrome.storage.onChanged` bridge; session helpers.
- [ ] `extension/src/services/api.ts`: remove inline refresh; route special endpoints via background; react to base URL changes.
- [ ] `extension/src/services/session.ts` (new): convenience readers for session.
- [ ] `extension/src/services/fetch-bridge.ts`: keepalive + port bridge (already robust).

Hooks
- [ ] `extension/src/hooks/useAuth.ts` (new): subscribe to session; expose login/logout via background.
- [ ] `extension/src/hooks/useOAuth.ts` (new): popup‑only orchestrator.

UI
- [ ] `extension/src/popup/*`: extract components; replace inline OAuth with `useOAuth()`.
- [ ] `extension/src/components/floating-trigger/**`: inject CTA when unauthenticated; guard API panels.
- [ ] `extension/src/options/*`: switch to `useAuth()`.

Types
- [ ] `extension/src/types/messages.ts`: add auth messages (AUTH_START, AUTH_GET_SESSION, AUTH_LOGOUT, AUTH_SESSION_UPDATED).

---

## Acceptance Criteria
- Login in popup updates `session`, propagates to floating trigger within <200ms without reload.
- All API calls from popup/content avoid CORS errors (verified on cross‑origin pages).
- Refresh runs once under concurrency and retries the original request successfully.
- Uploads and transcriptions work from any context without CORS.
- Floating trigger surfaces a clear sign‑in CTA when unauthenticated.

---

## Testing Strategy

Unit
- storageService change bridge; session read/write/migration.
- AuthController refresh mutex (single‑flight).

Integration (Extension)
- OAuth start → session stored → UI updates via storage events.
- BACKGROUND_FETCH 401 → refresh → retry once.
- FILE_UPLOAD and AI_TRANSCRIBE from popup and content.

Manual/E2E
- Sign in/out and verify trigger panels reflect state.
- Open on a variety of sites (same‑origin, cross‑origin, SPAs) and verify zero CORS issues.
- Simulate expired token (by editing expiresAt) and confirm automatic refresh & retry.

---

## Risks & Mitigations
- MV3 service worker lifecycle: mitigated via keepalive + bridge ports (already present), and idempotent message handlers.
- Token races: single‑flight refresh with awaiting callers.
- Backwards compatibility: write to both `session` and legacy keys; read legacy on absence.
- Debug noise: gate verbose logs behind a debug flag.

---

## Rollout Plan
- Feature‑flag the new session reading in UI to allow easy rollback to legacy keys if needed.
- Ship Phase 1–2 first (low risk), then AuthController (Phase 3), followed by UI cleanups.
- Monitor errors and user reports; add lightweight telemetry (optional).

---

## Timeline (Rough)
- Phase 1–2: 1–2 days (with reviews)
- Phase 3: 1–2 days (auth controller + refresh)
- Phase 4: 1 day (UI cleanup + CTAs)
- Phase 5: 0.5 day (hardening/tests)

---

## Appendix A: Message Types (Proposed)

```ts
enum MessageType {
  BACKGROUND_FETCH = 'BACKGROUND_FETCH',
  FILE_UPLOAD = 'FILE_UPLOAD',
  AI_TRANSCRIBE = 'AI_TRANSCRIBE',
  AUTH_START = 'AUTH_START',
  AUTH_GET_SESSION = 'AUTH_GET_SESSION',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_SESSION_UPDATED = 'AUTH_SESSION_UPDATED',
}
```

---

## Appendix B: Storage Schema (During Migration)

```json
{
  "session": { "user": {"..."}, "accessToken": "...", "refreshToken": "...", "expiresAt": 1725... },
  "auth": { "jwtToken": "...", "refreshToken": "...", "expiresAt": 1725... },
  "user": { "id": "...", "email": "...", "...": "..." },
  "settings": { "apiEndpoint": "http://localhost:3000", "...": "..." }
}
```

---

## Appendix C: Code Move Summary
- Centralize: network in background; auth state to `session`.
- Simplify: remove duplicate refresh logic in UI/service; shrink popup component.
- Guard: add unauthenticated CTA in floating trigger; solid error paths.

