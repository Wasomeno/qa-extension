# Deep Analysis: Playback Logic

## Overview

The playback system executes pre-recorded test steps against web pages, using Chrome DevTools Protocol (CDP) for precise control and intelligent element resolution. This document provides a comprehensive analysis of the playback architecture, execution flow, and element resolution strategies.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PLAYBACK EXECUTION FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │   Background  │────▶│   New Tab    │────▶│   Content Script        │  │
│  │   Service     │     │   Created    │     │   (PlayerEngine)        │  │
│  │               │     │              │     │                         │  │
│  └──────────────┘     └──────────────┘     └────────────┬────────────┘  │
│         │                                               │                 │
│         │           ┌───────────────────────────────────┘                 │
│         │           │                                                     │
│         │           ▼                                                     │
│         │  ┌────────────────────────────────────────────────────────┐    │
│         │  │                     Executor Class                       │    │
│         │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │    │
│         │  │  │ Element       │  │ Action       │  │ CDP          │  │    │
│         │  │  │ Resolution    │  │ Handlers     │  │ Commands     │  │    │
│         │  │  │ (Polling)     │  │ (click/type) │  │ (sendCommand)│  │    │
│         │  │  └──────────────┘  └──────────────┘  └──────────────┘  │    │
│         │  └────────────────────────────────────────────────────────┘    │
│         │                                                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 PlayerEngine (`src/content/player/index.ts`)

The `PlayerEngine` manages playback state and orchestrates step execution.

#### Class Structure

```typescript
interface PlaybackState {
  isActive: boolean;
  blueprint: TestBlueprint | null;
  currentStepIndex: number;
  status: 'idle' | 'playing' | 'paused' | 'completed' | 'failed';
  error?: string;
  variables?: Record<string, string>;
  playbackTabId?: number;
}

class PlayerEngine {
  private state: PlaybackState = {
    isActive: false,
    blueprint: null,
    currentStepIndex: 0,
    status: 'idle'
  };

  constructor() {
    this.setupListeners();
    this.checkAutoResume();
  }
}
```

#### Message Listeners

```typescript
private setupListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case MessageType.START_PLAYBACK:
        this.startPlayback(
          message.data.blueprint,
          message.data.stepIndex || 0,
          message.data.variables,
          message.data.playbackTabId
        );
        break;
      case MessageType.STOP_PLAYBACK:
        this.stopPlayback();
        break;
    }
    return true;
  });
}
```

#### Playback Start Flow

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

#### Step Execution Loop

```typescript
private async runNextStep(retryCount = 0) {
  if (!this.state.isActive || !this.state.blueprint) return;

  // Check if all steps completed
  if (this.state.currentStepIndex >= this.state.blueprint.steps.length) {
    this.stopPlayback('completed');
    return;
  }

  const originalStep = this.state.blueprint.steps[this.state.currentStepIndex];
  
  // Resolve parameters (e.g., ${baseUrl} → actual URL)
  const step = {
    ...originalStep,
    value: this.resolveParameters(originalStep.value),
    expectedValue: this.resolveParameters(originalStep.expectedValue)
  };

  try {
    // Special handling for navigation
    if (step.action === 'navigate') {
      this.state.currentStepIndex++;
      await this.saveState();
      await Executor.executeStep(step);
      return;
    }

    // Wait for page to settle
    await Executor.waitForPageSettled();

    // Execute the step
    const actualValue = await Executor.executeStep(step);

    this.state.currentStepIndex++;
    await this.saveState();

    // Notify of step completion
    chrome.runtime.sendMessage({
      type: MessageType.PLAYBACK_STATUS_UPDATE,
      data: {
        ...this.state,
        stepStatus: 'completed',
        stepDescription: step.description,
        actualValue,
        expectedValue: step.expectedValue || step.value
      }
    });

    // Wait for UI updates
    await Executor.waitForPageSettled(5000, 300);

    // Brief delay between steps
    setTimeout(() => this.runNextStep(), 1000);

  } catch (error: any) {
    // Retry logic (up to 2 retries)
    if (retryCount < 2) {
      setTimeout(() => this.runNextStep(retryCount + 1), 2000);
    } else {
      this.stopPlayback('failed', error.message);
    }
  }
}
```

#### Parameter Resolution

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

---

## 3. Executor Class (`src/content/player/executor.ts`)

The `Executor` class handles all test step execution with CDP commands.

### 3.1 Constants

```typescript
export class Executor {
  private static readonly DEFAULT_TIMEOUT = 30000;  // 30 seconds
  private static readonly RETRY_DELAY_MS = 300;      // 300ms polling
}
```

### 3.2 Action Types Supported

```typescript
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
}
```

### 3.3 Click Handler

```typescript
private static async handleClick(step: TestStep): Promise<string | undefined> {
  // 1. Resolve element with timeout
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
  if (!element) {
    throw new Error(`Click failed: Element not found or not interactable`);
  }

  // 2. Ensure element is visible
  await this.ensureElementInViewport(element);
  highlightElement(element, { color: '#4dabf7' }); // Blue highlight

  // 3. Brief delay for visual confirmation
  await new Promise(resolve => setTimeout(resolve, 350));

  // 4. Get center coordinates
  const rect = element.getBoundingClientRect();
  const tabId = await this.getTabId();

  // 5. Send CDP click command
  await this.sendCDPMessage(MessageType.CDP_CLICK, {
    tabId,
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  });

  return getElementValue(element);
}
```

### 3.4 Type Handler

```typescript
private static async handleType(step: TestStep): Promise<string | undefined> {
  // 1. Resolve element
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
  
  // 2. Validate value exists
  if (step.value === undefined) {
    throw new Error(`Type failed: Missing value`);
  }

  // 3. Highlight and focus
  await this.ensureElementInViewport(element);
  highlightElement(element, { color: '#4dabf7' });
  await new Promise(resolve => setTimeout(resolve, 350));

  const rect = element.getBoundingClientRect();
  const tabId = await this.getTabId();

  // 4. Focus element via CDP click
  await this.sendCDPMessage(MessageType.CDP_CLICK, {
    tabId,
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  });

  // 5. Send keystrokes via CDP
  await this.sendCDPMessage(MessageType.CDP_TYPE, {
    tabId,
    text: step.value,
  });

  return getElementValue(element);
}
```

### 3.5 Select Handler

```typescript
private static async handleSelect(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);

  // Strategy 1: Standard HTML Select
  if (element instanceof HTMLSelectElement) {
    const tabId = await this.getTabId();
    const rect = element.getBoundingClientRect();

    await this.sendCDPMessage(MessageType.CDP_CLICK, {
      tabId,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });

    element.value = step.value!;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return getElementValue(element);
  }

  // Strategy 2: Custom Combobox (like Ant Design)
  if (element.getAttribute('role') === 'combobox') {
    // Click to open dropdown
    await this.sendCDPMessage(MessageType.CDP_CLICK, {...});
    await this.waitForDomQuiet(1000, 200);

    // Find option by text
    const optionXPath = `//div[contains(@class, "ant-select-item-option-content") and text()="${step.value}"]`;
    const optionElement = await this.resolveElement({...step, selector: '', xpath: optionXPath}, 5000);

    if (optionElement) {
      const optRect = optionElement.getBoundingClientRect();
      await this.sendCDPMessage(MessageType.CDP_CLICK, {...});
      return step.value;
    }
  }

  // Strategy 3: Generic input
  if (element instanceof HTMLInputElement) {
    await this.sendCDPMessage(MessageType.CDP_CLICK, {...});
    await this.sendCDPMessage(MessageType.CDP_TYPE, { tabId, text: step.value });
    return getElementValue(element);
  }

  throw new Error(`Select failed: Unrecognized element type`);
}
```

### 3.6 Assert Handler

```typescript
private static async handleAssert(step: TestStep): Promise<string | undefined> {
  const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, false);

  // Handle not_exists assertion
  if (step.assertionType === 'not_exists') {
    if (element) {
      throw new Error(`Assertion failed: Element should NOT exist`);
    }
    return 'Not Exists';
  }

  // Element must exist for other assertions
  if (!element) {
    throw new Error(`Assertion failed: Element not found`);
  }

  // Highlight success in green
  highlightElement(element, { color: '#51cf66', duration: 1000 });

  const actualValue = getElementValue(element);

  // Value equality check
  if (step.assertionType === 'equals' && step.expectedValue !== undefined) {
    if (actualValue !== step.expectedValue) {
      throw new Error(`Expected "${step.expectedValue}", got "${actualValue}"`);
    }
  }

  // Value contains check
  if (step.assertionType === 'contains' && step.expectedValue !== undefined) {
    if (!actualValue.includes(step.expectedValue)) {
      throw new Error(`Expected value to contain "${step.expectedValue}"`);
    }
  }

  return actualValue;
}
```

---

## 4. Element Resolution Strategy

### 4.1 Core Resolution Algorithm

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
    // Find all matching elements
    const matches = this.findAllMatches(selectors, xpathSelectors, step);

    if (matches.length > 0) {
      const bestMatch = matches[0].element;
      lastBest = bestMatch;

      // Check if element is actionable
      if (!requireActionable || await isElementActionable(bestMatch)) {
        return bestMatch;
      }
    }

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));

    // Periodically wait for DOM to settle
    if (attempts % 5 === 0) {
      await this.waitForDomQuiet(500, 150);
    }
  }

  return requireActionable ? null : lastBest;
}
```

### 4.2 Finding All Matches

```typescript
private static findAllMatches(
  selectors: string[],
  xpathSelectors: string[],
  step: TestStep
): { element: Element; score: number }[] {
  const results: { element: Element; score: number }[] = [];
  const seen = new Set<Element>();

  // 1. CSS Selector Matches
  selectors.forEach((selector, priority) => {
    try {
      let baseSelector = selector;
      let textFilter: string | null = null;

      // Extract :has-text() filter
      const hasTextMatch = selector.match(/:has-text\('(.+?)'\)/);
      if (hasTextMatch) {
        baseSelector = selector.replace(hasTextMatch[0], '');
        textFilter = hasTextMatch[1];
      }

      const matches = queryAllShadows(baseSelector);
      matches.forEach((el, index) => {
        if (el.isConnected && !seen.has(el)) {
          // Apply text filter if present
          if (textFilter && !(el.textContent || '').includes(textFilter)) {
            return;
          }
          seen.add(el);
          results.push({
            element: el,
            score: this.scoreElementMatch(el, step, priority, index),
          });
        }
      });
    } catch (e) {}
  });

  // 2. XPath Matches
  xpathSelectors.forEach((xpath, priority) => {
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
  });

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
```

### 4.3 Scoring System

Element scoring determines which element to interact with when multiple matches exist:

```typescript
private static scoreElementMatch(
  element: Element,
  step: TestStep,
  selectorPriority: number,
  matchIndex: number
): number {
  const hints = step.elementHints;
  let score = 30 - selectorPriority * 5 - matchIndex;

  // Tag name match bonus
  if (hints?.tagName && element.tagName.toLowerCase() === hints.tagName.toLowerCase()) {
    score += 10;
  } else {
    score -= 5;
  }

  // Text content exact match bonus
  const text = (element.textContent || '').trim();
  const normalizedHint = hints?.textContent?.trim().toLowerCase();
  const normalizedText = text.toLowerCase();
  
  if (normalizedHint && normalizedText === normalizedHint) {
    score += 20;
  } else if (normalizedHint && normalizedText.includes(normalizedHint.slice(0, 40))) {
    score += 8;
  }

  // High priority attribute match bonus
  const highPriorityAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy', 'aria-label', 'role'];
  highPriorityAttrs.forEach(attr => {
    if (hints?.attributes?.[attr] && element.getAttribute(attr) === hints.attributes[attr]) {
      score += 15;
    }
  });

  // Other attribute match bonus
  const otherAttrs = ['name', 'type', 'id'];
  otherAttrs.forEach(attr => {
    if (hints?.attributes?.[attr] && element.getAttribute(attr) === hints.attributes[attr]) {
      score += 5;
    }
  });

  // Parent info match bonus
  if (hints?.parentInfo) {
    const parent = element.parentElement;
    if (parent) {
      if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
        score += 8;
      }
      if (parent.tagName.toLowerCase() === hints.parentInfo.tagName.toLowerCase()) {
        score += 4;
      }
    }
  }

  // Structural info match bonus
  if (hints?.structuralInfo) {
    const siblings = element.parentElement
      ? Array.from(element.parentElement.children).filter(c => c.tagName === element.tagName)
      : [];
    if (siblings.length > 0) {
      const index = siblings.indexOf(element) + 1;
      if (index === hints.structuralInfo.siblingIndex) {
        score += 3;
      }
    }
  }

  return score;
}
```

---

## 5. CDP Command Handling

### 5.1 CDPHandler (`src/background/index.ts`)

```typescript
export class CDPHandler {
  private static attachedTabs: Set<number> = new Set();

  public static async attach(tabId: number): Promise<void> {
    if (this.attachedTabs.has(tabId)) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          this.attachedTabs.add(tabId);
          resolve();
        }
      });
    });
  }

  public static async sendCommand(
    tabId: number,
    method: string,
    params: any
  ): Promise<any> {
    await this.attach(tabId);
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }
}
```

### 5.2 Click Command

```typescript
public static async click(tabId: number, x: number, y: number): Promise<void> {
  // Playwright-style click: move, press, release
  await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}
```

### 5.3 Type Command

```typescript
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
```

### 5.4 Scroll Command

```typescript
public static async scroll(
  tabId: number,
  x: number,
  y: number,
  deltaX: number,
  deltaY: number
): Promise<void> {
  await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY,
  });
}
```

---

## 6. Actionability Checks

### 6.1 isElementActionable

```typescript
export async function isElementActionable(element: Element): Promise<boolean> {
  if (!element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  // 1. Visibility Check
  const isVisible =
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0.1;

  if (!isVisible) return false;

  // 2. Disabled Check
  if (element instanceof HTMLElement) {
    if (element.hasAttribute('disabled') || 
        element.getAttribute('aria-disabled') === 'true') {
      return false;
    }
  }

  // 3. Stability Check (is it animating/moving?)
  const getRect = () => element.getBoundingClientRect();
  const rect1 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect2 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect3 = getRect();

  if (Math.abs(rect1.top - rect2.top) > 0.5 || 
      Math.abs(rect1.left - rect2.left) > 0.5) {
    return false; // Element is animating
  }

  // 4. Occlusion Check (is it covered?)
  const centerX = rect1.left + rect1.width / 2;
  const centerY = rect1.top + rect1.height / 2;

  let elAtPoint = document.elementFromPoint(centerX, centerY);
  
  // Pierce Shadow DOM
  while (elAtPoint && elAtPoint.shadowRoot) {
    const shadowEl = elAtPoint.shadowRoot.elementFromPoint(centerX, centerY);
    if (!shadowEl || shadowEl === elAtPoint) break;
    elAtPoint = shadowEl;
  }

  if (!elAtPoint) return true;

  // Allow if element contains point or vice versa
  if (element.contains(elAtPoint) || elAtPoint.contains(element)) {
    return true;
  }

  return false; // Covered by another element
}
```

---

## 7. Page Settlement Detection

### 7.1 waitForPageSettled

```typescript
public static async waitForPageSettled(
  timeout: number = 15000,
  quietWindowMs: number = 500
): Promise<void> {
  const start = Date.now();

  // Wait for DOMContentLoaded if still loading
  if (document.readyState === 'loading') {
    await new Promise<void>(resolve => {
      document.addEventListener('DOMContentLoaded', () => resolve());
      setTimeout(() => resolve(), timeout);
    });
  }

  // Wait for document.complete
  while (document.readyState !== 'complete' && 
         Date.now() - start < timeout / 2) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Wait for DOM to be quiet
  await this.waitForDomQuiet(
    Math.max(1000, timeout - (Date.now() - start)),
    quietWindowMs
  );
}
```

### 7.2 waitForDomQuiet

```typescript
private static waitForDomQuiet(
  timeout: number,
  quietWindowMs: number
): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    let quietTimer: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      resolve();
    };

    const resetQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietWindowMs);
    };

    const observer = new MutationObserver(resetQuietTimer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    resetQuietTimer();
    window.setTimeout(finish, timeout);
  });
}
```

---

## 8. Shadow DOM Support

### 8.1 queryAllShadows

```typescript
export function queryAllShadows(
  selector: string,
  root: Document | Element | ShadowRoot = document
): Element[] {
  let results: Element[] = [];

  // Try standard querySelectorAll
  try {
    results = Array.from(root.querySelectorAll(selector));
  } catch (e) {}

  // Find shadow hosts and recurse
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return (node as Element).shadowRoot
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  let currentNode = walker.nextNode() as Element | null;
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

---

## 9. Background Service Integration

### 9.1 START_PLAYBACK Handler

```typescript
case MessageType.START_PLAYBACK:
  try {
    const { blueprint, waitForCompletion } = message.data || {};
    
    // 1. Find starting URL
    const firstNavigateStep = blueprint.steps.find(s => s.action === 'navigate');
    let startUrl = firstNavigateStep?.value || blueprint.baseUrl || 'about:blank';

    // 2. Resolve relative URLs
    if (startUrl && !/^https?:\/\//i.test(startUrl) && blueprint.baseUrl) {
      startUrl = new URL(startUrl, blueprint.baseUrl).href;
    }

    // 3. Create new tab
    const tab = await chrome.tabs.create({
      url: startUrl,
      active: message.data.active ?? true,
    });

    // 4. Wait for tab to load
    await this.waitForTabComplete(tab.id);

    // 5. Persist state for recovery
    await chrome.storage.local.set({
      activePlayback: {
        isActive: true,
        blueprint,
        currentStepIndex: 0,
        status: 'playing',
        playbackTabId: tab.id,
      },
    });

    // 6. Send to content script
    chrome.tabs.sendMessage(tab.id!, {
      type: MessageType.START_PLAYBACK,
      data: { blueprint, playbackTabId: tab.id },
    });

  } catch (e: any) {
    sendResponse({ success: false, error: e.message });
  }
  break;
```

### 9.2 PLAYBACK_STATUS_UPDATE Handler

```typescript
case MessageType.PLAYBACK_STATUS_UPDATE:
  if (message.data.status === 'completed' || 
      message.data.status === 'failed') {
    
    // Stop recording if active
    if (isRecording) {
      await this.stopRecording();
    }

    // Resolve pending playback promise
    if (blueprintId && this.pendingPlaybacks.has(blueprintId)) {
      const resolve = this.pendingPlaybacks.get(blueprintId);
      this.pendingPlaybacks.delete(blueprintId);
      resolve({
        success: message.data.status === 'completed',
        data: message.data,
      });
    }

    // Close playback tab
    if (storage.activePlayback?.playbackTabId) {
      chrome.tabs.remove(storage.activePlayback.playbackTabId);
    }
    await chrome.storage.local.remove('activePlayback');
  }
  break;
```

---

## 10. Visual Feedback

### 10.1 Element Highlighting

```typescript
export function highlightElement(
  element: Element,
  options: {
    color?: string;    // Default: '#ff6b6b' (red for recording)
    duration?: number;  // Default: 2000ms
    className?: string;
  } = {}
): void {
  const { color = '#ff6b6b', duration = 2000, className = 'extension-highlight' } = options;

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

### 10.2 Color Coding

| Context | Color | Purpose |
|---------|-------|---------|
| Recording | `#ff6b6b` (Red) | Indicates captured elements |
| Playback | `#4dabf7` (Blue) | Shows element being interacted with |
| Assert Success | `#51cf66` (Green) | Confirms assertion passed |

---

## 11. Viewport Management

### 11.1 ensureElementInViewport

```typescript
private static async ensureElementInViewport(element: Element): Promise<void> {
  const rect = element.getBoundingClientRect();
  const inViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth);

  if (!inViewport) {
    const tabId = await this.getTabId();
    const viewportCenterY = window.innerHeight / 2;
    const elementCenterY = rect.top + rect.height / 2;
    const deltaY = elementCenterY - viewportCenterY;

    await this.sendCDPMessage(MessageType.CDP_SCROLL, {
      tabId,
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
      deltaX: 0,
      deltaY: Math.round(deltaY),
    });

    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
```

---

## 12. Execution Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLAYBACK EXECUTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Background Service                                                          │
│  ┌─────────────────┐                                                        │
│  │ START_PLAYBACK  │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                   │
│           ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. Resolve start URL from blueprint                                 │    │
│  │  2. Create new tab with start URL                                    │    │
│  │  3. Wait for tab to load (waitForTabComplete)                        │    │
│  │  4. Persist playback state to chrome.storage.local                  │    │
│  │  5. Send START_PLAYBACK message to content script                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                   │
│           ▼                                                                   │
│  Content Script (PlayerEngine)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  setupListeners() - Listen for START_PLAYBACK                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                   │
│           ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  startPlayback(blueprint, stepIndex, variables)                     │    │
│  │  - Validate not duplicate start                                     │    │
│  │  - Set state (isActive, blueprint, status='playing')               │    │
│  │  - Save state to storage                                             │    │
│  │  - Call runNextStep()                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                   │
│           ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  runNextStep(retryCount)                                            │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  a. Check if all steps completed                              │  │    │
│  │  │  b. Resolve parameters in step (${baseUrl} → actual)         │  │    │
│  │  │  c. Notify background of step start                           │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  d. If navigate action:                                      │  │    │
│  │  │     - Increment step index                                   │  │    │
│  │  │     - Execute Executor.handleNavigate(step)                  │  │    │
│  │  │     - Save state (returns early, waits for page load)        │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │           │                                                           │    │
│  │           ▼                                                           │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │  e. For all other actions:                                   │  │    │
│  │  │     - Wait for page to settle (waitForPageSettled)          │  │    │
│  │  │     - Execute step via Executor.executeStep(step)           │  │    │
│  │  │     - Increment step index                                   │  │    │
│  │  │     - Notify background of step completion                   │  │    │
│  │  │     - Wait for UI updates (5000ms quiet)                    │  │    │
│  │  │     - Delay 1000ms between steps                             │  │    │
│  │  │     - Call runNextStep() recursively                         │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTOR.EXECUTESTEP FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Executor.executeStep(step)                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                   │
│           ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  switch(step.action)                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│           │                                                                   │
│           ├──────────────────┬──────────────────┬──────────────────┐         │
│           ▼                  ▼                  ▼                  ▼         │
│    ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐     │
│    │ navigate  │     │   click   │     │   type    │     │  select   │     │
│    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘     │
│          │                  │                  │                  │         │
│          ▼                  ▼                  ▼                  ▼         │
│    window.location     resolveElement    resolveElement    resolveElement  │
│    .href = url        + CDP click        + CDP click        + CDP click    │
│                       + CDP type                            + select value │
│                                                                          │
│           ┌─────────────────────────────────────────────────────────┐      │
│           │                   resolveElement()                      │      │
│           │  ┌─────────────────────────────────────────────────────┐  │      │
│           │  │ 1. Extract CSS selectors and XPath from step      │  │      │
│           │  │ 2. Start polling loop (up to 30s)                 │  │      │
│           │  │ 3. findAllMatches() → score each match           │  │      │
│           │  │ 4. Check isElementActionable()                   │  │      │
│           │  │ 5. If not actionable, retry after 300ms          │  │      │
│           │  │ 6. Return best match or null                     │  │      │
│           │  └─────────────────────────────────────────────────────┘  │      │
│           └─────────────────────────────────────────────────────────┘      │
│                                                                              │
│           ┌─────────────────────────────────────────────────────────┐      │
│           │                isElementActionable()                     │      │
│           │  ┌─────────────────────────────────────────────────────┐ │      │
│           │  │ 1. Check if element.isConnected                     │ │      │
│           │  │ 2. Visibility: size > 0, display/visibility/opacity │ │      │
│           │  │ 3. Not disabled: no disabled attr, aria-disabled   │ │      │
│           │  │ 4. Stability: check 3 frames for movement >0.5px   │ │      │
│           │  │ 5. Occlusion: elementFromPoint at center           │ │      │
│           │  │ 6. Pierce Shadow DOM if needed                     │ │      │
│           │  └─────────────────────────────────────────────────────┘ │      │
│           └─────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. State Persistence & Recovery

### 13.1 Auto-Resume Mechanism

```typescript
private async checkAutoResume() {
  try {
    const result = await chrome.storage.local.get(['activePlayback']);
    if (result.activePlayback && result.activePlayback.isActive) {
      // Validate this is the correct playback tab
      const playbackTabId = result.activePlayback.playbackTabId;
      if (playbackTabId) {
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage(
            { type: MessageType.GET_TAB_ID }, 
            resolve
          );
        });
        const currentTabId = response?.data?.tabId;
        
        if (currentTabId !== playbackTabId) {
          return; // Not the playback tab, skip
        }
      }
      
      // Restore state
      this.state = result.activePlayback;
      
      // Continue playback if was playing
      if (this.state.status === 'playing') {
        this.runNextStep();
      }
    }
  } catch (error) {}
}
```

### 13.2 State Save Points

| Event | State Saved |
|-------|-------------|
| After `startPlayback()` | Full initial state |
| Before each `navigate` | Increment stepIndex |
| After each step | Increment stepIndex |
| After `stopPlayback()` | Status + error |

---

## 14. Retry Logic

```typescript
private async runNextStep(retryCount = 0) {
  try {
    // ... execute step
  } catch (error: any) {
    if (retryCount < 2) {
      console.log(`[Player] Retrying step ${this.state.currentStepIndex + 1} (Attempt ${retryCount + 2})...`);
      setTimeout(() => this.runNextStep(retryCount + 1), 2000);
    } else {
      this.stopPlayback('failed', error.message);
    }
  }
}
```

**Retry Strategy:**
- Maximum 2 retries (3 total attempts)
- 2-second delay between retries
- Only network/timeout errors trigger retry, not assertion failures

---

## 15. Error Handling

### 15.1 Error Types

| Error | Cause | Action |
|-------|-------|--------|
| Element not found | Selector invalid | Retry with wait |
| Not actionable | Element hidden/covered | Retry after DOM settles |
| Navigate failed | Invalid URL | Fail immediately |
| Assertion failed | Wrong expected value | Fail immediately |

### 15.2 Error Propagation

```typescript
// Notify background of step failure
chrome.runtime.sendMessage({
  type: MessageType.PLAYBACK_STATUS_UPDATE,
  data: {
    ...this.state,
    status: 'failed',
    error: error.message
  }
});

// Final status update
this.stopPlayback('failed', error.message);
```

---

## 16. Key Design Decisions

### 16.1 Why CDP Over JavaScript Events?

CDP (Chrome DevTools Protocol) provides:
1. **Precision**: Direct browser-level control
2. **Reliability**: Bypasses JavaScript event handling
3. **Consistency**: Matches actual user interactions exactly
4. **Shadow DOM**: Native support for shadow DOM traversal

### 16.2 Why Polling Instead of MutationObserver?

Polling was chosen for element resolution because:
1. **Simpler Logic**: No need to manage observer lifecycle
2. **Predictable**: Guaranteed retry interval
3. **Sufficient**: DOM changes are usually quick

### 16.3 Why Score-Based Selection?

When multiple elements match:
1. **Exact text match** → Highest score
2. **Test attributes** → High priority
3. **Sibling position** → Context-aware
4. **Parent info** → Structural hints

This mimics how a human would identify the correct element.

---

## 17. Performance Considerations

### 17.1 Timeouts

| Operation | Timeout |
|-----------|---------|
| Element resolution | 30 seconds |
| DOM quiet wait | 5 seconds |
| Page settle wait | 15 seconds |
| Step retry delay | 2 seconds |
| Between step delay | 1 second |

### 17.2 Optimization Opportunities

1. **Lazy Scoring**: Only score when multiple matches found
2. **XPath Caching**: Cache XPath results per session
3. **Batch Operations**: Group CDP commands where possible
4. **Early Termination**: Stop polling once element found actionable

---

## 18. Limitations & Future Improvements

### Current Limitations

1. **Single Tab**: Cannot interact across multiple tabs
2. **No Drag/Drop**: No support for drag operations
3. **No Keyboard Navigation**: Tab/Enter sequences not supported
4. **No File Upload**: Cannot handle file input automation
5. **No Iframe Deep**: Limited cross-origin iframe support

### Potential Improvements

1. **Multi-Tab Playback**: Coordinate actions across tabs
2. **Smart Waits**: Use intelligent wait strategies instead of fixed polling
3. **AI Fallback**: Use AI to repair failed selectors
4. **Visual Regression**: Compare screenshots at assertion points
5. **Network Stubbing**: Mock API responses during playback
