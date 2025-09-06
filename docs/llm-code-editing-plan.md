# LLM-Assisted Code Editing: Plan

This document outlines the plan to enable users to:
- Prompt an LLM to edit code in a GitLab repository
- Preview the changes live on the currently open website via the Chrome extension
- Commit, push, and open a Merge Request when satisfied

Status: Draft for alignment
Owner: QA Command Center team

## Overview

We will deliver an end-to-end workflow across the backend and the browser extension:
- Backend orchestrates GitLab, OpenAI, patch validation, and Git operations
- Extension provides UX, live preview via request overrides/injection, and action triggers
- Real-time updates via WebSocket to keep the UI responsive during patch generation and validation

## Goals

- Generate code edits via LLM with guardrails
- Preview edits on the active website without local builds
- Commit edits to a branch, push, and create an MR
- Provide safety, traceability, and user control at each step

## High-Level Flow

1. User selects repo/branch and maps repo files to site URLs
2. User submits a natural-language prompt to request edits
3. Backend generates a validated patch set (ChangeSet)
4. Extension previews changes by overriding assets (JS/CSS/HTML)
5. User iterates (re-prompt, toggle per-file overrides)
6. User commits → pushes → opens MR with generated summary

## Architecture

- Backend (Node/Express, TypeScript)
  - GitLab integration (OAuth/API)
  - OpenAI integration for patch generation
  - Patch application & validation (dry run, lint/typecheck)
  - Git operations (branch, commit, push, MR)
  - WebSocket for job status + diffs
- Extension (React TS + MV3)
  - UI: prompt, diff viewer, preview toggles, commit/MR actions
  - Preview engine: request redirection via Declarative Net Request (DNR) + fallback injection
  - Background SW: ChangeSet state, WS client, DNR rules management
  - Content scripts: page overlay, per-file enable/disable, error toasts
- Data Model
  - ChangeSet entity storing files, diffs, diagnostics, and Git metadata

## Backend Work

### Auth + GitLab Service
- OAuth flow and token storage in `backend/src/services/gitlab.ts`
- APIs:
  - List repos/branches/tree
  - Fetch file contents
  - Create commits with multiple actions (avoid server-side clone)
  - Create MR, add labels, assign reviewers

### LLM Edit Pipeline
- Endpoint: `POST /code/edits`
  - Inputs: repo id, branch, target paths/globs, user prompt, constraints (max files/patch size)
  - Context building: fetch current file contents and relevant metadata
  - LLM output contract: unified diff or structured patch actions (add/modify/delete)
  - Safety: path whitelist, deny dotfiles/secrets, max tokens/time, rate limiting

### Patch Validation
- Apply patch to a virtual FS snapshot; reject if not clean
- Compute per-file diffs and summaries
- Run static checks:
  - `npm run lint` and `npm run typecheck` (time-box, collect diagnostics)
  - Optional: run tests if small scope and time allows
- Produce diagnostics payload for UI

### Commit/MR Orchestration
- Endpoint: `POST /code/edits/:id/commit`
  - Create working branch `llm/edit-<slug>-<id>` from selected base branch
  - Use GitLab “Create commit with multiple actions” API to apply files
- Endpoint: `POST /code/edits/:id/mr`
  - Open MR with title/body from prompt summary and diagnostics
  - Add labels: `ai-edit`, optional reviewers

### Real-Time Updates
- `services/websocket.ts` topic: `changeset:<id>`
  - Events: queued → generating → validating → ready | failed
  - Payloads: diff summaries, per-file diagnostics, lint/typecheck results

## Extension Work

### UX Flow
- Connect GitLab account; select repo and branch
- Define URL ↔ file mapping:
  - Exact paths or regex patterns (e.g., `/static/js/app.*.js` ↔ `web/app.bundle.js`)
- Prompt editor; show running status and AI reasoning summary
- Diff viewer (per file): original vs patched + diagnostics
- Preview controls: toggle per-file override, revert all
- Actions: Request edit, Revert all, Commit, Create MR, Open MR

### Preview Engine
- Primary: Declarative Net Request (DNR) dynamic rules
  - Redirect matching network requests for JS/CSS/HTML to extension blob URLs
  - Maintain per-tab rule set; clear on tab close or user revert
- Fallback injection:
  - Inject `<style>` for CSS diffs when DNR not applicable
  - Inject `<script>` with module shims for simple JS overrides
- HTML strategies:
  - Prefer DNR response substitution for static HTML routes
  - For SPA frameworks, limited DOM patching of known anchors (best-effort)

### Background/Service Worker
- Persist ChangeSet state per repo/branch
- Connect to backend WS; update state and notify UI
- Build and install DNR rules from ChangeSet
- Serve patched content via `chrome.runtime.getURL` for redirects

### Content Script + UI
- Overlay panel: prompt, diffs, diagnostics, toggles
- Per-file enable/disable; show which rules are active
- Error toasts and safety notices; clear-all button

### Options Page
- GitLab connection, repo browsing, saved mappings
- Permissions and privacy preferences

## Data Model

- ChangeSet
  - id, repo, branch, prompt
  - files: array of PatchFile
  - status: queued | generating | validating | ready | failed
  - diagnostics: lint/typecheck/test results
  - git: workingBranch, commitSha?, mrUrl?, mrIid?
- PatchFile
  - path, action (add|modify|delete)
  - original, patched, diff
  - applyResult (clean|conflict), previewEnabled (bool)

## Security & Safeguards
- Token scopes minimized; per-repo PAT support
- Path whitelist; deny writing to secrets/dotfiles by default
- Patch/file count and size limits
- Redact secrets from prompts and logs
- Explicit consent before enabling JS overrides on a domain
- Clear overrides on domain/tab change; easy “panic” revert
- Audit log for who/what/when applied and pushed

## Testing Strategy
- Unit
  - Diff parsing and patch application
  - DNR rule builder and URL matching
- Integration
  - GitLab API with mocks; OpenAI responses mocked
  - Backend pipeline E2E (generate → validate → payload)
- Extension E2E
  - Headless Chrome: apply CSS/JS override, toggle, revert
- Smoke
  - Open page → apply CSS/JS override → visual confirm → revert

## MVP Milestones

- M1: Repo browse + fetch; extension preview via DNR for CSS/JS
- M2: LLM patch generation + validation; diffs and diagnostics; iterative preview
- M3: Commit + MR endpoints and UI; MR deep link
- M4: Tests, metrics, and hardened guardrails

## Proposed Endpoints

- Auth
  - `POST /auth/gitlab/oauth/callback`
- GitLab
  - `GET /gitlab/repos`
  - `GET /gitlab/repos/:id/branches`
  - `GET /gitlab/repos/:id/tree`
- Edits
  - `POST /code/edits` → returns ChangeSet id
  - `GET /code/edits/:id` → status, diffs, diagnostics
  - WS channel: `changeset:<id>`
- GitOps
  - `POST /code/edits/:id/commit`
  - `POST /code/edits/:id/mr`

## Implementation Notes
- Prefer GitLab “Create commit with multiple actions” to avoid server-side clones
- Keep preview stateless across reloads by recomputing DNR rules from ChangeSet
- Support URL map config for complex apps where bundles are fingerprinted
- Time-box validation steps; surface partial diagnostics rather than blocking

## Open Questions
- What repos/paths are allowed by policy? Team-level allowlist?
- Should we persist ChangeSets server-side long term or ephemeral?
- How do we handle large binary assets (images/fonts) in patches?
- Do we gate JS overrides behind per-domain permission prompts?

## Next Steps
- Confirm milestones and endpoint contracts
- Implement M1 backend browse endpoints and extension DNR preview for CSS/JS
- Add minimal UI to request an edit and toggle preview per-file
