# Recording Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement console logging for recording payloads when they are being saved.

**Architecture:** Add `console.log` statements in the API client and background message handler to capture the recording object before it's sent to the backend.

**Tech Stack:** TypeScript, Chrome Extension API.

---

### Task 1: Add logging to `src/api/recording.ts`

**Files:**
- Modify: `src/api/recording.ts`

**Step 1: Modify `src/api/recording.ts`**
Add the console log in `saveRecording` function.

```typescript
export const saveRecording = async (recording: TestRecording) => {
  console.log('[Recording API] Saving recording payload:', recording);
  const response = await api.post<any>('/recordings', {
    body: recording as any,
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to save recording');
  }
  return response.data;
};
```

**Step 2: Commit**
```bash
git add src/api/recording.ts
git commit -m "feat: add logging to saveRecording"
```

### Task 2: Add logging to `src/background/index.ts`

**Files:**
- Modify: `src/background/index.ts`

**Step 1: Modify `src/background/index.ts`**
Add the console log in `MessageType.SAVE_BLUEPRINT` handler.

```typescript
// Find the MessageType.SAVE_BLUEPRINT case
// ...
          // Map TestBlueprint to TestRecording...
          const recording: TestRecording = {
            // ...
          };

          console.log('[Background] Saving recording payload:', recording); // ADD THIS LINE

          const response = await api.post<any>('/recordings', {
            body: recording as any,
          });
// ...
```

**Step 2: Commit**
```bash
git add src/background/index.ts
git commit -m "feat: add logging to background SAVE_BLUEPRINT handler"
```

### Task 3: Verification

**Step 1: Verify changes**
- Build the project (`npm run build`).
- Load the extension in Chrome.
- Perform a recording and trigger a save.
- Open DevTools for the background page and the extension's UI to verify the logs.
