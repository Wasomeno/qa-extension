# GitLab QA Agent PRD

## HR Eng

| GitLab QA Agent PRD |  | A CLI-based AI agent utilizing `ax-llm/ax` to manage GitLab issues via natural language. |
| :---- | :---- | :---- |
| **Author**: Pickle Rick **Contributors**: User **Intended audience**: Engineering | **Status**: Draft **Created**: 2026-01-25 | **Self Link**: N/A **Context**: Local Project |

## Introduction

This project aims to build a local CLI agent using the `ax-llm/ax` TypeScript framework. The agent will serve as a natural language interface to GitLab's Issue Tracking system, allowing users to create, modify, and query issues using conversational English.

## Problem Statement

**Current Process:** Users must navigate the GitLab Web UI or remember complex CLI commands to manage issues.
**Primary Users:** Developers, QA Engineers, Project Managers.
**Pain Points:** Context switching between IDE/Terminal and Browser; slow UI navigation for simple tasks like "create a bug".
**Importance:** streamlines the workflow for developers who spend most of their time in the terminal.

## Objective & Scope

**Objective:** Create a functional "QA Agent" that interacts with GitLab API to manage issues, powered by `ax-llm/ax`.
**Ideal Outcome:** A user can type "Create a high priority bug for the login crash" and the agent handles the API calls and confirms the creation.

### In-scope or Goals
-   **Framework**: Use `ax-llm/ax` for the agentic loop and LLM interaction.
-   **LLM Backend**: OpenAI (using provided key).
-   **Integrations**: GitLab API (Issue Management).
-   **Capabilities**:
    -   Create Issue (Title, Description, Labels).
    -   Update Issue (Status, Labels, Assignee - if simple).
    -   List/Search Issues.
    -   Comment on Issues (optional but good for "QA").
-   **Interface**: Simple CLI (Node.js).

### Not-in-scope or Non-Goals
-   Web Interface (React/Next.js is overkill for this phase).
-   Merge Request Management (Scope creep).
-   CI/CD Pipeline triggers.

## Product Requirements

### Critical User Journeys (CUJs)
1.  **Create Issue**:
    -   User: "Create a bug ticket for the white screen error on login."
    -   Agent: Analyzes request, identifies missing info (optional), calls GitLab API.
    -   System: Creates issue.
    -   Agent: "Issue #123 'White screen on login' created."

2.  **Query Issues**:
    -   User: "Show me all open bugs assigned to me."
    -   Agent: Queries GitLab API with filters.
    -   Agent: Lists issues in a readable format.

### Functional Requirements

| Priority | Requirement | User Story |
| :---- | :---- | :---- |
| P0 | Project Setup | As a dev, I need a TypeScript project with `ax-llm/ax` installed. |
| P0 | GitLab Client | As the agent, I need a wrapper to call GitLab API (using `gitlab` npm package or `fetch`). |
| P0 | Ax Agent | As a user, I need the agent to understand my intent and route to the correct tool. |
| P0 | Create Issue Tool | As a user, I want to create issues via text. |
| P0 | Update Issue Tool | As a user, I want to update issues via text. |
| P1 | Read Issue Tool | As a user, I want to list/read issues. |

## Assumptions

-   User has a valid GitLab Personal Access Token (PAT).
-   The OpenAI Key provided is valid and has credits.
-   `ax-llm/ax` is stable enough for tool use (ReAct pattern or similar).

## Risks & Mitigations

-   **Risk**: OpenAI Key leakage. -> **Mitigation**: Use `.env` file, do not commit key.
-   **Risk**: `ax-llm/ax` documentation is sparse. -> **Mitigation**: Rely on TypeScript types and "God Mode" coding skills.

## Business Benefits/Impact/Metrics

-   **Efficiency**: Reduce time to log a bug from 2 mins to 15 seconds.
