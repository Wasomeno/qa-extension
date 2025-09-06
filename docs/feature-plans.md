# Feature Plans: rrweb Recorder, In‑Page Annotations, Slack Threads, Triage Panel

This document outlines concise, actionable implementation notes for four selected features in the QA Command Center extension and backend.

## rrweb Recorder

- Summary: Record DOM changes, clicks, and console/network events via rrweb; store sessions and export to Playwright steps.
- UX Flow:
  - Start/Stop from popup and floating trigger.
  - Session saved locally (size-capped), with option to export JSON or Playwright.
- Implementation:
  - Dependencies: `rrweb`, `rrweb-player` (extension workspace).
  - Content: add recorder controls in `extension/src/content/simple-trigger.ts` and a new recorder module (e.g., `content/recorder.ts`).
  - Storage: persist sessions via `storageService` with rolling cap (e.g., 5–10 MB per session, keep last N).
  - Export: simple mapper to Playwright steps (navigate, click, fill, assert) or backend mapping.
  - UI: controls + status in `extension/src/popup/index.tsx` and quick actions in floating trigger.
  - Privacy: masking options in settings (exclude inputs/PII, rrweb text mask).
- MVP Criteria:
  - Start/Stop produces a saved session; export JSON; basic Playwright export.

## In‑Page Annotations

- Summary: Annotate screenshots in-page (arrows, boxes, text, blur) and attach edited images to issues/drafts.
- UX Flow:
  - After quick capture, open an overlay editor rendered via Shadow DOM.
  - Edit, undo/redo, save; attaches to draft.
- Implementation:
  - Content: new `extension/src/content/annotations-overlay.tsx` (canvas-based overlay), integrated with existing quick capture.
  - Storage: update `storageService.saveQuickCapture` to store edited image as attachment.
  - UI: “Annotate” button in recent screenshots (popup) and in `IssueCreator` preview.
- MVP Criteria:
  - Draw + blur + save edited image; persists with the draft.

## Slack Threads

- Summary: Post new issue summaries (and first screenshot) to Slack; show thread link and sync status updates.
- UX Flow:
  - Configure default channel in Options.
  - On successful issue creation, backend posts to Slack; thread link shown in UI.
- Implementation:
  - Options: channel selection in `extension/src/options/index.tsx` (reuse Slack connect already present).
  - Backend: use existing Slack service; endpoint to post issue summary and return `thread_ts` if not already present.
  - Extension: after `apiService.createIssue` success, call Slack share endpoint; store thread link on the issue object.
  - Real‑time: optionally use existing WebSocket to reflect status changes in the thread.
- MVP Criteria:
  - Post message to a channel with link/screenshot; show “View thread” action.

## Triage Panel (Popup)

- Summary: Show "My recent issues" with filters and infinite scroll; quick actions to open in GitLab or copy link.
- UX Flow:
  - New view in popup: filters (project, assignee, status, search) + list + infinite scroll.
  - Tap an item to open details in GitLab.
- Implementation:
  - Data: `apiService.listIssues` with cursor; cache in `storageService.cache`.
  - UI: add triage view to `extension/src/popup/index.tsx` with debounced search and preserved scroll per filter set.
  - Optional quick actions: quick assign/labels (follow‑up).
- MVP Criteria:
  - Filterable list with infinite scroll; open issue in GitLab; cached for fast revisit.

## Touchpoints Summary

- Content scripts: `simple-trigger.ts` (hook recorder), `annotations-overlay.tsx` (new), `recorder.ts` (new).
- Popup: `popup/index.tsx` (recorder controls, triage view, screenshot annotate action).
- Options: `options/index.tsx` (Slack channel default, privacy toggles for rrweb).
- Services: `services/storage.ts` (rrweb buffers, quick captures), `services/api.ts` (issue list, Slack share).
- Backend: ensure Slack post endpoint; optional rrweb→Playwright mapping endpoint.

## MVP Rollout Order

1) rrweb Recorder (core capture) → 2) In‑Page Annotations → 3) Triage Panel → 4) Slack Threads.

Each step is independently shippable and adds clear user value.

