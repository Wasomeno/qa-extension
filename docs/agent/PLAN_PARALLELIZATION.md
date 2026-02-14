# Plan: Parallel Tool Execution for QA Agent

## 1. Objective
Optimize the `QAAgent` to execute multiple tool calls requested by the LLM in parallel, rather than sequentially. This will significantly reduce latency when the agent needs to perform multiple independent actions (e.g., "Check status of issue #1 and issue #2").

## 2. Current State Analysis
**File:** `src/agent/qa-agent.ts`

Currently, the `chat` method handles function calls in a sequential `for...of` loop:
```typescript
for (const call of result.functionCalls) {
  // ... find tool ...
  // ... await tool.func(args) ...
  // ... push result ...
}
```
This means if the agent requests 3 tools that take 2 seconds each, the user waits 6+ seconds.

## 3. Implementation Strategy

### 3.1. Parallelization Logic
We will replace the `for...of` loop with `Promise.all()`. We will map over `result.functionCalls` to create an array of execution promises.

### 3.2. Robust Error Handling
`Promise.all` fails fast if any promise rejects. To prevent one failed tool call from crashing the entire batch (or hiding results from successful ones), we must ensure the individual promises **never reject**.

Each promise will:
1.  Parse arguments.
2.  Execute the tool.
3.  Return the formatted success result.
4.  Catch any errors internally and return a formatted error result.

### 3.3. Ordering
While `Promise.all` maintains the order of results relative to the input array, the specific order of `toolOutputs` in the `history` array doesn't strictly matter to the LLM as long as the `functionId` matches. However, keeping them in the same order as the request is cleaner for debugging.

## 4. Detailed Implementation Steps

1.  **Modify `src/agent/qa-agent.ts`**:
    *   Locate the `chat` method's main loop.
    *   Identify the block checking `if (!result.functionCalls ...)`.
    *   Replace the sequential loop with a `map` operation that returns promises.
    *   Implement the `executeToolCall` helper logic (inline or separate method):
        *   Input: `call` object (from `result.functionCalls`).
        *   Action: Find tool, parse args, `await tool.func()`.
        *   Output: Object matching `{ role: "function", functionId: call.id, result: string }`.
    *   Wrap the execution in a `try/catch` block.
        *   On success: `JSON.stringify(toolResult)`.
        *   On failure: `JSON.stringify({ error: e.message })` (or just the message string, but JSON is safer for the LLM to parse).
    *   Await `Promise.all(toolPromises)`.
    *   Push the resulting array to `this.history` (spread operator).

## 5. Verification Plan

### 5.1. Test Case 1: Multiple Independent Reads
*   **Prompt:** "Search for projects named 'alpha' and 'beta' at the same time."
*   **Expected Behavior:**
    *   Agent emits `search_projects(alpha)` and `search_projects(beta)`.
    *   Logs show "Executing Tool: search_projects" appearing twice *before* "Tool search_projects Completed" appears.
    *   Total time is roughly max(time_alpha, time_beta), not sum.

### 5.2. Test Case 2: Mixed Success/Failure
*   **Prompt:** "Create an issue in project ID 123 (valid) and project ID 999999 (invalid)."
*   **Expected Behavior:**
    *   Both tools run.
    *   Agent receives one success result and one error result.
    *   Agent reports back: "Created issue in 123, but failed for 999 because..."

## 6. Risks & Mitigations
*   **Risk:** Rate Limiting (GitLab API).
    *   *Mitigation:* Parallel calls might hit rate limits faster. Since we are a single user, this is unlikely to be an issue, but we should be aware.
*   **Risk:** Dependent calls (Race Conditions).
    *   *Mitigation:* LLMs typically only output parallel calls if they think they are independent. If the LLM tries to "Create project" and "Create issue in that project" in one step, it's a hallucination/logic error. We rely on the LLM's planning capability here. (Ax-LLM / GPT-4o is generally good at this).
