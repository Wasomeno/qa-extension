# Design: Logging Payload in Recording Saving Process

## Overview
Add console logging for recording payloads when they are being saved to the backend. This improves observability and debugging capabilities for recording persistence issues.

## Scope
- `src/api/recording.ts`: Log the payload in `saveRecording` function.
- `src/background/index.ts`: Log the payload in the `MessageType.SAVE_BLUEPRINT` message handler.

## Implementation Details

### `src/api/recording.ts`
Add a `console.log` before calling the API to save the recording.
```typescript
export const saveRecording = async (recording: TestRecording) => {
  console.log('[Recording API] Saving recording payload:', recording);
  const response = await api.post<any>('/recordings', {
    body: recording as any,
  });
  // ...
};
```

### `src/background/index.ts`
Add a `console.log` for the `recording` object before `api.post` inside the `MessageType.SAVE_BLUEPRINT` case.

## Verification
- Perform a recording and save it.
- Open Background Page DevTools and content page DevTools to check console logs.
- Verify payload content in the log matches the saved recording.
