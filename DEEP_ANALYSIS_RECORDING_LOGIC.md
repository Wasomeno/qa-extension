# Deep Analysis: Recording Logic

## Overview

The recording system captures user interactions on web pages and transforms them into executable test blueprints. This document provides a comprehensive analysis of the recording architecture, components, data flow, and transformation pipeline.

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
│         │             │  (Gemini)     │                 │                  │
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

#### Class Structure

```typescript
export class EventLogger {
  private isRecording: boolean = false;
  private onEventCaptured?: (event: RawEvent) => void;
  private shadowHostId: string;

  constructor(
    shadowHostId: string,
    onEventCaptured?: (event: RawEvent) => void
  ) {
    this.shadowHostId = shadowHostId;
    this.onEventCaptured = onEventCaptured;
    this.handleEvent = this.handleEvent.bind(this);
  }
}
```

#### Event Capture Methods

##### `start()`
Attaches event listeners to capture user interactions:

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
| Event Type | Trigger | Purpose |
|------------|---------|---------|
| `click` | Mouse click | Captures button/link interactions |
| `input` | Text input | Captures form field typing |
| `change` | Select/input change | Captures dropdown selections |

##### `stop()`
Removes all event listeners:

```typescript
public stop() {
  if (!this.isRecording) return;
  this.isRecording = false;
  
  window.removeEventListener('click', this.handleEvent, true);
  window.removeEventListener('input', this.handleEvent, true);
  window.removeEventListener('change', this.handleEvent, true);
}
```

#### Core Event Processing (`handleEvent`)

The `handleEvent` method is the central processing unit:

```typescript
private handleEvent(event: Event) {
  if (!this.isRecording) return;

  // 1. Target Resolution: Find semantic interactive element
  const rawTarget = event.target as HTMLElement;
  const target = this.getActionableTarget(rawTarget, event.type);
  if (!target || this.isEventFromShadowDOM(target)) return;

  // 2. Create RawEvent with full context
  const interactionEvent: RawEvent = {
    type: event.type as any,
    timestamp: Date.now(),
    element: getElementInfo(target),
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    isTrusted: event.isTrusted,
  };

  // 3. Capture input values
  if (target instanceof HTMLInputElement || ...) {
    interactionEvent.value = target.value;
  }

  // 4. Dual dispatch: callback + background service
  if (this.onEventCaptured) {
    this.onEventCaptured(interactionEvent);
  }
  chrome.runtime.sendMessage({
    type: MessageType.TRACK_INTERACTION,
    data: interactionEvent,
  });
}
```

---

### 2.2 Target Resolution Strategy

The `getActionableTarget()` method implements intelligent element resolution:

```typescript
private getActionableTarget(
  target: HTMLElement | null,
  eventType: string
): HTMLElement | null {
  // For input/change events, immediately return the form element
  if (eventType === 'input' || eventType === 'change') {
    return target.closest('input, textarea, select, [contenteditable="true"]');
  }

  // Traverse up to find semantic interactive element
  const interactiveSelectors = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="gridcell"]',
    '[role="treeitem"]',
    'label',
    '[data-testid]',
    '[data-test-id]',
    '[data-qa]',
    '[data-cy]',
    'td[title]',
  ];

  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    if (current.matches(interactiveSelectors.join(', '))) {
      return current;
    }
    current = current.parentElement;
  }

  return target;
}
```

**Key Features:**
- **Semantic Traversal**: Walks up DOM tree to find meaningful interactive elements
- **Shadow DOM Filtering**: `isEventFromShadowDOM()` prevents capturing extension UI events
- **Form Element Direct Access**: Input events directly target form controls

---

## 3. DOM Element Information Extraction

### 3.1 `getElementInfo()` (`src/utils/dom.ts`)

This function extracts comprehensive element information:

```typescript
export function getElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();
  
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: generateSelector(element),
    selectorCandidates: generateSelectorCandidates(element),
    xpath: generateXPath(element),
    xpathCandidates: xpathCandidates.map(c => c.xpath),
    textContent: element.textContent?.trim().substring(0, 100),
    attributes: { /* id, class, name, role, aria-* */ },
    position: { x: rect.left + scrollX, y: rect.top + scrollY },
    size: { width: rect.width, height: rect.height },
    parentInfo: { /* tagName, id, selector */ },
    structuralInfo: { depth, siblingIndex, totalSiblings },
  };
}
```

### 3.2 Selector Generation Pipeline

The system generates multiple selector strategies for maximum reliability:

#### Priority 1: Data Test Attributes (Golden Selectors)
```typescript
[data-testid='login-btn']
[data-test-id='submit-button']
[data-cy='username-input']
[data-qa='password-field']
```

#### Priority 2: Semantic Combinations
```typescript
// Role + Aria Label
button[role='button'][aria-label='Submit']
a[role='link'][aria-label='View Profile']

// Role + Text Content (Playwright-style)
li[role='menuitem']:has-text('Settings')
a[role='link']:has-text('Learn More')
```

#### Priority 3: Stable Attributes
```typescript
// Name attribute
input[name='username']

// Placeholder
input[placeholder='Enter email']

// Stable ID (filtered out unstable patterns)
#submit-button
```

#### Priority 4: XPath Fallbacks
```typescript
// Text-based (most robust)
"//button[.='Submit Form']"
"//li[normalize-space(.)='Settings']"

// Attribute-based
"//input[@data-testid='username']"
```

### 3.3 Stability Filters

```typescript
function isLikelyStableClassName(className: string): boolean {
  // Filter out:
  // - Hash-based classes (>40 chars)
  // - Numeric-heavy classes
  // - Framework patterns (ant-*, rc-*, css-*, sc-*)
  // - CSS Modules patterns
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(className);
}

function isStableId(id: string): boolean {
  // Filter out:
  // - Pure numeric IDs
  // - Framework auto-generated IDs
  // - Hash patterns (id-xxxxxx)
  return !/^\d+$/.test(id) && !/^id-[a-zA-Z0-9]{6,}$/.test(id);
}
```

---

## 4. Background Service Processing

### 4.1 Event Collection Pipeline

```typescript
// In BackgroundService.handleMessage()
case MessageType.TRACK_INTERACTION:
  this.recordingEvents.push(message.data);
  chrome.storage.session.set({ currentRecording: recording });
```

**Event Buffering Strategy:**
1. **Immediate Memory**: Events stored in `recordingEvents` array
2. **Session Persistence**: Backup to `chrome.storage.session`
3. **Deduplication**: Merge events from multiple sources by timestamp+type

### 4.2 Recording Start Flow

```typescript
private async startRecordingFlow(
  projectId: number | undefined,
  targetTabId: number,
  recordingId?: string
) {
  // 1. Generate recording ID
  const currentRecordingId = recordingId || `rec-${Date.now()}`;
  
  // 2. Initialize state
  this.recordingEvents = [];
  await chrome.storage.session.remove('currentRecording');
  await chrome.storage.local.set({
    isRecording: true,
    currentRecordingProjectId: projectId,
    currentRecordingId,
  });
  
  // 3. Update UI badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  
  // 4. Initialize video capture offscreen
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
  });
}
```

### 4.3 Recording Stop & Event Aggregation

```typescript
private async stopRecording() {
  // 1. Collect from multiple sources
  const allEvents: RawEvent[] = [...this.recordingEvents];
  
  // 2. Session storage fallback
  const sessionData = await chrome.storage.session.get(['currentRecording']);
  // Merge and deduplicate...
  
  // 3. Tab content script fallback
  const response = await chrome.tabs.sendMessage(tab.id!, {...});
  // Merge events...
  
  // 4. Sort by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);
  
  // 5. Send to AI processor
  const blueprint = await this.aiProcessor.generateBlueprint(allEvents);
}
```

---

## 5. AI Blueprint Generation

### 5.1 AIProcessor (`src/services/ai-processor.ts`)

Uses Google Gemini to transform raw events into structured test steps.

```typescript
public async generateBlueprint(
  events: RawEvent[],
  startUrl?: string
): Promise<TestBlueprint> {
  const model = this.genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const prompt = this.constructPrompt(events, startUrl);
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}
```

### 5.2 Prompt Engineering Strategy

The system uses sophisticated prompting to ensure high-quality selectors:

```
You are a test automation expert specialized in Playwright.
Convert browser recording events into a ROCK-SOLID test blueprint.

SELECTOR PRIORITY (Highest to Lowest):
1. Unique IDs: #submit-button
2. Data Test Attributes: [data-testid="login-btn"]
3. Semantic Roles + Text: li[role='menuitem']:has-text('Settings')
4. Unique XPath: //*[@data-testid='username']

CRITICAL RULES:
- Use SINGLE QUOTES only in selectors
- NEVER use naked generic tags
- Use Playwright :has-text() pseudo-class
- Add elementHints for disambiguation
```

### 5.3 Generated Blueprint Structure

```typescript
interface TestBlueprint {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  project_id?: number;
  issue_id?: string;
  auth?: { type: 'sessionState'; requiresAuth: boolean };
  setup?: TestStep[];      // Pre-test actions
  steps: TestStep[];       // Main test actions
  teardown?: TestStep[];   // Cleanup actions
  parameters: string[];     // Data-driven params
  status: 'processing' | 'ready' | 'failed';
  video_url?: string;
}

interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  selectorCandidates?: string[];
  xpath?: string;
  xpathCandidates?: string[];
  elementHints?: {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    parentInfo?: { tagName: string; id?: string };
    structuralInfo?: { depth: number; siblingIndex: number; totalSiblings: number };
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

## 6. Event Data Types

### 6.1 RawEvent Interface

```typescript
export interface RawEvent extends InteractionEvent {
  isTrusted?: boolean;
}

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
  value?: string;
  url: string;
  viewport: { width: number; height: number };
}
```

---

## 7. Video Capture Integration

### 7.1 Offscreen Document Strategy

The extension uses Chrome's offscreen document for video capture:

```typescript
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
  justification: 'Capture screen video natively via getDisplayMedia'
});
```

### 7.2 Capture Flow

1. **Start Recording**: Initialize offscreen with DISPLAY_MEDIA reason
2. **During Recording**: Native `getDisplayMedia()` captures video
3. **Stop Recording**: Upload to R2 storage, return URL
4. **Attach to Blueprint**: Video URL stored in blueprint

---

## 8. Message Communication Protocol

### 8.1 Message Types

```typescript
export enum MessageType {
  // Recording
  START_RECORDING = 'START_RECORDING',
  ACTUAL_START_RECORDING = 'ACTUAL_START_RECORDING',
  STOP_RECORDING = 'STOP_RECORDING',
  TRACK_INTERACTION = 'TRACK_INTERACTION',
  
  // Blueprint
  GENERATE_BLUEPRINT = 'GENERATE_BLUEPRINT',
  SAVE_BLUEPRINT = 'SAVE_BLUEPRINT',
  DELETE_BLUEPRINT = 'DELETE_BLUEPRINT',
  
  // Video
  START_VIDEO_CAPTURE = 'START_VIDEO_CAPTURE',
  STOP_VIDEO_CAPTURE = 'STOP_VIDEO_CAPTURE',
  VIDEO_CAPTURE_COMPLETE = 'VIDEO_CAPTURE_COMPLETE',
  
  // Playback
  START_PLAYBACK = 'START_PLAYBACK',
  STOP_PLAYBACK = 'STOP_PLAYBACK',
  PLAYBACK_STATUS_UPDATE = 'PLAYBACK_STATUS_UPDATE',
  
  // CDP
  CDP_CLICK = 'CDP_CLICK',
  CDP_TYPE = 'CDP_TYPE',
  CDP_SCROLL = 'CDP_SCROLL',
  CDP_ATTACH = 'CDP_ATTACH',
  CDP_DETACH = 'CDP_DETACH',
}
```

---

## 9. State Persistence

### 9.1 Storage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `isRecording` | `boolean` | Recording state flag |
| `currentRecordingId` | `string` | Active recording identifier |
| `currentRecordingProjectId` | `number` | Associated project |
| `currentRecordingStartUrl` | `string` | Initial URL |
| `currentRecording` | `object` | Session backup of events |
| `lastBlueprint` | `TestBlueprint` | Most recent generated blueprint |

---

## 10. Error Handling & Recovery

### 10.1 Multi-Source Event Collection

Events are collected from three sources to ensure no data loss:

1. **In-Memory Array**: Primary collection during recording
2. **Session Storage**: Backup for page reload scenarios
3. **Content Script Fallback**: Final sync on recording stop

### 10.2 Deduplication Strategy

```typescript
const existing = new Set(allEvents.map(e => `${e.timestamp}-${e.type}`));
response.events.forEach((e: RawEvent) => {
  if (!existing.has(`${e.timestamp}-${e.type}`)) {
    allEvents.push(e);
  }
});
```

---

## 11. Extension Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTENSION CONTEXT HIERARCHY                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Background Service                           │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │    │
│  │  │ CDP Handler     │  │ AI Processor    │  │ Storage Manager     │  │    │
│  │  │ - attach/detach │  │ - Gemini API     │  │ - local/session     │  │    │
│  │  │ - click/type    │  │ - Blueprint gen │  │ - R2 uploads        │  │    │
│  │  │ - scroll        │  │                  │  │                      │  │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                    chrome.runtime.sendMessage()                             │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Tab Content Script                         │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │    │
│  │  │                      EventLogger                                │ │    │
│  │  │  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐ │ │    │
│  │  │  │ Event Listeners│  │ Target Resolution│  │ Element Info Gen │ │ │    │
│  │  │  │ - click       │  │ - Semantic walk │  │ - Selectors       │ │ │    │
│  │  │  │ - input       │  │ - Shadow DOM    │  │ - XPath           │ │ │    │
│  │  │  │ - change      │  │ - Filtering     │  │ - Hints           │ │ │    │
│  │  │  └───────────────┘  └───────────────┘  └────────────────────┘ │ │    │
│  │  └─────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                      chrome.runtime.sendMessage()                           │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Offscreen Document                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │    │
│  │  │                    Video Recorder                                │ │    │
│  │  │  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐ │ │    │
│  │  │  │ MediaRecorder  │  │ getDisplayMedia│  │ R2 Upload         │ │ │    │
│  │  │  │               │  │               │  │                   │ │ │    │
│  │  │  └───────────────┘  └───────────────┘  └────────────────────┘ │ │    │
│  │  └─────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Flow Summary

```
User Click/Input on Page
         │
         ▼
┌─────────────────────┐
│  EventListener      │
│  (capturePhase=true)│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Target Resolution  │
│  (semantic walk up) │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Element Info Gen   │────▶│  Multiple Selectors │
│  (getElementInfo)   │     │  - CSS              │
└─────────┬───────────┘     │  - XPath            │
          │                  │  - Candidates        │
          │                  └─────────────────────┘
          ▼
┌─────────────────────┐
│  RawEvent Creation  │
│  - type             │
│  - timestamp        │
│  - element info     │
│  - url/viewport     │
│  - value (if input) │
└─────────┬───────────┘
          │
          ├──────────────────────────────┐
          │                              │
          ▼                              ▼
┌─────────────────────┐     ┌─────────────────────┐
│  onEventCaptured    │     │  TRACK_INTERACTION  │
│  (Iframe callback)  │     │  (Background msg)   │
└─────────┬───────────┘     └─────────┬───────────┘
          │                              │
          ▼                              ▼
┌─────────────────────┐     ┌─────────────────────┐
│  UI Update          │     │  Event Buffer       │
│  (Event Log Panel)  │     │  (recordingEvents)  │
└─────────────────────┘     └─────────┬───────────┘
                                      │
                                      │ (on stop)
                                      ▼
                            ┌─────────────────────┐
                            │  AI Blueprint Gen   │
                            │  (Gemini 3.1)       │
                            └─────────┬───────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  Save Recording     │
                            │  (API + Storage)    │
                            └─────────────────────┘
```

---

## 13. Key Design Decisions

### 13.1 Why Use `capturePhase=true`?

Event listeners use the capture phase to intercept events before they bubble:

```typescript
window.addEventListener('click', this.handleEvent, true);
//                                     ▲▲▲
//                              capture phase
```

**Benefits:**
- Can intercept events on child iframes
- Prevents target's own handlers from potentially modifying event
- Earlier access to event data

### 13.2 Multiple Selector Strategy

Generating multiple selector candidates provides:

1. **Reliability**: If one selector fails, fallbacks exist
2. **Flexibility**: Different pages may require different selectors
3. **Intelligence**: AI can pick best selector based on page context

### 13.3 Semantic Target Resolution

Walking up the DOM to find semantic elements ensures:

1. **Click on icon inside button** → Captures the button
2. **Click on span inside link** → Captures the anchor
3. **Better selectors** → Semantic elements are more stable

---

## 14. Limitations & Future Improvements

### Current Limitations

1. **No Hover/Focus Recording**: Only click, input, change events captured
2. **Single-Tab Recording**: Cannot record across multiple tabs
3. **No Keyboard Recording**: Tab navigation not captured
4. **Static Element Info**: Position/size captured once at event time

### Potential Improvements

1. **Multi-Tab Support**: Track events across tab switches
2. **AI-Enhanced Selectors**: Use Vision AI to analyze page screenshots
3. **Smart Assertions**: Auto-detect expected outcomes
4. **Recording Pause/Resume**: Support breaks during recording
