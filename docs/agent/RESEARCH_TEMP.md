# Research: Implement Ax Agent

**Date**: 2026-01-25

## 1. Executive Summary
The goal is to implement a QA Agent using `@ax-llm/ax` that interfaces with GitLab. The environment is ready, dependencies are installed, and the `GitLabService` is available.

## 2. Technical Context
- **Dependencies**: `@ax-llm/ax` (v16.0.10), `dotenv` (v17.2.3) are present in `package.json`.
- **Service**: `src/services/gitlab.ts` exports `GitLabService` with:
  - `createIssue(projectId, title, description, labels)`
  - `updateIssue(projectId, issueIid, updates)`
  - `listIssues(projectId, params)`
- **Target File**: `src/agent/qa-agent.ts` (does not exist).

## 3. Findings & Analysis
- **Ax Integration**: The user requested `Ax.AiAgent`. The agent needs to wrap `GitLabService` methods as tools.
- **Authentication**: `GitLabService` takes a token. `Ax.OpenAI` needs `OPENAI_API_KEY`.
- **Logic**: The agent will receive a query, process it using the LLM and tools, and return a response.

## 4. Technical Constraints
- Must load `dotenv` to get environment variables.
- Must import `Ax` from `@ax-llm/ax`.
- Must export `QAAgent`.

## 5. Architecture
- **Class**: `QAAgent extends Ax.AiAgent`
- **Constructor**: Initialize `Ax.OpenAI` and `GitLabService`.
- **Tools**: Define tools for `create_issue`, `update_issue`, `list_issues` linking to the service methods.
