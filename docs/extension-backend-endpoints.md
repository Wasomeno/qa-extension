# Extension → Backend Endpoints

The Chrome extension touches the following backend routes through its UI components and supporting flows.

## Shared Issue & Project Data
- `GET /api/projects`
- `GET /api/projects?search=...`
- `GET /api/projects/{projectId}/users`
- `GET /api/integrations/gitlab/users`
- `GET /api/projects/{projectId}/gitlab/labels`
- `GET /api/projects/gitlab/issues`
- `GET /api/projects/{projectId}/gitlab/issues/{iid}`
- `GET /api/projects/{projectId}/gitlab/issues/{iid}/checklist`
- `PATCH /api/projects/{projectId}/gitlab/issues/{iid}`
- `POST /api/projects/{projectId}/gitlab/issues`
- `POST /api/projects/{projectId}/gitlab/issues/{iid}/notes`

## Issue Creation & AI
- `POST /api/issues`
- `POST /api/issues/generate-from-template`

## Slack Integrations
- `GET /api/integrations/slack/channels`
- `GET /api/integrations/slack/users`
- `POST /api/integrations/slack/post`
- `POST /api/integrations/slack/connect`
- `POST /api/integrations/slack/disconnect`

## GitLab Integrations & Auth
- `POST /api/integrations/gitlab/connect`
- `POST /api/integrations/gitlab/disconnect`
- `GET /api/auth/gitlab`
- `GET /api/auth/gitlab?sessionId=...`
- `GET /api/auth/oauth/session/{sessionId}`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

## File & Evidence Upload
- `POST /api/files/upload`

## Scenario Generator
- `GET /api/scenarios/preview`
- `POST /api/scenarios/export`

## Misc
- `GET /health`

Each endpoint above is referenced by components such as `issue-creator`, `IssueDetail`, `IssueCard`, `options`, `pinned-issues`, the background service worker, or shared hooks (`use-project-labels-query`, `use-users-in-project-query`, etc.).
