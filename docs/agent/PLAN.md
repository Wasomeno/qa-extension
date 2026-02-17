# Plan: Fix Recording Bridge Double-Popup and Minimization

## Objective
Fix the issue where the recording tab picker appears twice and the bridge window fails to minimize after selection.

## Analysis
1.  **Double Popup:** The `startRecording` method in `BackgroundService` (`src/background/index.ts`) handles `MessageType.START_RECORDING`. It spawns an async process to create a window. If the user clicks "Start Recording" multiple times rapidly (or if the message is sent multiple times), multiple windows are created, leading to multiple pickers.
2.  **Minimization:** The `src/background/picker.ts` script handles the desktop media selection. It currently proceeds to `getUserMedia` without minimizing the hosting window (`picker.html`), leaving the "bridge" window visible.

## Proposed Changes

### 1. Prevent Concurrent Recording Starts
**File:** `src/background/index.ts`
- Add a `private isStartingRecording = false;` property to `BackgroundService`.
- in `startRecording`:
    - Check `if (this.isStartingRecording) return;` (or throw).
    - Set `this.isStartingRecording = true` at the start.
    - Ensure it is reset to `false` in `finally` blocks or error handlers.
    - Also ensure it is reset if `chrome.windows.create` fails.

### 2. Minimize Bridge Window on Selection
**File:** `src/background/picker.ts`
- In `startRecordingFlow`:
    - After `chrome.desktopCapture.chooseDesktopMedia` resolves with a `streamId` (and before `getUserMedia`):
    - Get the current window using `chrome.windows.getCurrent()`.
    - Call `chrome.windows.update(window.id, { state: 'minimized' })` to minimize the bridge window.

## Verification
- Verify that clicking "Start Recording" multiple times only opens one picker.
- Verify that selecting a tab minimizes the bridge window.
- Verify that recording continues while minimized.

