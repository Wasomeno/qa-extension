# Test Playback Logic Deep Analysis

## Overview

The test playback system executes pre-recorded test blueprints on web pages, simulating user interactions to validate application behavior. This document provides a comprehensive analysis of the playback architecture, execution engine, and recovery mechanisms.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PLAYBACK SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │    Popup     │────▶│   Background │────▶│   Playback Tab          │  │
│  │   (Start)    │     │   Service    │     │   (New Chrome Tab)      │  │
│  └──────────────┘     └──────────────┘     └───────────┬─────────────┘  │
│         │                    │                           │              │
│         │                    │                           ▼              │
│         │                    │               ┌─────────────────────────┐  │
│         │                    │               │   PlayerEngine         │  │
│         │                    │               │   (src/content/player/  │  │
│         │                    │               │    index.ts)            │  │
│         │                    │               └───────────┬─────────────┘  │
│         │                    │                           │                │
│         │                    │                           ▼                │
│         │                    │               ┌─────────────────────────┐  │
│         │                    │               │   Executor             │  │
│         │                    │               │   (src/content/player/  │  │
│         │                    │               │    executor.ts)         │  │
│         │                    │               └───────────┬─────────────┘  │
│         │                    │                           │                │
│         │                    │                           ▼                │
│         │                    │               ┌─────────────────────────┐  │
│         │   Status Updates   │               │   CDP Handler           │  │
│         │◀───────────────────┤               │   (Background Service)  │  │
│         │                    │               └─────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 PlayerEngine (`src/content/player/index.ts`)

The `PlayerEngine` manages the overall playback state and orchestrates step execution.

#### Class: `PlayerEngine`

**State Interface:**

```typescript
interface PlaybackState {
  isActive: boolean;           // Is playback running
  blueprint: TestBlueprint | null;  // Test to execute
  currentStepIndex: number;    // Current step position
  status: 'idle' | 'playing' | 'paused' | 'completed' | 'failed';
  error?: string;              // Error message if failed
  variables?: Record<string, string>;  // Parameter values
  playbackTabId?: number;      // Tab being played back in
}
```

#### State Machine

```
                    ┌─────────┐
                    │  idle   │
                    └────┬────┘
                         │ START_PLAYBACK
                         ▼
                   ┌─────────────┐
            ┌─────▶│   playing   │◀────┐
            │      └──────┬──────┘     │
            │             │            │
            │      Step Complete       │ Retry (max 2)
            │             │            │
            │             ▼            │
            │    ┌────────────┐        │
            │    │  playing   │────────┘
            │    │  (next)    │
            │    └────────────┘
            │
            │ All Steps Done
            ▼
      ┌─────────────┐         ┌─────────────┐
      │  completed  │         │   failed    │
      └─────────────┘         └─────────────┘
            ▲                        ▲
            │                        │
            └────────────────────────┘
                    STOP_PLAYBACK
```

#### Key Methods

##### `startPlayback(blueprint, stepIndex, variables, playbackTabId)`

```typescript
private async startPlayback(
  blueprint: TestBlueprint,
  stepIndex: number = 0,
  variables: Record<string, string> = {},
  playbackTabId?: number
) {
  // Prevent duplicate starts
  if (this.state.isActive && 
      this.state.status === 'playing' && 
      this.state.blueprint?.id === blueprint.id &&
      this.state.currentStepIndex === stepIndex) {
    return;
  }

  this.state = {
    isActive: true,
    blueprint,
    currentStepIndex: stepIndex,
    status: 'playing',
    variables,
    playbackTabId
  };
  
  await this.saveState();
  this.runNextStep();
}
```

**Features:**
- Prevents duplicate playback starts
- Resolves parameters in step values
- Saves state for recovery
- Initiates first step execution

##### `runNextStep(retryCount = 0)`

Core execution loop:

```typescript
private async runNextStep(retryCount = 0) {
  if (!this.state.isActive || !this.state.blueprint) return;

  // Check if all steps completed
  if (this.state.currentStepIndex >= this.state.blueprint.steps.length) {
    this.stopPlayback('completed');
    return;
  }

  // Get current step and resolve parameters
  const originalStep = this.state.blueprint.steps[this.state.currentStepIndex];
  const step = {
    ...originalStep,
    value: this.resolveParameters(originalStep.value),
    expectedValue: this.resolveParameters(originalStep.expectedValue)
  };

  // Special handling for navigation
  if (step.action === 'navigate') {
    this.state.currentStepIndex++;
    await this.saveState();
    await Executor.executeStep(step);
    return;
  }

  // Wait for page to settle before action
  await Executor.waitForPageSettled();

  // Execute the step
  const actualValue = await Executor.executeStep(step);

  // Update state and move to next step
  this.state.currentStepIndex++;
  await this.saveState();

  // Brief delay between steps for animations/UI
  setTimeout(() => this.runNextStep(), 1000);
}
```

**Flow:**
1. Validate playback is active
2. Check for completion
3. Get and resolve step parameters
4. Notify background of step start
5. Handle navigation specially (save state before)
6. Wait for page to settle
7. Execute step
8. Notify of step completion
9. Wait briefly then continue

##### `resolveParameters(text)`

Substitutes parameter placeholders with actual values:

```typescript
private resolveParameters(text: string | undefined): string | undefined {
  if (!text || !this.state.variables) return text;
  
  let resolved = text;
  for (const [key, value] of Object.entries(this.state.variables)) {
    resolved = resolved.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
  }
  return resolved;
}
```

**Pattern:** `${variableName}` → `actualValue`

---

### 2.2 Executor (`src/content/player/executor.ts`)

The `Executor` handles the actual DOM interactions using Chrome DevTools Protocol (CDP).

#### Class: `Executor`

**Static Constants:**

```typescript
private static readonly DEFAULT_TIMEOUT = 30000;    // 30 seconds
private static readonly RETRY_DELAY_MS = 300;       // 300ms between retries
```

#### Action Handlers

##### `executeStep(step: TestStep)`

Routes to appropriate handler based on action type:

```typescript
public static async executeStep(step: TestStep): Promise<string | undefined> {
  switch (step.action) {
    case 'navigate':
      return await this.handleNavigate(step);
    case 'click':
      return await this.handleClick(step);
    case 'type':
      return await this.handleType(step);
    case 'select':
      return await this.handleSelect(step);
    case 'assert':
      return await this.handleAssert(step);
    default:
      throw new Error(`Unsupported action: ${step.action}`);
  }
}
```

##### `handleClick(step)`

1. Resolve element using `resolveElement()`
2. Ensure element is in viewport
3. Highlight element (blue)
4. Wait 350ms for visual confirmation
5. Calculate center coordinates
6. Send CDP click command

```typescript
private static async handleClick(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
  
  await this.ensureElementInViewport(element);
  highlightElement(element, { color: '#4dabf7' });  // Blue highlight

  await new Promise(resolve => setTimeout(resolve, 350));

  const rect = element.getBoundingClientRect();
  const tabId = await this.getTabId();

  await this.sendCDPMessage(MessageType.CDP_CLICK, {
    tabId,
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  });

  return getElementValue(element);
}
```

##### `handleType(step)`

1. Resolve element
2. Click to focus
3. Send keystrokes via CDP

```typescript
private static async handleType(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);

  // Focus element
  await this.sendCDPMessage(MessageType.CDP_CLICK, {...});

  // Send keystrokes
  await this.sendCDPMessage(MessageType.CDP_TYPE, {
    tabId,
    text: step.value,
  });

  return getElementValue(element);
}
```

##### `handleNavigate(step)`

```typescript
private static async handleNavigate(step: TestStep): Promise<string | undefined> {
  if (!step.value) {
    throw new Error(`Missing URL for 'navigate' action`);
  }

  let targetUrl = step.value;
  
  // Resolve relative URLs
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    try {
      targetUrl = new URL(targetUrl, window.location.origin).href;
    } catch {}
  }

  window.location.href = targetUrl;
  return targetUrl;
}
```

**Note:** Navigation increments step index BEFORE execution to save progress.

##### `handleSelect(step)`

Handles both standard `<select>` and custom comboboxes (like Ant Design):

```typescript
private static async handleSelect(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);

  // Standard HTML select
  if (element instanceof HTMLSelectElement) {
    element.value = step.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return getElementValue(element);
  }

  // Custom combobox (role="combobox")
  if (element.getAttribute('role') === 'combobox') {
    // Click to open dropdown
    await this.sendCDPMessage(MessageType.CDP_CLICK, {...});
    
    // Wait for dropdown animation
    await this.waitForDomQuiet(1000, 200);

    // Find option by text
    const optionXPath = `//div[contains(@class, "ant-select-item-option-content") and text()="${step.value}"]`;
    const optionElement = await this.resolveElement({...}, 5000, true);
    
    // Click option
    await this.sendCDPMessage(MessageType.CDP_CLICK, {...});
    return step.value;
  }

  throw new Error(`Select failed: Element is not a recognized type`);
}
```

##### `handleAssert(step)`

```typescript
private static async handleAssert(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, false);

  // Element should NOT exist
  if (step.assertionType === 'not_exists') {
    if (element) {
      throw new Error(`Assertion failed: Element should NOT exist`);
    }
    return 'Not Exists';
  }

  // Element should exist
  if (!element) {
    throw new Error(`Assertion failed: Element not found`);
  }

  await this.ensureElementInViewport(element);
  highlightElement(element, { color: '#51cf66', duration: 1000 });  // Green

  const actualValue = getElementValue(element);

  // Value equality check
  if (step.assertionType === 'equals' && step.expectedValue !== undefined) {
    if (actualValue !== step.expectedValue) {
      throw new Error(`Expected "${step.expectedValue}", got "${actualValue}"`);
    }
  }

  // Contains check
  if (step.assertionType === 'contains' && step.expectedValue !== undefined) {
    if (!actualValue.includes(step.expectedValue)) {
      throw new Error(`Expected to contain "${step.expectedValue}"`);
    }
  }

  return actualValue;
}
```

#### Element Resolution

##### `resolveElement(step, timeout, requireActionable)`

Playwright-style element resolution with multiple fallback strategies:

```typescript
private static async resolveElement(
  step: TestStep,
  timeout: number,
  requireActionable: boolean
): Promise<Element | null> {
  const selectors = this.getSelectors(step);
  const xpathSelectors = this.getXPathSelectors(step);

  const start = Date.now();
  let lastBest: Element | null = null;

  while (Date.now() - start < timeout) {
    const matches = this.findAllMatches(selectors, xpathSelectors, step);

    if (matches.length > 0) {
      const bestMatch = matches[0].element;
      lastBest = bestMatch;

      // Check if actionable (visible, stable, not occluded)
      if (!requireActionable || await isElementActionable(bestMatch)) {
        return bestMatch;
      }
    }

    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));

    // Periodically wait for DOM to stabilize
    if (attempts % 5 === 0) {
      await this.waitForDomQuiet(500, 150);
    }
  }

  return requireActionable ? null : lastBest;
}
```

##### `findAllMatches(selectors, xpathSelectors, step)`

Finds all matching elements and scores them:

```typescript
private static findAllMatches(
  selectors: string[],
  xpathSelectors: string[],
  step: TestStep
): { element: Element; score: number }[] {
  const results: { element: Element; score: number }[] = [];
  const seen = new Set<Element>();

  // CSS selectors (including Shadow DOM piercing)
  selectors.forEach((selector, priority) => {
    try {
      const matches = queryAllShadows(selector);
      matches.forEach((el, index) => {
        if (el.isConnected && !seen.has(el)) {
          seen.add(el);
          results.push({
            element: el,
            score: this.scoreElementMatch(el, step, priority, index),
          });
        }
      });
    } catch (e) {}
  });

  // XPath selectors
  xpathSelectors.forEach((xpath, priority) => {
    try {
      const matches = findAllByXPath(xpath);
      matches.forEach((el, index) => {
        if (el.isConnected && !seen.has(el)) {
          seen.add(el);
          results.push({
            element: el,
            score: this.scoreXPathMatch(el, step, priority, index),
          });
        }
      });
    } catch (e) {}
  });

  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}
```

#### Element Scoring

##### `scoreElementMatch(element, step, priority, index)`

Assigns a score based on selector priority and element hints:

```typescript
private static scoreElementMatch(
  element: Element,
  step: TestStep,
  selectorPriority: number,
  matchIndex: number
): number {
  let score = 30 - selectorPriority * 5 - matchIndex;

  // Tag name match
  if (hints?.tagName) {
    score += element.tagName.toLowerCase() === hints.tagName.toLowerCase() 
      ? 10 : -5;
  }

  // Text content match
  if (hints?.textContent) {
    if (normalizedText === normalizedHint) {
      score += 20;
    } else if (normalizedText.includes(normalizedHint.slice(0, 40))) {
      score += 8;
    }
  }

  // High-priority attributes
  const highPriorityAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy', 'aria-label', 'role'];
  highPriorityAttrs.forEach(attr => {
    if (element.getAttribute(attr) === hints.attributes?.[attr]) {
      score += 15;
    }
  });

  // Parent info match
  if (hints?.parentInfo) {
    if (parent.id === hints.parentInfo.id) score += 8;
    if (parent.tagName === hints.parentInfo.tagName) score += 4;
  }

  // Structural info (sibling position)
  if (hints?.structuralInfo) {
    if (siblingIndex === hints.structuralInfo.siblingIndex) score += 3;
  }

  return score;
}
```

---

## 3. DOM Utilities (`src/utils/dom.ts`)

### 3.1 Shadow DOM Support

```typescript
export function queryAllShadows(
  selector: string,
  root: Document | Element | ShadowRoot = document
): Element[] {
  let results: Element[] = [];

  // Query current root
  try {
    results = Array.from(root.querySelectorAll(selector));
  } catch (e) {}

  // Find all shadow hosts and recurse
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return (node as Element).shadowRoot
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  while (currentNode) {
    if (currentNode.shadowRoot) {
      results = results.concat(
        queryAllShadows(selector, currentNode.shadowRoot)
      );
    }
    currentNode = walker.nextNode() as Element | null;
  }

  return results;
}
```

### 3.2 Actionability Checks

```typescript
export async function isElementActionable(element: Element): Promise<boolean> {
  // 1. Connected to DOM
  if (!element.isConnected) return false;

  // 2. Visible
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  const isVisible = 
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0.1;

  if (!isVisible) return false;

  // 3. Not disabled
  if (element instanceof HTMLElement) {
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-disabled') === 'true') return false;
  }

  // 4. Stable (not animating)
  const getRect = () => element.getBoundingClientRect();
  const rect1 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect2 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect3 = getRect();

  if (/* movement detected */) return false;

  // 5. Not occluded (covered by another element)
  const centerX = rect1.left + rect1.width / 2;
  const centerY = rect1.top + rect1.height / 2;

  let elAtPoint = document.elementFromPoint(centerX, centerY);

  // Pierce Shadow DOM
  while (elAtPoint && elAtPoint.shadowRoot) {
    const shadowEl = elAtPoint.shadowRoot.elementFromPoint(centerX, centerY);
    if (!shadowEl || shadowEl === elAtPoint) break;
    elAtPoint = shadowEl;
  }

  // Allow if element itself or its descendant
  if (element.contains(elAtPoint) || elAtPoint.contains(element)) {
    return true;
  }

  return false;
}
```

### 3.3 Element Highlighting

```typescript
export function highlightElement(
  element: Element,
  options: { color?: string; duration?: number; className?: string } = {}
): void {
  removeHighlight();

  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');

  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid ${color};
    background: ${color}20;
    pointer-events: none;
    z-index: 999999;
    border-radius: 4px;
    box-shadow: 0 0 10px ${color}40;
    animation: qa-pulse 1s ease-in-out infinite alternate;
  `;

  document.body.appendChild(overlay);

  if (duration > 0) {
    setTimeout(() => removeHighlight(), duration);
  }
}
```

---

## 4. CDP Handler (`src/background/index.ts`)

### 4.1 CDPHandler Class

```typescript
export class CDPHandler {
  private static attachedTabs: Set<number> = new Set();

  public static async click(tabId: number, x: number, y: number): Promise<void> {
    // Playwright-style mouse events
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y, button: 'left', clickCount: 1,
    });
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y, button: 'left', clickCount: 1,
    });
  }

  public static async type(tabId: number, text: string): Promise<void> {
    for (const char of text) {
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
        unmodifiedText: char,
      });
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
        unmodifiedText: char,
      });
    }
  }

  public static async scroll(tabId: number, x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x, y, deltaX, deltaY,
    });
  }
}
```

---

## 5. Page Settlement

### 5.1 waitForPageSettled

```typescript
public static async waitForPageSettled(
  timeout: number = 15000,
  quietWindowMs: number = 500
): Promise<void> {
  // 1. Wait for DOMContentLoaded if still loading
  if (document.readyState === 'loading') {
    await new Promise<void>(resolve => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  // 2. Wait for document.complete
  while (document.readyState !== 'complete' && ...) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 3. Wait for DOM to be quiet (no mutations)
  await this.waitForDomQuiet(timeout, quietWindowMs);
}
```

### 5.2 waitForDomQuiet

```typescript
private static waitForDomQuiet(timeout: number, quietWindowMs: number): Promise<void> {
  return new Promise(resolve => {
    let settled = false;

    const observer = new MutationObserver(resetQuietTimer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    const resetQuietTimer = () => {
      // Reset timer on any mutation
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietWindowMs);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      resolve();
    };

    const quietTimer = window.setTimeout(finish, quietWindowMs);
    window.setTimeout(finish, timeout);  // Force timeout
  });
}
```

---

## 6. Playback Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      START PLAYBACK                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Background Service                                                 │
│  1. Create new Chrome tab with target URL                         │
│  2. Wait for tab to load                                         │
│  3. Store playback state with playbackTabId                      │
│  4. Send START_PLAYBACK message                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  PlayerEngine (in content script)                                 │
│  startPlayback(blueprint, ...)                                   │
│  - Set state: isActive=true, status='playing'                    │
│  - Save state to chrome.storage.local                            │
│  - Call runNextStep()                                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  runNextStep() Loop                                               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Step Execution:                                            │  │
│  │                                                           │  │
│  │ 1. Get current step + resolve parameters                  │  │
│  │ 2. Send PLAYBACK_STATUS_UPDATE (step started)             │  │
│  │ 3. If navigate:                                          │  │
│  │    - Increment step index                                │  │
│  │    - Save state                                          │  │
│  │    - Execute navigate                                     │  │
│  │    - Return (page load will trigger next step)           │  │
│  │ 4. Else:                                                 │  │
│  │    - Wait for page to settle                             │  │
│  │    - Executor.executeStep()                              │  │
│  │    - Increment step index                                │  │
│  │    - Save state                                          │  │
│  │    - Send PLAYBACK_STATUS_UPDATE (step completed)        │  │
│  │    - Wait 1 second                                       │  │
│  │    - Recursively call runNextStep()                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Retry Logic:                                                     │
│  - Max 2 retries per step                                         │
│  - 2 second delay between retries                                │
│                                                                  │
│  Completion:                                                      │
│  - If all steps done → stopPlayback('completed')                 │
│  - If error after retries → stopPlayback('failed', error)         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Executor.executeStep()                                          │
│                                                                  │
│  Element Resolution:                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Collect selectors (CSS + XPath)                         │  │
│  │ 2. Poll for up to 30 seconds:                             │  │
│  │    - Query DOM for matches                                │  │
│  │    - Score each match                                    │  │
│  │    - Check if actionable                                 │  │
│  │    - Wait 300ms between attempts                         │  │
│  │    - Wait for DOM quiet every 5 attempts                 │  │
│  │ 3. Return best match or null                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Action Execution:                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ click:  - Ensure in viewport (scroll if needed)         │  │
│  │         - Highlight (blue)                               │  │
│  │         - Wait 350ms                                     │  │
│  │         - CDP click (center of element)                 │  │
│  │                                                           │  │
│  │ type:   - Focus via CDP click                            │  │
│  │         - CDP type keystrokes                            │  │
│  │                                                           │  │
│  │ select: - Handle HTML select                             │  │
│  │         - Handle Ant Design combobox                     │  │
│  │         - Dispatch change event                          │  │
│  │                                                           │  │
│  │ assert: - Check element existence                        │  │
│  │         - Validate value equality/contains               │  │
│  │         - Highlight (green on success)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Recovery Mechanism

### 7.1 Auto-Resume

```typescript
private async checkAutoResume() {
  const result = await chrome.storage.local.get(['activePlayback']);
  if (result.activePlayback && result.activePlayback.isActive) {
    // Validate correct tab
    const playbackTabId = result.activePlayback.playbackTabId;
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_TAB_ID
    });
    const currentTabId = response?.data?.tabId;

    if (currentTabId !== playbackTabId) {
      return;  // Not the right tab, skip
    }

    this.state = result.activePlayback;

    // If page was reloaded, continue from current step
    if (this.state.status === 'playing') {
      this.runNextStep();
    }
  }
}
```

### 7.2 State Persistence

```typescript
private async saveState() {
  await chrome.storage.local.set({ activePlayback: this.state });
}
```

**Persisted State:**
```typescript
{
  isActive: true,
  blueprint: { ... },
  currentStepIndex: 5,
  status: 'playing',
  variables: { ... },
  playbackTabId: 123
}
```

---

## 8. CDP Commands Reference

| CDP Command | Purpose | Parameters |
|-------------|---------|------------|
| `Input.dispatchMouseEvent` (mousePressed) | Start mouse press | x, y, button, clickCount |
| `Input.dispatchMouseEvent` (mouseReleased) | End mouse press | x, y, button, clickCount |
| `Input.dispatchMouseEvent` (mouseWheel) | Scroll | x, y, deltaX, deltaY |
| `Input.dispatchKeyEvent` (keyDown) | Key press | text, unmodifiedText |
| `Input.dispatchKeyEvent` (keyUp) | Key release | text, unmodifiedText |

---

## 9. Selector Priority & Matching

### 9.1 CSS Selector Priority

1. **Data-testid attributes**
   ```css
   [data-testid='submit-button']
   [data-cy='login-btn']
   ```

2. **Role + Accessible Name**
   ```css
   button[role='button'][aria-label='Submit']
   ```

3. **Role + Text (Playwright-style)**
   ```css
   li[role='menuitem']:has-text('Settings')
   ```

4. **Label + Input**
   ```css
   label:has-text('Email') + input
   ```

5. **Name/Placeholder**
   ```css
   input[name='username']
   input[placeholder='Enter email']
   ```

6. **Stable ID**
   ```css
   #submit-button
   ```

7. **Stable Classes** (filtered)
   ```css
   button.primary-btn.submit
   ```

8. **Limited Path** (last resort)
   ```css
   div.container > form > button.submit
   ```

### 9.2 XPath Candidates

```xpath
//button[.='Submit']                                    // Text
//*[@data-testid='submit-btn']                          // Attribute
//li[@role='menuitem'][@aria-label='Settings']         // Combined
//button[@role='button' and normalize-space(.)='Log In'] // Normalized
```

---

## 10. Error Handling

### 10.1 Retry Logic

```typescript
private async runNextStep(retryCount = 0) {
  try {
    const actualValue = await Executor.executeStep(step);
    // Success
    this.state.currentStepIndex++;
    await this.saveState();
    setTimeout(() => this.runNextStep(), 1000);
  } catch (error) {
    if (retryCount < 2) {
      // Retry after 2 seconds
      setTimeout(() => this.runNextStep(retryCount + 1), 2000);
    } else {
      // Fail after max retries
      this.stopPlayback('failed', error.message);
    }
  }
}
```

### 10.2 Error Scenarios

| Error | Handling |
|-------|----------|
| Element not found | Retry up to 2 times, then fail |
| Element not actionable | Retry after DOM settles |
| Navigation timeout | Retry navigation |
| Assertion failure | Stop and report failure |
| Page crash | Browser handles, state persists |

---

## 11. Highlight Colors

| Action | Color | Purpose |
|--------|-------|---------|
| `click` | `#4dabf7` (Blue) | Shows what will be clicked |
| `type` | `#4dabf7` (Blue) | Shows input target |
| `select` | `#4dabf7` (Blue) | Shows dropdown target |
| `assert` (success) | `#51cf66` (Green) | Confirms assertion |
| Recording | `#ff6b6b` (Red) | Recording indicator |

---

## 12. Timing Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Default Timeout | 30,000ms | Element resolution timeout |
| Retry Delay | 300ms | Between polling attempts |
| Action Delay | 350ms | Visual confirmation before click |
| Step Gap | 1,000ms | Between steps for animations |
| Retry Wait | 2,000ms | Before retry after failure |
| DOM Quiet Window | 500ms | No mutations before proceeding |
| Scroll Settle | 500ms | After scroll before action |

---

## 13. Limitations & Considerations

1. **Cross-Origin Frames:** Cannot interact with iframes from different origins
2. **Shadow DOM:** Limited to accessible shadow elements
3. **Animations:** Waits for completion but may be flaky with long animations
4. **Dynamic Content:** Relies on MutationObserver; may miss very fast changes
5. **CDP Dependency:** Requires Chrome DevTools Protocol availability
6. **Single Tab:** Only one playback can run at a time

---

## 14. Message Flow Summary

```
┌─────────────┐      START_PLAYBACK       ┌─────────────────┐
│   Popup/    │ ────────────────────────▶ │   Background    │
│   Menu      │                           │   Service       │
└─────────────┘                           └────────┬────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              │                    │                    │
                              ▼                    ▼                    ▼
                    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
                    │ Create Tab  │      │ Set State   │      │Send Message │
                    └─────────────┘      └─────────────┘      └──────┬──────┘
                                                                      │
                                                                      ▼
                                                           ┌─────────────────┐
                                                           │ PlayerEngine    │
                                                           │ (Content Script)│
                                                           └────────┬────────┘
                                                                    │
                                        ┌────────────────────────────┼────────────────────────────┐
                                        │                            │                            │
                                        ▼                            ▼                            ▼
                              ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
                              │ CDP: Click      │        │ CDP: Type       │        │ CDP: Scroll    │
                              │ (Background)    │        │ (Background)    │        │ (Background)   │
                              └─────────────────┘        └─────────────────┘        └─────────────────┘
                                        │                            │                            │
                                        ▼                            ▼                            ▼
                              ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
                              │ PLAYBACK_STATUS │        │ PLAYBACK_STATUS │        │ PLAYBACK_STATUS │
                              │ _UPDATE         │        │ _UPDATE         │        │ _UPDATE         │
                              └─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## 15. Files Reference

| File | Purpose |
|------|---------|
| `src/content/player/index.ts` | PlayerEngine - state management, step orchestration |
| `src/content/player/executor.ts` | Executor - DOM interaction, element resolution |
| `src/background/index.ts` | CDPHandler - Chrome DevTools Protocol commands |
| `src/utils/dom.ts` | DOM utilities - Shadow DOM, highlighting, actionability |

---

*Document generated: 2026-04-04*
