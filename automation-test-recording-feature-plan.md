# Test Recording Feature: "Teach & Run" Engine (QA Command Center Edition)

## 1. System Architecture Overview

This extension operates on a **"Brain & Hands"** model, fully integrated with the existing TypeScript/Rspack architecture.

*   **The Brain (Service Worker):** `src/background/index.ts` - Orchestrates state, manages recordings, and communicates with Gemini/LLM.
*   **The Hands (Content Scripts):** 
    *   `src/content/recorder/index.ts` - Injected to capture events.
    *   `src/content/player/index.ts` - Injected to execute blueprints.
*   **The Eyes (Offscreen Document):** `src/offscreen/index.ts` - Handles high-perf video processing for "Step Evidence".
*   **UI Layer:** All injected UI components use `src/utils/shadow-dom.ts` to ensure strict style isolation and design token inheritance (Shadcn/UI).

---

## 2. Data Structure: The "Blueprint"

We use a strict TypeScript interface for our JSON Schema to ensure type safety across the SW and Content Scripts.

```typescript
// src/types/test-blueprint.ts
export interface TestStep {
  id: string;
  action: 'click' | 'type' | 'navigate' | 'waitFor' | 'assert';
  selector: string;
  value?: string;
  variableName?: string; // Handlebars: {{variableName}}
  metadata?: Record<string, any>;
}

export interface TestBlueprint {
  meta: {
    testId: string;
    name: string;
    baseUrl: string;
    requiredParams: Array<{ key: string; description: string }>;
  };
  steps: TestStep[];
}
```

---

## 3. Phase 1: The Recorder ("Teach Mode")

**Goal:** Capture user intent with type safety and zero latency.

### A. Event Listener & Selector Logic
*   **Implementation:** `src/content/recorder/recorder.ts`.
*   **Selector Engine:** Extend `src/utils/dom.ts`'s `generateSelector` to prioritize `data-testid` and `aria-label`.
*   **Event Delegation:** Attach a single listener to `window` for `click`, `input`, and `change` to minimize overhead.

### B. Isolated UI (Shadow DOM)
*   **Control Panel:** A React-based floating toolbar injected via `ShadowDOMManager`.
*   **Styling:** Injected using `src/styles/shadow-dom.css` to access Tailwind tokens.
*   **Feedback:** Highlight elements being recorded using `highlightElement` from `src/utils/dom.ts`.

---

## 4. Phase 2: The Processor (The AI Layer)

**Goal:** Clean raw logs into deterministic Blueprints using Gemini.

### A. LLM Pipeline
1. Service Worker collects `RawEvent[]` from the recorder.
2. Sends to Gemini with a system prompt optimized for **QA Automation**.
3. **Prompt Mandate:** "Convert these raw events into the `TestBlueprint` JSON schema. Parameterize fields like emails or names."

### B. Review UI
*   A dedicated page in `src/pages/recording-review/` to let users approve the AI-generated variables before saving.

---

## 5. Phase 3: The Executor ("Run Mode")

**Goal:** Execute tests deterministically without style bleeding or variable collisions.

### A. The "Runtime Engine"
*   **Implementation:** `src/content/player/index.ts`.
*   **Logic:** Iterates through `TestStep[]`.
*   **Resiliency:** Uses `waitForElement` from `src/utils/dom.ts` with configurable timeouts for SPAs (React/Next.js).

### B. Navigation & State persistence
*   The Service Worker tracks `currentStepIndex` in `chrome.storage.local`.
*   Listens to `chrome.tabs.onUpdated`. On `complete`, re-injects the player script to resume from `currentStepIndex`.

---

## 6. Implementation Roadmap (Tech Stack Aligned)

### Milestone 1: The Recorder Core
- [ ] Add `recorder` and `player` entries to `rspack.config.js`.
- [ ] Implement `src/content/recorder/index.ts` using `ShadowDOMManager`.
- [ ] Refactor `src/utils/dom.ts` to support enhanced recording selectors.

### Milestone 2: The Player Core
- [ ] Implement `src/content/player/executor.ts` with `simulateClick` and `waitForElement`.
- [ ] Update Service Worker to handle "Step Injection" on page reload.

### Milestone 3: AI Integration & Storage
- [ ] Build the LLM processing service in `src/services/ai-processor.ts`.
- [ ] Create the "Blueprint Management" UI in the Options page.

---

## 7. Project File Structure (Updated)

```text
src/
├── content/
│   ├── recorder/
│   │   ├── index.ts        <-- Entry point for injection
│   │   ├── RecorderUI.tsx  <-- Shadow DOM React Component
│   │   └── event-logger.ts
│   └── player/
│       ├── index.ts        <-- Entry point for playback
│       └── executor.ts     <-- Logic for executing steps
├── services/
│   └── blueprint-service.ts
├── types/
│   └── test-blueprint.ts
└── utils/
    ├── dom.ts              <-- Shared selector logic (Extended)
    └── shadow-dom.ts       <-- UI Isolation (Existing)
```

---

## Efficiency Check (Project Standards)
*   **Type Safety:** 100% TypeScript. No `any`.
*   **Build:** Rspack-optimized entries for content scripts.
*   **Isolation:** Strict Shadow DOM usage for injected elements.
*   **Performance:** Event delegation and native DOM APIs.
