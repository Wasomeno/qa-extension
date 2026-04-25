import { TestStep } from '@/types/recording';
import { MessageType } from '@/types/messages';
import {
  highlightElement,
  removeHighlight,
  getElementValue,
  isElementActionable,
  findAllByXPath,
  queryAllShadows,
  findElementByContext,
  ElementResolutionContext,
  clearInputElement,
} from '@/utils/dom';

export class Executor {
  private static readonly DEFAULT_TIMEOUT = 30000;
  private static readonly RETRY_DELAY_MS = 300;

  private static async sendCDPMessage(
    type: MessageType,
    data: any
  ): Promise<void> {
    console.log(`[Executor] Sending CDP message: ${type}`, data);
    const response = await new Promise<{ success: boolean; error?: string }>(
      resolve => {
        chrome.runtime.sendMessage({ type, data }, resolve);
      }
    );
    console.log(`[Executor] CDP message ${type} response:`, response);
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
      `[Executor] Handling click for CSS selectors:`,
      this.getSelectors(step)
    );
    console.log(
      `[Executor] Handling click for XPath selectors:`,
      this.getXPathSelectors(step)
    );
    // Clean up any existing highlights before starting new action
    removeHighlight();
    
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
    // Clean up any existing highlights before starting new action
    removeHighlight();
    
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
    // Focus element via CDP click first - this triggers browser autofill
    await this.sendCDPMessage(MessageType.CDP_CLICK, {
      tabId,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });

    // Wait for browser autofill to populate the field
    await new Promise(resolve => setTimeout(resolve, 200));

    // NOW clear the input (after autofill has occurred)
    // This is done directly in the content script where we have DOM access
    console.log(`[Executor] Clearing existing input value (including autofill)...`);
    const wasCleared = clearInputElement(element);
    console.log(`[Executor] Input cleared: ${wasCleared}, previous value was: "${getElementValue(element)}"`);

    // Small delay to ensure clear events are processed by frameworks
    await new Promise(resolve => setTimeout(resolve, 100));

    // TYPE THE VALUE - use JavaScript to set value directly (more reliable than CDP insertText)
    // This ensures the text goes into the correct element regardless of focus state
    console.log(`[Executor] Typing value via JavaScript...`);
    const typedValue = this.setElementValue(element, step.value!);
    console.log(`[Executor] Value set via JavaScript: "${typedValue}"`);

    const finalValue = getElementValue(element);
    console.log(`[Executor] Final element value: "${finalValue}"`);
    return finalValue;
  }

  /**
   * Sets the value of an input element using JavaScript.
   * This is more reliable than CDP insertText which depends on focus state.
   */
  private static setElementValue(element: Element, value: string): string {
    const tagName = element.tagName.toUpperCase();
    
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      
      // Set the value
      inputElement.value = value;

      // Dispatch events that frameworks listen to
      // Order matters for some frameworks
      inputElement.dispatchEvent(
        new Event('focus', { bubbles: true, cancelable: true })
      );
      inputElement.dispatchEvent(
        new Event('input', { bubbles: true, cancelable: true })
      );
      inputElement.dispatchEvent(
        new Event('change', { bubbles: true, cancelable: true })
      );
      inputElement.dispatchEvent(
        new Event('blur', { bubbles: true, cancelable: true })
      );

      // Handle React 16+ fiber props
      const reactKeys = Object.keys(element).filter(
        key =>
          key.startsWith('__reactProps') || key.startsWith('__reactFiber')
      );
      for (const reactKey of reactKeys) {
        const props = (element as any)[reactKey];
        if (props && typeof props.onChange === 'function') {
          try {
            props.onChange({ target: element });
          } catch (e) {
            // Ignore React handler errors
          }
        }
      }

      console.log(`[setElementValue] Set ${tagName} value to: "${value}"`);
      return value;
    }

    // Handle contenteditable elements
    if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(
        new Event('input', { bubbles: true, cancelable: true })
      );
      return value;
    }

    console.log(`[setElementValue] Element ${tagName} is not an input`);
    return '';
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

    // Clean up any existing highlights before navigating
    removeHighlight();

    let targetUrl = step.value;
    // Resolve relative URLs against current origin
    if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
      try {
        targetUrl = new URL(targetUrl, window.location.origin).href;
      } catch {
        // If resolution fails, use as-is
      }
    }

    // Skip navigation if we're already on the target page (background already navigated)
    const currentUrl = window.location.href;
    const normalizedCurrent = currentUrl.endsWith('/') ? currentUrl.slice(0, -1) : currentUrl;
    const normalizedTarget = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;
    
    if (normalizedCurrent === normalizedTarget) {
      console.log(`[Executor] Already on target URL ${targetUrl}, skipping navigation`);
      return targetUrl;
    }

    console.log(`[Executor] Navigating to: ${targetUrl} (from ${currentUrl})`);
    window.location.href = targetUrl;
    return targetUrl;
  }

  private static async handleSelect(
    step: TestStep
  ): Promise<string | undefined> {
    // Clean up any existing highlights before starting new action
    removeHighlight();
    
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
    // Clean up any existing highlights before starting new action
    removeHighlight();
    
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
    const selectors = this.getSelectors(step);
    const xpathSelectors = this.getXPathSelectors(step);

    if (selectors.length === 0 && xpathSelectors.length === 0 && !step.elementHints) {
      console.warn('[Executor] No selectors or element hints provided');
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
          console.log('[Executor] Element resolved and actionable!');
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

    // AGENT RESOLVE FALLBACK
    // When primary selectors fail and fallbackPolicy is 'agent_resolve',
    // use comprehensive element hints to find the element
    if (step.fallbackPolicy === 'agent_resolve' && step.elementHints) {
      console.log('[Executor] Primary selectors failed, attempting agent_resolve fallback...');
      console.log('[Executor] Element hints context:', {
        tagName: step.elementHints.tagName,
        textContent: step.elementHints.textContent?.substring(0, 50),
        attributes: step.elementHints.attributes,
        parentInfo: step.elementHints.parentInfo,
        structuralInfo: step.elementHints.structuralInfo
      });

      const context: ElementResolutionContext = {
        tagName: step.elementHints.tagName,
        textContent: step.elementHints.textContent,
        attributes: step.elementHints.attributes,
        parentInfo: step.elementHints.parentInfo,
        structuralInfo: step.elementHints.structuralInfo,
      };

      const contextElement = findElementByContext(context);

      if (contextElement) {
        console.log('[Executor] Found element via context hints, checking actionability...');
        if (!requireActionable || await isElementActionable(contextElement)) {
          console.log('[Executor] Agent resolve fallback successful!');
          // Give it a highlight to show it was resolved via fallback
          highlightElement(contextElement, { color: '#ffd43b', duration: 2000 }); // Yellow for fallback
          return contextElement;
        } else {
          console.log('[Executor] Context element found but not actionable, scrolling into view...');
          contextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          if (await isElementActionable(contextElement)) {
            console.log('[Executor] Element now actionable after scroll!');
            highlightElement(contextElement, { color: '#ffd43b', duration: 2000 });
            return contextElement;
          }
        }
      } else {
        console.log('[Executor] Agent resolve fallback: No element found via context');
      }
    }

    console.log(`[Executor] Element resolution failed after ${timeout}ms`);
    return requireActionable ? null : lastBest;
  }

  private static findAllMatches(
    selectors: string[],
    xpathSelectors: string[],
    step: TestStep
  ): { element: Element; score: number }[] {
    const results: { element: Element; score: number }[] = [];
    const seen = new Set<Element>();

    // 1. XPath FIRST (primary matching strategy - more specific)
    if (xpathSelectors.length > 0) {
      console.log(`[Executor] Trying ${xpathSelectors.length} XPath selectors...`);
      
      xpathSelectors.forEach((xpath, priority) => {
        try {
          const matches = findAllByXPath(xpath);
          console.log(`[Executor] XPath "${xpath}" found ${matches.length} matches`);
          matches.forEach((el, index) => {
            if (el.isConnected && !seen.has(el)) {
              seen.add(el);
              results.push({
                element: el,
                score: this.scoreXPathMatch(el, step, priority, index),
              });
            }
          });
        } catch (e) {
          console.error(`[Executor] XPath "${xpath}" failed:`, e);
        }
      });
    }

    // 2. CSS selectors as FALLBACK (when XPath fails)
    if (results.length === 0) {
      console.log(`[Executor] XPath found no matches, trying CSS selectors as fallback...`);
      
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
    }

    // Sort by score descending (Playwright-style locator disambiguation)
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate additional XPath patterns as fallback when primary XPath fails
   */
  private static generateFallbackXPaths(step: TestStep): string[] {
    const xpaths: string[] = [];
    const hints = step.elementHints;
    
    if (!hints) return xpaths;
    
    const tagName = hints.tagName?.toLowerCase() || '*';
    const textContent = hints.textContent?.trim();
    
    // 1. Generate contains() XPath for partial text matching
    if (textContent && textContent.length > 2) {
      const escaped = textContent.replace(/'/g, "&apos;");
      
      // Partial text with normalize-space
      xpaths.push(`//${tagName}[contains(normalize-space(.), '${escaped}')]`);
      
      // Partial text without normalize-space
      xpaths.push(`//${tagName}[contains(., '${escaped}')]`);
      
      // Role + partial text
      if (hints.attributes?.role) {
        const role = hints.attributes.role;
        xpaths.push(`//*[@role='${role}' and contains(normalize-space(.), '${escaped}')]`);
        xpaths.push(`//*[@role='${role}' and contains(., '${escaped}')]`);
      }
      
      // Any element with partial text
      xpaths.push(`//*[contains(normalize-space(.), '${escaped}')]`);
    }
    
    // 2. Generate XPath based on parent context
    if (hints.parentInfo?.tagName) {
      const parentTag = hints.parentInfo.tagName.toLowerCase();
      const parentId = hints.parentInfo.id;
      
      // Parent by ID + child tag
      if (parentId) {
        xpaths.push(`//${parentId}//${tagName}[normalize-space(.)='${textContent?.replace(/'/g, "&apos;") || ''}']`);
        xpaths.push(`//*[@id='${parentId}']//${tagName}[normalize-space(.)='${textContent?.replace(/'/g, "&apos;") || ''}']`);
      }
      
      // Parent by tag + child
      xpaths.push(`//${parentTag}//${tagName}`);
    }
    
    // 3. Generate XPath with data attributes
    const dataAttrs = ['data-menu-id', 'data-testid', 'data-cy', 'data-qa'];
    for (const attr of dataAttrs) {
      const value = hints.attributes?.[attr];
      if (value) {
        xpaths.push(`//*[@${attr}='${value.replace(/'/g, "&apos;")}']`);
        xpaths.push(`//${tagName}[@${attr}='${value.replace(/'/g, "&apos;")}']`);
      }
    }
    
    // 4. Generate XPath with structural info (sibling index)
    if (hints.structuralInfo && hints.structuralInfo.siblingIndex > 0) {
      const { siblingIndex, totalSiblings } = hints.structuralInfo;
      const parentTag = hints.parentInfo?.tagName?.toLowerCase() || 'div';
      
      // XPath with nth-child
      xpaths.push(`//${parentTag}/*[${tagName}][${siblingIndex}]`);
    }
    
    return xpaths;
  }

  private static scoreXPathMatch(
    element: Element,
    step: TestStep,
    selectorPriority: number,
    matchIndex: number
  ): number {
    const hints = step.elementHints;
    const text = (element.textContent || '').trim();
    // Give XPath matches higher base score to prioritize them over CSS
    let score = 50 - selectorPriority * 3 - matchIndex;

    // Tag name match
    if (hints?.tagName) {
      score +=
        element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 10 : -5;
    }

    // Text content match
    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText === normalizedHint) {
        score += 20;
      } else if (normalizedHint && normalizedText.includes(normalizedHint.slice(0, 40))) {
        score += 8;
      }
    }

    // High priority attributes match
    if (hints?.attributes) {
      const highPriorityAttrs = [
        'data-testid',
        'data-test-id',
        'data-qa',
        'data-cy',
        'aria-label',
        'aria-labelledby',
        'role',
      ];
      highPriorityAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 15;
        }
      });

      // Other attributes
      const otherAttrs = ['name', 'type', 'id', 'placeholder', 'title'];
      otherAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 5;
        }
      });
    }

    // Parent info match (ENHANCED)
    if (hints?.parentInfo) {
      const parent = element.parentElement;
      
      if (parent) {
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        
        if (hints.parentInfo.tagName && 
            parent.tagName.toLowerCase() === hints.parentInfo.tagName.toLowerCase()) {
          score += 4;
        }
        
        // Parent selector validation
        if (hints.parentInfo.selector) {
          try {
            if (parent.matches(hints.parentInfo.selector)) {
              score += 6;
            }
          } catch {}
        }
        
        // Parent attributes match
        if (hints.parentInfo.attributes) {
          for (const [attr, expected] of Object.entries(hints.parentInfo.attributes)) {
            if (parent.getAttribute(attr) === expected) {
              score += 3;
            }
          }
        }
      }
    }

    // Structural info match
    if (hints?.structuralInfo) {
      const siblings = element.parentElement
        ? Array.from(element.parentElement.children).filter(
            c => c.tagName === element.tagName
          )
        : [];
      
      if (siblings.length > 0) {
        const index = siblings.indexOf(element) + 1;
        
        if (index === hints.structuralInfo.siblingIndex) {
          score += 5;
        }
        
        // Position proximity
        const posDiff = Math.abs(index - hints.structuralInfo.siblingIndex);
        if (posDiff === 1) score += 1;
      }
    }

    // XPath pattern bonus (NEW)
    // Prefer more robust XPath patterns
    const xpath = step.xpath || step.xpathCandidates?.[0] || '';
    
    if (xpath.includes('normalize-space')) {
      score += 5; // normalize-space handles whitespace - most robust
    }
    
    if (xpath.includes('contains(')) {
      score += 2; // contains is fallback for partial matches
    }
    
    // Prefer attribute-based over positional XPath
    if (xpath.includes('@data-testid') || xpath.includes('@data-test-id')) {
      score += 3; // Data test attributes are most reliable
    }
    
    if (xpath.includes('@role=') && xpath.includes('@aria-label=')) {
      score += 2; // Combined role + aria-label is good
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

    // Tag name match bonus
    if (hints?.tagName) {
      score +=
        element.tagName.toLowerCase() === hints.tagName.toLowerCase() ? 10 : -5;
    }

    // Text content match bonus
    if (hints?.textContent) {
      const normalizedHint = hints.textContent.trim().toLowerCase();
      const normalizedText = text.toLowerCase();
      if (normalizedHint && normalizedText === normalizedHint) {
        score += 20; // Exact text match - highest bonus
      } else if (normalizedHint && normalizedText.includes(normalizedHint.slice(0, 40))) {
        score += 8; // Partial text match
      }
    }

    // High priority attributes match bonus (data-testid, aria-*, role)
    if (hints?.attributes) {
      const highPriorityAttrs = [
        'data-testid',
        'data-test-id',
        'data-qa',
        'data-cy',
        'aria-label',
        'aria-labelledby',
        'role',
      ];
      highPriorityAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 15;
        }
      });

      // Other stable attributes
      const otherAttrs = ['name', 'type', 'id', 'placeholder', 'title'];
      otherAttrs.forEach(attr => {
        const expected = hints.attributes?.[attr];
        if (expected && element.getAttribute(attr) === expected) {
          score += 5;
        }
      });
    }

    // Parent info match bonus (ENHANCED)
    if (hints?.parentInfo) {
      const parent = element.parentElement;
      const grandparent = parent?.parentElement;
      
      if (parent) {
        // ID match - highest parent bonus
        if (hints.parentInfo.id && parent.id === hints.parentInfo.id) {
          score += 8;
        }
        
        // Tag name match
        if (hints.parentInfo.tagName && 
            parent.tagName.toLowerCase() === hints.parentInfo.tagName.toLowerCase()) {
          score += 4;
        }
        
        // Parent selector validation (NEW)
        if (hints.parentInfo.selector) {
          try {
            if (parent.matches(hints.parentInfo.selector)) {
              score += 6;
            }
          } catch {
            // Invalid selector, skip
          }
        }
        
        // Parent attributes match (NEW)
        if (hints.parentInfo.attributes) {
          for (const [attr, expected] of Object.entries(hints.parentInfo.attributes)) {
            if (parent.getAttribute(attr) === expected) {
              score += 3;
            }
          }
        }
      }
      
      // Grandparent context bonus (NEW)
      if (grandparent) {
        const gpId = grandparent.id;
        const gpTagName = grandparent.tagName.toLowerCase();
        
        // If parent's recorded ID matches grandparent's ID, we have context
        if (hints.parentInfo.id && hints.parentInfo.id === gpId) {
          score += 2; // Slight bonus for matching grandparent context
        }
        
        // Check if grandparent has stable attributes that match hints
        if (hints.parentInfo.attributes) {
          for (const [attr, expected] of Object.entries(hints.parentInfo.attributes)) {
            if (grandparent.getAttribute(attr) === expected) {
              score += 1; // Minor bonus for grandparent attribute match
            }
          }
        }
      }
    }

    // Structural info match bonus (ENHANCED)
    if (hints?.structuralInfo) {
      const siblings = element.parentElement
        ? Array.from(element.parentElement.children).filter(
            c => c.tagName === element.tagName
          )
        : [];
      
      if (siblings.length > 0) {
        const index = siblings.indexOf(element) + 1;
        const totalSiblings = siblings.length;
        
        // Exact sibling position match - increased bonus
        if (index === hints.structuralInfo.siblingIndex) {
          score += 5;
        }
        
        // Relative position scoring (NEW)
        if (hints.structuralInfo.totalSiblings > 0) {
          const isFirst = index === 1;
          const isLast = index === totalSiblings;
          const expectedIsFirst = hints.structuralInfo.siblingIndex === 1;
          const expectedIsLast = hints.structuralInfo.siblingIndex === hints.structuralInfo.totalSiblings;
          
          if ((isFirst && expectedIsFirst) || (isLast && expectedIsLast)) {
            score += 2; // Position at edge matches
          }
          
          // Position proximity bonus
          const posDiff = Math.abs(index - hints.structuralInfo.siblingIndex);
          if (posDiff === 1) {
            score += 1; // Adjacent position
          }
          
          // Total siblings match
          if (totalSiblings === hints.structuralInfo.totalSiblings) {
            score += 1;
          }
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
