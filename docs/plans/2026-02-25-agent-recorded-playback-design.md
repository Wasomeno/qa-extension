 # Design: Agent Recorded Playback (Execution Evidence)
 
 ## Overview
 This feature enables the QA Agent to automatically record its own test execution process for auditing and evidence collection. When triggered, the system will capture a video and a log of the agent's actions during a test run.
 
 ## Goals
 - Provide high-fidelity execution evidence for test runs performed by the agent.
 - Allow the agent to fulfill requests like "Run this test and record it for the audit log."
 - Automate the synchronization between the playback engine and the recording system.
 
 ## Architecture
 
 ### 1. Agent Tooling
 The `runRecordedTest` tool in `src/agent/agent/qa-agent.ts` will be updated to include an optional `record` parameter.
 
 ```typescript
 {
   name: 'runRecordedTest',
   description: '...',
   parameters: {
     type: Type.OBJECT,
     properties: {
       testId: { type: Type.STRING },
       variables: { type: Type.OBJECT },
       record: { type: Type.BOOLEAN, description: 'Whether to capture video evidence of the test execution.' }
     },
     required: ['testId']
   }
 }
 ```
 
 ### 2. Background Service (Orchestrator)
 The `BackgroundService` in `src/background/index.ts` will manage the lifecycle of the recording:
 - **Start:** When `START_PLAYBACK` is received with `record: true`, it will invoke the recording flow.
 - **Capture:** It will use the existing offscreen screen capture mechanism.
 - **Stop:** It will automatically stop the recording when `PLAYBACK_STATUS_UPDATE` reports a terminal status (`completed` or `failed`).
 
 ### 3. Recorder Integration
 - The recorder will be configured to run in "Audit Mode," meaning it won't show the initial overlay modal to the user, but will immediately start capturing the target tab created for playback.
 
 ## User Flow
 1. User: "Run the 'Login Flow' test and record the execution."
 2. Agent: "Starting 'Login Flow' with recording enabled..."
 3. System: Opens playback tab + Starts Screen Recording.
 4. System: Playback completes.
 5. System: Recording saved + ID generated.
 6. Agent: "Test 'Login Flow' passed. You can view the recording here: [Link]"
 
 ## Technical Considerations
 - **Permissions:** Screen recording requires a one-time user permission in Chrome. The agent should detect if permissions are missing and inform the user.
 - **Performance:** Recording + Playback in parallel might be resource-intensive on some machines.
 - **Data Storage:** Recordings will be stored using the existing `videoStorage` service.
 
