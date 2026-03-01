import { TestStep } from '@/types/recording';
import {
  simulateClick,
  simulateInput,
  highlightElement,
  scrollToElement,
  getElementValue,
  isElementInteractable,
  findByXPath,
  findAllByXPath,
  isElementVisible,
} from '@/utils/dom';

export class Executor {
  private static readonly DEFAULT_TIMEOUT = 30000;
  private static readonly RETRY_DELAY_MS = 300;

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

    await this.waitForDomQuiet(Math.max(1000, timeout - (Date.now() - start)), quietWindowMs);
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
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
    if (!element) {
      throw new Error(
        `Click failed: Element not found or not interactable for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' }); // Blue for playback

    // Brief delay to allow the user to see what's being clicked
    await new Promise(resolve => setTimeout(resolve, 350));

    const value = getElementValue(element);
    simulateClick(element);
    return value;
  }

  private static async handleType(step: TestStep): Promise<string | undefined> {
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, true);
    if (!element) {
      throw new Error(
        `Type failed: Element not found or not interactable for selectors [${this.getSelectors(step).join(', ')}] after ${this.DEFAULT_TIMEOUT}ms`
      );
    }

    if (step.value === undefined) {
      throw new Error(
        `Type failed: Missing value for 'type' action in step: ${step.description}`
      );
    }

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' });

    await new Promise(resolve => setTimeout(resolve, 350));

    simulateInput(element, step.value);
    return getElementValue(element);
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

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' });

    await new Promise(resolve => setTimeout(resolve, 350));

    // Handle standard HTML select
    if (element instanceof HTMLSelectElement) {
      element.value = step.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return getElementValue(element);
    }

    // Try to handle custom combobox (like Ant Design)
    if (element.getAttribute('role') === 'combobox') {
      simulateClick(element);
      await this.waitForDomQuiet(1000, 200);

      // We wait for the listbox/dropdown to appear and try to find the item
      const optionXPath = `//div[contains(@class, "ant-select-item-option-content") and text()="${step.value}"] | //div[@role="option" and contains(., "${step.value}")]`;
      const optionElement = await this.resolveElement(
        { ...step, selector: '', xpath: optionXPath, action: 'click' },
        5000,
        true
      );

      if (optionElement) {
        scrollToElement(optionElement);
        simulateClick(optionElement);
        return step.value;
      }
      
      throw new Error(`Select failed: Could not find option "${step.value}" in custom combobox`);
    }

    // If it's some other input, try setting its value and triggering change
    if (element instanceof HTMLInputElement) {
       simulateInput(element, step.value);
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
    const element = await this.resolveElement(step, this.DEFAULT_TIMEOUT, false);
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
        `Assertion failed: Element should NOT exist for selector "${step.selector}", but it was found.`
      );
    }

    scrollToElement(element);
    highlightElement(element, { color: '#51cf66', duration: 1000 }); // Green for success

    const actualValue = getElementValue(element);

    if (step.assertionType === 'equals' && step.expectedValue !== undefined) {
      if (actualValue !== step.expectedValue) {
        throw new Error(
          `Assertion failed: Expected value to be "${step.expectedValue}", but it was "${actualValue}"`
        );
      }
    }

    if (step.assertionType === 'contains' && step.expectedValue !== undefined) {
      if (!actualValue.includes(step.expectedValue)) {
        throw new Error(
          `Assertion failed: Expected value to contain "${step.expectedValue}", but it was "${actualValue}"`
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
    requireInteractable: boolean
  ): Promise<Element | null> {
    const selectors = this.getSelectors(step);
    const xpathSelectors = this.getXPathSelectors(step);
    
    if (selectors.length === 0 && xpathSelectors.length === 0) {
      return null;
    }

    const start = Date.now();
    let lastBest: Element | null = null;
    let attempts = 0;

    while (Date.now() - start < timeout) {
      // Try CSS selectors first
      if (selectors.length > 0) {
        const bestMatch = this.findBestMatch(selectors, step);
        if (bestMatch) {
          lastBest = bestMatch;
          if (!requireInteractable || isElementInteractable(bestMatch)) {
            return bestMatch;
          }
        }
      }

      // Try XPath selectors as fallback
      if (xpathSelectors.length > 0) {
        const xpathMatch = this.findBestXPathMatch(xpathSelectors, step);
        if (xpathMatch) {
          lastBest = xpathMatch;
          if (!requireInteractable || isElementInteractable(xpathMatch)) {
            return xpathMatch;
          }
        }
      }

      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
      if (attempts % 3 === 0) {
        // Reduced quiet time to prevent hanging on elements that might trigger continuous animation
        await this.waitForDomQuiet(400, 100);
      }
    }

    return requireInteractable ? null : lastBest;
  }

  private static findBestXPathMatch(
    xpathSelectors: string[],
    step: TestStep
  ): Element | null {
    let bestElement: Element | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    xpathSelectors.forEach((xpath, selectorPriority) => {
      const matches = findAllByXPath(xpath);

      matches.forEach((element, index) => {
        if (!element.isConnected) {
          return;
        }

        const score = this.scoreXPathMatch(
          element,
          step,
          selectorPriority,
          index
        );
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      });
    });

    return bestElement;
  }

  private static scoreXPathMatch(
    element: Element,
    step: TestStep,
    selectorPriority: number,
    matchIndex: number
  ): number {
    const hints = step.elementHints;
    const text = (element.textContent || '').trim();
    // XPath selectors are generally more stable, so start with higher base score
    let score = 25 - selectorPriority * 2 - matchIndex;

    if (isElementInteractable(element)) {
      score += 4;
    }

    if (hints?.tagName) {
      score += element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 6 : -4;
    }

    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText.includes(normalizedHint.slice(0, 40))) {
        score += 5;
      }
    }

    if (hints?.parentInfo) {
      const parent = element.parentElement;
      if (parent) {
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        if (hints.parentInfo.tagName && parent.tagName.toLowerCase() === hints.parentInfo.tagName.toLowerCase()) {
          score += 4;
        }
      }
    }

    if (hints?.structuralInfo) {
      const siblings = element.parentElement 
        ? Array.from(element.parentElement.children).filter(c => c.tagName === element.tagName)
        : [];
      if (siblings.length > 0) {
        const index = siblings.indexOf(element) + 1;
        if (index === hints.structuralInfo.siblingIndex) {
          score += 3;
        }
        // Bonus if element is in similar position among siblings
        const relativePos = Math.abs(index / siblings.length - hints.structuralInfo.siblingIndex / Math.max(hints.structuralInfo.totalSiblings, 1));
        if (relativePos < 0.2) {
          score += 2;
        }
      }
    }

    return score;
  }

  private static findBestMatch(
    selectors: string[],
    step: TestStep
  ): Element | null {
    let bestElement: Element | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    selectors.forEach((selector, selectorPriority) => {
      let matches: Element[] = [];
      try {
        matches = Array.from(document.querySelectorAll(selector));
      } catch {
        return;
      }

      matches.forEach((element, index) => {
        if (!element.isConnected) {
          return;
        }

        const score = this.scoreElementMatch(
          element,
          step,
          selectorPriority,
          index
        );
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      });
    });

    return bestElement;
  }

  private static scoreElementMatch(
    element: Element,
    step: TestStep,
    selectorPriority: number,
    matchIndex: number
  ): number {
    const hints = step.elementHints;
    const text = (element.textContent || '').trim();
    let score = 20 - selectorPriority * 3 - matchIndex;

    if (isElementInteractable(element)) {
      score += 4;
    }

    if (hints?.tagName) {
      score += element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 6 : -4;
    }

    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText.includes(normalizedHint.slice(0, 40))) {
        score += 5;
      }
    }

    if (hints?.attributes) {
      const attrsToMatch = [
        'data-testid',
        'data-test-id',
        'data-qa',
        'data-cy',
        'name',
        'role',
        'aria-label',
        'type',
        'id',
      ];

      attrsToMatch.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (!expected) return;
        if (element.getAttribute(attr) === expected) {
          score += 3;
        }
      });
    }

    // Score parent info if available
    if (hints?.parentInfo) {
      const parent = element.parentElement;
      if (parent) {
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        if (hints.parentInfo.tagName && parent.tagName.toLowerCase() === hints.parentInfo.tagName.toLowerCase()) {
          score += 4;
        }
      }
    }

    // Score structural info if available
    if (hints?.structuralInfo) {
      const siblings = element.parentElement 
        ? Array.from(element.parentElement.children).filter(c => c.tagName === element.tagName)
        : [];
      if (siblings.length > 0) {
        const index = siblings.indexOf(element) + 1;
        if (index === hints.structuralInfo.siblingIndex) {
          score += 3;
        }
        // Bonus if element is in similar position among siblings
        const relativePos = Math.abs(index / siblings.length - hints.structuralInfo.siblingIndex / Math.max(hints.structuralInfo.totalSiblings, 1));
        if (relativePos < 0.2) {
          score += 2;
        }
      }
    }

    return score;
  }

  private static async waitForDomQuiet(
    timeout: number,
    quietWindowMs: number
  ): Promise<void> {
    if (!document.body) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    await new Promise<void>(resolve => {
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
