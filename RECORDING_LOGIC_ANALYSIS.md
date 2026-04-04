# Test Recording Logic Deep Analysis

## Overview

The test recording system captures user interactions on web pages and transforms them into executable test blueprints. This document provides a comprehensive analysis of the recording architecture, components, and data flow.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CHROME EXTENSION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │   Popup UI   │────▶│   Background │────▶│   Content Script        │  │
│  │   (User)     │     │   Service    │     │   (EventLogger)         │  │
│  └──────────────┘     └──────────────┘     └─────────────────────────┘  │
│         │                    │                        │                  │
│         │                    ▼                        │                  │
│         │             ┌──────────────┐                 │                  │
│         │             │ AI Processor │                 │                  │
│         │             │  (Gemini)    │                 │                  │
│         │             └──────────────┘                 │                  │
│         │                    │                          │                  │
│         │                    ▼                          ▼                  │
│         │             ┌──────────────────────────────────────┐           │
│         │             │         Offscreen Document           │           │
│         │             │      (Video Capture via CDP)         │           │
│         │             └──────────────────────────────────────┘           │
│         │                                                               │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │  Iframe UI   │────▶│   Storage    │     │      DOM Utils          │  │
│  │  (recorder)  │     │  (session/   │◀────│  (Element Info)        │  │
│  │              │     │   local)      │     │                         │  │
│  └──────────────┘     └──────────────┘     └─────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 EventLogger (`src/content/recorder/event-logger.ts`)

The `EventLogger` is the heart of the recording system. It captures user interactions directly from the web page.

#### Class: `EventLogger`

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `isRecording` | `boolean` | Flag indicating if recording is active |
| `onEventCaptured` | `(event: RawEvent) => void` | Callback when an event is captured |
| `shadowHostId` | `string` | ID of the shadow DOM host to ignore |

**Methods:**

##### `start()`
Attaches event listeners to the window to capture user interactions.

```typescript
public start() {
  if (this.isRecording) return;
  this.isRecording = true;
  
  window.addEventListener('click', this.handleEvent, true);
  window.addEventListener('input', this.handleEvent, true);
  window.addEventListener('change', this.handleEvent, true);
}
```

**Events Captured:**
- `click` - Mouse clicks on elements
- `input` - Text input into form fields
- `change` - Value changes in select/dropdowns

##### `stop()`
Removes event listeners and stops recording.

##### `handleEvent(event: Event)`
Core event processing logic:

1. **Target Resolution:** Uses `getActionableTarget()` to find the semantic interactive element
2. **Shadow DOM Filtering:** Ignores events from the extension's own Shadow DOM
3. **Event Packaging:** Creates a `RawEvent` object with:
   - Event type
   - Timestamp
   - Element information
   - Current URL
   - Viewport dimensions
   - Input value (if applicable)
4. **Forwarding:** Sends to both callback and background service

#### Target Resolution Strategy

The `getActionableTarget()` method traverses up the DOM tree to find the best semantic element:

```typescript
const interactiveSelectors = [
  'button', 'a[href]', 'input', 'textarea', 'select',
  '[role="button"]', '[role="link"]', '[role="menuitem"]',
  '[role="tab"]', '[role="option"]', '[role="gridcell"]',
  '[role="treeitem"]', 'label',
  '[data-testid]', '[data-test-id]', '[data-qa]', '[data-cy]',
  'td[title]'
];
```

**Algorithm:**
1. For `input`/`change` events: Find the closest form control
2. For `click` events: Traverse up looking for semantic interactive elements
3. Stops at `document.body` to avoid capturing extension UI

#### Shadow DOM Protection

The `isEventFromShadowDOM()` method prevents capturing events from the extension's own iframe:

```typescript
private isEventFromShadowDOM(element: HTMLElement): boolean {
  let current: Node | null = element;
  while (current) {
    if (current instanceof HTMLElement && current.id === this.shadowHostId) {
      return true;
    }
    current = current.parentNode || (current as any).host;
  }
  return false;
}
```

---

### 2.2 Content Script Entry Point (`src/content/recorder/index.tsx`)

Initializes the recording infrastructure within the target web page.

#### Iframe Management

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Page                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    QA Recorder Iframe                       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐ │ │
│  │  │  Hidden     │  │   Overlay   │  │    Recording       │ │ │
│  │  │  (0x0 px)   │  │  (Full VP)  │  │    (340x430px)     │ │ │
│  │  └─────────────┘  └─────────────┘  └────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Iframe States:**

| State | Size | Position | Pointer Events | Purpose |
|-------|------|----------|----------------|---------|
| `hidden` | 0x0 | - | none | Initial state, no interference |
| `overlay` | 100vw x 100vh | top-left | auto | Shows start button modal |
| `recording` | 340x430px | bottom-right | auto | Recording controls visible |

#### Message Flow

```
┌─────────┐    OPEN_RECORDING_OVERLAY    ┌─────────┐
│ Popup/  │ ────────────────────────────▶│ Content │
│ Menu    │                              │ Script  │
└─────────┘                              └────┬────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │  Iframe (Show   │
                                     │   Start Button) │
                                     └────────┬────────┘
                                              │
                                              ▼
                              ┌──────────────────────────┐
                              │ User Clicks Start       │
                              │ IFRAME_STARTED_RECORDING│
                              └────────────┬─────────────┘
                                           │
                                           ▼
                              ┌──────────────────────────┐
                              │ EventLogger.start()      │
                              │ + Iframe State: Recording│
                              └──────────────────────────┘
```

---

### 2.3 Background Service (`src/background/index.ts`)

Orchestrates the recording session, video capture, and AI processing.

#### Recording Flow

```
1. START_RECORDING
   └─▶ openIssueCreator() [placeholder]
   └─▶ Notify target tab via OPEN_RECORDING_OVERLAY

2. ACTUAL_START_RECORDING
   └─▶ startRecordingFlow(projectId, targetTabId, recordingId)
       ├─ Clear previous events
       ├─ Generate recording ID: `rec-{timestamp}`
       ├─ Store session state
       ├─ Set badge: "REC" (red)
       └─ Start offscreen video capture

3. TRACK_INTERACTION (per event)
   └─▶ Push to recordingEvents[]
   └─▶ Persist to session storage for recovery

4. STOP_RECORDING
   └─▶ stopRecording()
       ├─ Stop video capture
       ├─ Collect events from all sources
       ├─ Deduplicate by timestamp+type
       ├─ Sort by timestamp
       ├─ Call AI processor
       ├─ Wait for video upload
       └─ Broadcast BLUEPRINT_GENERATED
```

#### Video Capture (Offscreen Document)

The extension uses Chrome's Offscreen Document API for native screen capture:

```typescript
// Start native capture
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
  justification: 'Capture screen video via getDisplayMedia'
});
```

---

### 2.4 AI Processor (`src/services/ai-processor.ts`)

Transforms raw events into structured test blueprints using Google's Gemini AI.

#### Model Configuration

```typescript
const model = this.genAI.getGenerativeModel({
  model: 'gemini-3.1-flash-lite-preview',
  generationConfig: {
    responseMimeType: 'application/json',
  },
});
```

#### Prompt Engineering

The AI prompt instructs the model to:

1. **Always include navigation** as the first step
2. **Prioritize selectors** (ID > Data-testid > Role+Text > XPath)
3. **Use single quotes** in XPath to avoid JSON escaping issues
4. **Avoid brittle selectors** (naked tags, nth-child)
5. **Group related actions** into logical steps
6. **Preserve literal values** (no parameterization)

---

## 3. Data Types

### 3.1 RawEvent

The foundational event type captured during recording:

```typescript
export interface InteractionEvent {
  type: 'click' | 'input' | 'scroll' | 'hover' | 'focus' | 'navigation';
  timestamp: number;
  element: {
    tagName: string;
    id?: string;
    className?: string;
    selector: string;
    selectorCandidates?: string[];
    xpath?: string;
    xpathCandidates?: string[];
    textContent?: string;
    attributes?: Record<string, string>;
    parentInfo?: {
      tagName: string;
      id?: string;
      selector?: string;
      attributes?: Record<string, string>;
    };
    structuralInfo?: {
      depth: number;
      siblingIndex: number;
      totalSiblings: number;
    };
  };
  position?: { x: number; y: number };
  value?: string;  // Input values
  url: string;
  viewport: { width: number; height: number };
}
```

### 3.2 TestBlueprint

The output of AI processing:

```typescript
export interface TestBlueprint {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  project_id?: number;
  issue_id?: string;
  auth?: {
    type: 'sessionState';
    storageStatePath?: string;
    requiresAuth: boolean;
  };
  setup?: TestStep[];
  steps: TestStep[];
  teardown?: TestStep[];
  parameters: string[];
  status?: 'processing' | 'ready' | 'failed';
  error?: string;
  video_url?: string;
}
```

### 3.3 TestStep

Individual test actions:

```typescript
export interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  selectorCandidates?: string[];
  xpath?: string;
  xpathCandidates?: string[];
  parentSelector?: string;
  elementHints?: {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    parentInfo?: {...};
    structuralInfo?: {...};
  };
  value?: string;
  description: string;
  expectedValue?: string;
  assertionType?: 'equals' | 'contains' | 'exists' | 'not_exists' | 'visible' | 'hidden';
  isAssertion?: boolean;
  fallbackPolicy?: 'agent_resolve' | 'fail';
  timeoutMs?: number;
  retryCount?: number;
}
```

---

## 4. Element Information Capture

### 4.1 DOM Utils (`src/utils/dom.ts`)

The `getElementInfo()` function extracts comprehensive element data:

#### Selector Generation Priority

1. **Data-testid Attributes** (Highest)
   ```typescript
   ['data-testid', 'data-test-id', 'data-qa', 'data-cy']
   ```

2. **Semantic + Accessible**
   ```typescript
   [role='button'][aria-label='Submit']
   ```

3. **Labels** (for inputs)
   ```typescript
   label:has-text('Email') + input
   ```

4. **Stable ID**
   ```typescript
   #submit-button
   ```

5. **Stable Classes** (filtered)
   - Ignores: Ant Design, Emotion, Styled Components
   - Keeps: meaningful, non-minified class names

6. **Limited Path** (Last resort)
   ```typescript
   div.container > form.login-form > button.submit
   ```

#### XPath Generation

```typescript
export function generateXPath(element: Element): string {
  // Priority order:
  // 1. Stable attributes (data-testid, aria-*, etc.)
  // 2. Stable ID
  // 3. Attribute-based path with nth-child
}
```

**XPath Candidates Generated:**
- Text-based: `//button[.='Submit']`
- Attribute-based: `//*[@data-testid='submit-btn']`
- Role-based: `//li[@role='menuitem']`
- Combined: `//button[@role='button' and @aria-label='Close']`

---

## 5. Storage Strategy

### 5.1 Session Storage (Recovery)

```typescript
chrome.storage.session.set({
  currentRecording: {
    id: string;
    events: RawEvent[];
  }
});
```

Used for crash recovery within a browser session.

### 5.2 Local Storage (State)

```typescript
chrome.storage.local.set({
  isRecording: boolean;
  currentRecordingProjectId: number;
  currentRecordingId: string;
  currentRecordingStartUrl: string;
});
```

Persists recording state across restarts.

### 5.3 Event Buffer (Background)

```typescript
private recordingEvents: RawEvent[] = [];
```

In-memory buffer in the background service for quick access.

---

## 6. Event Flow Diagram

```
User Interaction on Web Page
          │
          ▼
┌─────────────────────────────────┐
│   Content Script: EventLogger  │
│   - handleEvent()              │
│   - getActionableTarget()      │
│   - getElementInfo()            │
└───────────────┬─────────────────┘
                │
                ▼
    ┌───────────────────────────┐
    │   Event Packaging          │
    │   - type, timestamp        │
    │   - element info          │
    │   - value, url, viewport  │
    └───────────────┬───────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────────────┐
│  Callback       │   │  chrome.runtime.send    │
│  (local)        │   │  MessageType.TRACK...   │
└─────────────────┘   └───────────┬─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Background Service      │
                    │  - Push to events[]     │
                    │  - Persist to session   │
                    │  - Broadcast state      │
                    └─────────────────────────┘
                                 │
                                 ▼ (on STOP_RECORDING)
                    ┌─────────────────────────┐
                    │  AI Processor (Gemini)   │
                    │  - Generate blueprint   │
                    │  - Enrich steps         │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Save & Broadcast        │
                    │  - BLUEPRINT_GENERATED   │
                    │  - Upload video (R2)     │
                    └─────────────────────────┘
```

---

## 7. Key Features

### 7.1 Smart Element Targeting
- Traverses DOM to find semantic elements (buttons, links, inputs)
- Ignores Shadow DOM of extension iframe
- Captures multiple selector candidates for robust playback

### 7.2 Recovery Mechanisms
- Session storage persistence for crash recovery
- Multi-source event collection (memory, session, tab)
- Deduplication by timestamp + type

### 7.3 Video Recording
- Uses Offscreen Document API with `DISPLAY_MEDIA`
- Captures via `getDisplayMedia()` for native screen recording
- Uploads to Cloudflare R2 for storage

### 7.4 AI Enhancement
- Gemini Flash for fast processing
- Strict selector guidelines to avoid flakiness
- Automatic step grouping and assertion generation

---

## 8. Limitations & Considerations

1. **Event Types:** Only captures `click`, `input`, and `change` events
2. **Cross-Origin:** Cannot capture events in iframes from different origins
3. **Shadow DOM:** Limited support for elements inside Shadow DOMs
4. **AI Dependency:** Blueprint quality depends on Gemini API availability
5. **Selector Stability:** Relies on stable DOM attributes; dynamic classes may fail

---

## 9. Message Types Reference

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `TRACK_INTERACTION` | Content → Background | Event captured |
| `IFRAME_LOG_EVENT` | Content → Background | Event from iframe |
| `IFRAME_STARTED_RECORDING` | Iframe → Background → Content | Start recording |
| `IFRAME_STOP_RECORDING` | Iframe → Background → Content | Stop recording |
| `START_VIDEO_CAPTURE` | Background → Offscreen | Begin video |
| `STOP_VIDEO_CAPTURE` | Background → Offscreen | End video |
| `BLUEPRINT_GENERATED` | Background → All | AI processing done |

---

## 10. Extension Manifest Requirements

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "offscreen",
    "debugger"
  ],
  "host_permissions": ["<all_urls>"]
}
```

---

*Document generated: 2026-04-04*
*Source files:*
- `src/content/recorder/event-logger.ts`
- `src/content/recorder/index.tsx`
- `src/background/index.ts`
- `src/services/ai-processor.ts`
- `src/types/recording.ts`
- `src/utils/dom.ts`
