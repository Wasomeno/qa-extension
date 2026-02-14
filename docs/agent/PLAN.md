# QA Agent CLI Implementation Plan

## Overview
Implement a CLI for the QA Agent using `readline` and refactor the `QAAgent` class to correctly use the `@ax-llm/ax` v16 library.

## Current State Analysis
- `src/agent/qa-agent.ts` imports `AiAgent` and `OpenAI` which are not exported by `@ax-llm/ax`.
- `src/index.ts` is missing.
- `src/test-agent.ts` exists but uses the broken `QAAgent`.
- Dependencies: `@ax-llm/ax`, `dotenv`, `gitlab`.

## Implementation Approach
1.  **Fix `QAAgent`**: Rewrite `src/agent/qa-agent.ts` to use `AxAgent` or `AxAIService` correctly. Given the simplicity, we will wrap `AxAIOpenAI` and register tools manually if `AxAgent` doesn't support the `addTool` syntax directly (which it doesn't seem to, based on `index.d.ts`). We will use `AxAgent` factory if possible, or just manage the service.
    *   *Correction*: `AxAgent` (class) exists but takes a signature. The existing code uses `addTool`. This suggests the original code was written for a different library or version. I will refactor it to use `AxAIOpenAI` directly and pass tools to the `chat` request, OR use `AxAgent` if I can figure out the tools part.
    *   *Decision*: I will use `AxAIOpenAI` directly as the `ai` property of `QAAgent`. I will store tools in `QAAgent` and pass them in the `functions` field of the chat request.

2.  **Implement CLI**: Create `src/index.ts` with a `readline` loop.

## Phase 1: Refactor QAAgent
### Changes Required:
#### 1. `src/agent/qa-agent.ts`
**Changes**:
- Remove `extends AiAgent`.
- Import `AxAIOpenAI`, `AxAIService`, `AxFunction`.
- Class `QAAgent`:
    - `private ai: AxAIService;`
    - `private tools: AxFunction[] = [];`
    - `constructor()`: Initialize `AxAIOpenAI`.
    - `registerTools()`: Define tools (create_issue, etc.) and push to `this.tools`.
    - `chat(input: string)`:
        - Call `this.ai.chat({ chatPrompt: [...], functions: this.tools })`.
        - Return the response content.

#### 2. `src/services/gitlab.ts`
**Changes**:
- Verify it exports `GitLabService`. (Assumed correct for now, but will check).

### Success Criteria:
- `src/agent/qa-agent.ts` compiles.

## Phase 2: Implement CLI
### Changes Required:
#### 1. `src/index.ts`
**Changes**:
- Import `readline`, `QAAgent`.
- Function `main()`:
    - Check `process.env.GITLAB_TOKEN`.
    - If missing, prompt user using `readline`.
    - Instantiate `QAAgent`.
    - Start `while(true)` loop (or recursive function) for chat.
    - Handle `exit`, `quit`.
    - Call `agent.chat(input)`.
    - Print output.

### Success Criteria:
- `npx ts-node src/index.ts` starts the CLI.
- It responds to "help" or simple prompts.

## Phase 3: Cleanup
- Remove `src/test-agent.ts` if redundant.
- Ensure `tsconfig.json` is correct for `ts-node`.

