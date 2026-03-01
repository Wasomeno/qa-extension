 # Agent Recorded Playback Implementation Plan
 
 > **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
 
 **Goal:** Enable the QA Agent to record its own test execution process for auditing.
 
 **Architecture:** Update the agent's `runRecordedTest` tool to accept a `record` flag, and update the background script to orchestrate the recorder during playback.
 
 **Tech Stack:** TypeScript, Chrome Extension API (Tabs, Storage, Messaging, Offscreen).
 
 ---
 
 ### Task 1: Update Agent Tool Definition
 
 **Files:**
 - Modify: `/Users/kevinananda/Codes/qa-extension/src/agent/agent/qa-agent.ts`
 
 **Step 1: Update tool parameter definition**
 
 Add `record` parameter to `runRecordedTest` in the `tools` array.
 
 ```typescript
 {
   name: 'runRecordedTest',
   description: 'Run a recorded automation test...',
   parameters: {
     type: Type.OBJECT,
     properties: {
       testId: { type: Type.STRING, description: '...' },
       variables: { type: Type.OBJECT, description: '...' },
       record: { type: Type.BOOLEAN, description: 'Whether to capture video evidence of the test execution.' }
     },
     required: ['testId']
   }
 }
 ```
 
 **Step 2: Update tool implementation to pass record flag**
 
 In the `switch(name)` block for `runRecordedTest`, include `record: !!safeArgs.record` in the message payload.
 
 ```typescript
 chrome.runtime.sendMessage({
   type: MessageType.START_PLAYBACK,
   data: {
     blueprint,
     waitForCompletion: true,
     variables: safeArgs.variables || {},
     record: !!safeArgs.record, // Pass the flag
   },
 }, ...)
 ```
 
 **Step 3: Commit**
 
 ```bash
 git add src/agent/agent/qa-agent.ts
 git commit -m "feat(agent): add record parameter to runRecordedTest tool"
 ```
 
 ### Task 2: Orchestrate Recorder in Background
 
 **Files:**
 - Modify: `/Users/kevinananda/Codes/qa-extension/src/background/index.ts`
 
 **Step 1: Update START_PLAYBACK handler**
 
 If `message.data.record` is true, call `this.startRecordingFlow` before creating the tab.
 
 ```typescript
 case MessageType.START_PLAYBACK:
   const { blueprint, waitForCompletion, record } = message.data || {};
   // ...
   if (record) {
     await this.startRecordingFlow(undefined, -1, `audit-${blueprint.id}-${Date.now()}`);
   }
   // ... proceed with tab creation
 ```
 
 **Step 2: Update PLAYBACK_STATUS_UPDATE handler**
 
 Detect if a recorded playback finished and stop the recording.
 
 ```typescript
 case MessageType.PLAYBACK_STATUS_UPDATE:
   if (message.data.status === 'completed' || message.data.status === 'failed') {
     const isRecording = (await chrome.storage.local.get(['isRecording'])).isRecording;
     if (isRecording) {
       await this.stopRecording();
     }
     // ... existing logic to resolve pending playback
   }
 ```
 
 **Step 3: Commit**
 
 ```bash
 git add src/background/index.ts
 git commit -m "feat(background): orchestrate recording during agent playback"
 ```
 
 ### Task 3: Verification
 
 **Step 1: Test the flow**
 
 1. Load the extension in Chrome.
 2. Open the agent chat.
 3. Ask: "Run test [ID] and record it."
 4. Verify that a new tab opens and the 'REC' badge appears in the extension icon.
 5. Verify that the recording is stopped and saved after the test finishes.
 
