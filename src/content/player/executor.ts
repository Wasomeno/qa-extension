import { TestStep } from '@/types/recording';
import { MessageType } from '@/types/messages';
import {
  highlightElement,
  getElementValue,
  isElementActionable,
  findAllByXPath,
  queryAllShadows,
} from '@/utils/dom';

export class Executor {
  private static readonly DEFAULT_TIMEOUT = 30000;
  private static readonly RETRY_DELAY_MS = 300;

  private static async sendCDPMessage(
    type: MessageType,
    data: any
  ): Promise<void> {
    const response = await new Promise<{ success: boolean; error?: string }>(
      resolve => {
        chrome.runtime.sendMessage({ type, data }, resolve);
      }
    );
    if (!response?.success) {
      throw new Error(
        `CDP command failed: ${response?.error || 'Unknown error'}`
      );
    }
  }

  private static async getTabId(): Promise<number> {
    const response = await new Promise<{
      success: boolean;
      data?: { tabId: number };
    }>(resolve => {
      chrome.runtime.sendMessage({ type: MessageType.GET_TAB_ID }, resolve);
    });
    if (!response?.success || !response.data?.tabId) {
      throw new Error('Could not determine current tab ID');
    }
    return response.data.tabId;
  }

  public static async waitForPageSettled(
    timeout: number = 15000,
    quietWindowMs: number = 500
  ): Promise<void> {
    const start = Date.now();

    if (document.readyState === 'loading') {
      await new Promise<void>(resolve => {
        const onReady = () => {
          document.removeEventListener('DOMContentLoaded', onReady);
          resolve();
        };
        document.addEventListener('DOMContentLoaded', onReady);
        setTimeout(() => {
          document.removeEventListener('DOMContentLoaded', onReady);
          resolve();
        }, timeout);
      });
    }

    while (
      document.readyState !== 'complete' &&
      Date.now() - start < timeout / 2
    ) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.waitForDomQuiet(
      Math.max(1000, timeout - (Date.now() - start)),
      quietWindowMs
    );
  }

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

  private static async handleClick(
    step: TestStep
  ): Promise<string | undefined> {
    console.log(
      `[Executor] Handling click for selectors:`,
      this.getSelectors(step)
    );
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
    if (!element) {
      console.error(
        `[Executor] Click failed: Element not found or actionable.`
      );
      throw new Error(
        `Click failed: Element not found or not interactable for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    console.log(`[Executor] Element found. Ensuring in viewport...`);
    await this.ensureElementInViewport(element);
    highlightElement(element, { color: '#4dabf7' }); // Blue for playback

    // Brief delay to allow the user to see what's being clicked
    await new Promise(resolve => setTimeout(resolve, 350));

    const value = getElementValue(element);
    const rect = element.getBoundingClientRect();
    const tabId = await this.getTabId();

    console.log(
      `[Executor] Sending CDP click to (${Math.round(rect.left + rect.width / 2)}, ${Math.round(rect.top + rect.height / 2)})`
    );
    await this.sendCDPMessage(MessageType.CDP_CLICK, {
      tabId,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });

    return value;
  }

  private static async handleType(step: TestStep): Promise<string | undefined> {
    console.log(
      `[Executor] Handling type "${step.value}" for selectors:`,
      this.getSelectors(step)
    );
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
    if (!element) {
      console.error(`[Executor] Type failed: Element not found or actionable.`);
      throw new Error(
        `Type failed: Element not found or not interactable for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    if (step.value === undefined) {
      throw new Error(
        `Type failed: Missing value for 'type' action in step: ${step.description}`
      );
    }

    await this.ensureElementInViewport(element);
    highlightElement(element, { color: '#4dabf7' });

    await new Promise(resolve => setTimeout(resolve, 350));

    const rect = element.getBoundingClientRect();
    const tabId = await this.getTabId();

    console.log(`[Executor] Sending CDP click to focus element...`);
    // Focus element via CDP click first
    await this.sendCDPMessage(MessageType.CDP_CLICK, {
      tabId,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });

    console.log(`[Executor] Sending CDP keystrokes...`);
    // Send keystrokes
    await this.sendCDPMessage(MessageType.CDP_TYPE, {
      tabId,
      text: step.value,
    });

    return getElementValue(element);
  }

  private static async ensureElementInViewport(
    element: Element
  ): Promise<void> {
    const rect = element.getBoundingClientRect();
    const inViewport =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);

    if (!inViewport) {
      const tabId = await this.getTabId();
      // Use CDP mouseWheel to scroll until element is in view
      // We'll use a simple approach: scroll the center of the viewport to the element
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

      // Wait for scroll to settle
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private static async handleNavigate(
    step: TestStep
  ): Promise<string | undefined> {
    if (!step.value) {
      throw new Error(`Missing URL for 'navigate' action`);
    }

    let targetUrl = step.value;
    // Resolve relative URLs against current origin
    if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
      try {
        targetUrl = new URL(targetUrl, window.location.origin).href;
      } catch {
        // If resolution fails, use as-is
      }
    }

    window.location.href = targetUrl;
    return targetUrl;
  }

  private static async handleSelect(
    step: TestStep
  ): Promise<string | undefined> {
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
    if (!element) {
      throw new Error(
        `Select failed: Element not found or not interactable for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    if (step.value === undefined) {
      throw new Error(`Select failed: Missing value for 'select' action`);
    }

    await this.ensureElementInViewport(element);
    highlightElement(element, { color: '#4dabf7' });

    await new Promise(resolve => setTimeout(resolve, 350));

    // Handle standard HTML select
    if (element instanceof HTMLSelectElement) {
      const tabId = await this.getTabId();
      const rect = element.getBoundingClientRect();

      // Click to open select
      await this.sendCDPMessage(MessageType.CDP_CLICK, {
        tabId,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      });

      element.value = step.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return getElementValue(element);
    }

    // Try to handle custom combobox (like Ant Design)
    if (element.getAttribute('role') === 'combobox') {
      const tabId = await this.getTabId();
      const rect = element.getBoundingClientRect();

      await this.sendCDPMessage(MessageType.CDP_CLICK, {
        tabId,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      });

      await this.waitForDomQuiet(1000, 200);

      // We wait for the listbox/dropdown to appear and try to find the item
      const optionXPath = `//div[contains(@class, \"ant-select-item-option-content\") and text()=\"${step.value}\"] | //div[@role=\"option\" and contains(., \"${step.value}\")]`;
      const optionElement = await this.resolveElement(
        { ...step, selector: '', xpath: optionXPath, action: 'click' },
        5000,
        true
      );

      if (optionElement) {
        await this.ensureElementInViewport(optionElement);
        const optRect = optionElement.getBoundingClientRect();
        await this.sendCDPMessage(MessageType.CDP_CLICK, {
          tabId,
          x: Math.round(optRect.left + optRect.width / 2),
          y: Math.round(optRect.top + optRect.height / 2),
        });
        return step.value;
      }

      throw new Error(
        `Select failed: Could not find option \"${step.value}\" in custom combobox`
      );
    }

    // If it's some other input, try setting its value and triggering change
    if (element instanceof HTMLInputElement) {
      const tabId = await this.getTabId();
      const rect = element.getBoundingClientRect();

      await this.sendCDPMessage(MessageType.CDP_CLICK, {
        tabId,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      });

      await this.sendCDPMessage(MessageType.CDP_TYPE, {
        tabId,
        text: step.value,
      });

      return getElementValue(element);
    }

    throw new Error(
      `Select failed: Element is not a recognized select or combobox type: ${step.selector}`
    );
  }

  private static async handleAssert(
    step: TestStep
  ): Promise<string | undefined> {
    // Simple assertion: check if element exists
    const element = await this.resolveElement(
      step,
      this.DEFAULT_TIMEOUT,
      false
    );
    if (!element) {
      if (step.assertionType === 'not_exists') {
        return 'Not Exists';
      }
      throw new Error(
        `Assertion failed: Element not found for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    if (step.assertionType === 'not_exists') {
      throw new Error(
        `Assertion failed: Element should NOT exist for selector \"${step.selector}\", but it was found.`
      );
    }

    await this.ensureElementInViewport(element);
    highlightElement(element, { color: '#51cf66', duration: 1000 }); // Green for success

    const actualValue = getElementValue(element);

    if (step.assertionType === 'equals' && step.expectedValue !== undefined) {
      if (actualValue !== step.expectedValue) {
        throw new Error(
          `Assertion failed: Expected value to be \"${step.expectedValue}\", but it was \"${actualValue}\"`
        );
      }
    }

    if (step.assertionType === 'contains' && step.expectedValue !== undefined) {
      if (!actualValue.includes(step.expectedValue)) {
        throw new Error(
          `Assertion failed: Expected value to contain \"${step.expectedValue}\", but it was \"${actualValue}\"`
        );
      }
    }

    return actualValue;
  }

  private static getSelectors(step: TestStep): string[] {
    return Array.from(
      new Set(
        [step.selector, ...(step.selectorCandidates || [])]
          .map(selector => selector?.trim())
          .filter((selector): selector is string => !!selector)
      )
    );
  }

  private static getXPathSelectors(step: TestStep): string[] {
    return Array.from(
      new Set(
        [step.xpath, ...(step.xpathCandidates || [])]
          .map(xpath => xpath?.trim())
          .filter((xpath): xpath is string => !!xpath && xpath.startsWith('//'))
      )
    );
  }

  private static async resolveElement(
    step: TestStep,
    timeout: number,
    requireActionable: boolean
  ): Promise<Element | null> {
    const selectors = this.getSelectors(step).map(s => {
      if (s.includes(':has-text(')) {
        console.warn(
          `[Executor] Found Playwright-specific selector ":has-text()". This is not standard CSS and might fail: ${s}`
        );
      }
      return s;
    });
    const xpathSelectors = this.getXPathSelectors(step);

    if (selectors.length === 0 && xpathSelectors.length === 0) {
      return null;
    }

    const start = Date.now();
    let lastBest: Element | null = null;
    let attempts = 0;

    console.log(
      `[Executor] Starting Playwright-style polling for [${selectors.join(', ')}]...`
    );

    while (Date.now() - start < timeout) {
      const elapsed = Date.now() - start;
      const shouldForce = elapsed > 15000; // Wait longer before forcing than before

      // Try CSS selectors first (including Shadow DOM)
      const matches = this.findAllMatches(selectors, xpathSelectors, step);

      if (matches.length > 1) {
        console.warn(
          `[Executor] Strictness Violation: Found ${matches.length} elements matching. Disambiguating...`
        );
      }

      if (matches.length > 0) {
        // Playwright-style Strict Mode: If multiple matches, we use the one with the highest score
        const bestMatch = matches[0].element;
        lastBest = bestMatch;

        if (
          !requireActionable ||
          shouldForce ||
          (await isElementActionable(bestMatch))
        ) {
          if (shouldForce)
            console.warn(
              `[Executor] Forcing interaction with element after 15s timeout.`
            );
          return bestMatch;
        }

        console.log(
          `[Executor] Element found but not yet actionable (Visibility/Stability/Occlusion). Retrying...`
        );
      }

      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));

      // Periodically wait for DOM to be quiet to avoid race conditions with dynamic loading
      if (attempts % 5 === 0) {
        await this.waitForDomQuiet(500, 150);
      }
    }

    return requireActionable ? null : lastBest;
  }

  private static findAllMatches(
    selectors: string[],
    xpathSelectors: string[],
    step: TestStep
  ): { element: Element; score: number }[] {
    const results: { element: Element; score: number }[] = [];
    const seen = new Set<Element>();

    // 1. Playwright-style CSS and text matches
    selectors.forEach((selector, priority) => {
      try {
        let baseSelector = selector;
        let textFilter: string | null = null;

        const hasTextMatch =
          selector.match(/:has-text\('(.+?)'\)/) ||
          selector.match(/:has-text\("(.+?)"\)/);
        const textMatch =
          selector.match(/:text\('(.+?)'\)/) ||
          selector.match(/:text\("(.+?)"\)/);

        if (hasTextMatch) {
          baseSelector = selector.replace(hasTextMatch[0], '');
          textFilter = hasTextMatch[1];
        } else if (textMatch) {
          baseSelector = selector.replace(textMatch[0], '');
          textFilter = textMatch[1];
        }

        if (!baseSelector) baseSelector = '*';

        const matches = queryAllShadows(baseSelector);
        matches.forEach((el, index) => {
          if (el.isConnected && !seen.has(el)) {
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

    // 2. XPath matches
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

    // Sort by score descending (Playwright-style locator disambiguation)
    return results.sort((a, b) => b.score - a.score);
  }

  private static scoreXPathMatch(
    element: Element,
    step: TestStep,
    selectorPriority: number,
    matchIndex: number
  ): number {
    const hints = step.elementHints;
    const text = (element.textContent || '').trim();
    let score = 30 - selectorPriority * 5 - matchIndex;

    if (hints?.tagName) {
      score +=
        element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 10 : -5;
    }

    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText === normalizedHint) {
        score += 20;
      } else if (
        normalizedHint &&
        normalizedText.includes(normalizedHint.slice(0, 40))
      ) {
        score += 8;
      }
    }

    if (hints?.attributes) {
      const highPriorityAttrs = [
        'data-testid',
        'data-test-id',
        'data-qa',
        'data-cy',
        'aria-label',
        'role',
      ];
      highPriorityAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 15;
        }
      });
    }

    if (hints?.parentInfo) {
      const parent = element.parentElement;
      if (parent) {
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        if (
          hints.parentInfo.tagName &&
          parent.tagName.toLowerCase() ===
            hints.parentInfo.tagName.toLowerCase()
        ) {
          score += 4;
        }
      }
    }

    return score;
  }

  private static scoreElementMatch(
    element: Element,
    step: TestStep,
    selectorPriority: number,
    matchIndex: number
  ): number {
    const hints = step.elementHints;
    const text = (element.textContent || '').trim();
    let score = 30 - selectorPriority * 5 - matchIndex;

    if (hints?.tagName) {
      score +=
        element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 10 : -5;
    }

    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText === normalizedHint) {
        score += 20;
      } else if (
        normalizedHint &&
        normalizedText.includes(normalizedHint.slice(0, 40))
      ) {
        score += 8;
      }
    }

    if (hints?.attributes) {
      const highPriorityAttrs = [
        'data-testid',
        'data-test-id',
        'data-qa',
        'data-cy',
        'aria-label',
        'role',
      ];
      highPriorityAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 15;
        }
      });

      const otherAttrs = ['name', 'type', 'id'];
      otherAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 5;
        }
      });
    }

    if (hints?.parentInfo) {
      const parent = element.parentElement;
      if (parent) {
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        if (
          hints.parentInfo.tagName &&
          parent.tagName.toLowerCase() ===
            hints.parentInfo.tagName.toLowerCase()
        ) {
          score += 4;
        }
      }
    }

    if (hints?.structuralInfo) {
      const siblings = element.parentElement
        ? Array.from(element.parentElement.children).filter(
            c => c.tagName === element.tagName
          )
        : [];
      if (siblings.length > 0) {
        const index = siblings.indexOf(element) + 1;
        if (index === hints.structuralInfo.siblingIndex) {
          score += 3;
        }
        const relativePos = Math.abs(
          index / siblings.length -
            hints.structuralInfo.siblingIndex /
              Math.max(hints.structuralInfo.totalSiblings, 1)
        );
        if (relativePos < 0.2) {
          score += 2;
        }
      }
    }

    return score;
  }

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
        if (quietTimer) {
          window.clearTimeout(quietTimer);
        }
        resolve();
      };

      const resetQuietTimer = () => {
        if (quietTimer) {
          window.clearTimeout(quietTimer);
        }
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
}
