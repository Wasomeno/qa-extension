/**
 * DOM manipulation utilities for the Gitlab Companion extension
 */

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  selector: string;
  selectorCandidates?: string[];
  xpath?: string;
  xpathCandidates?: string[];
  textContent?: string;
  attributes?: Record<string, string>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  // Deep tracking fields
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
}

const STABLE_ATTRIBUTES = [
  'data-testid',
  'data-test-id',
  'data-qa',
  'data-cy',
  'aria-label',
  'name',
  'placeholder',
  'title',
  'alt',
];

const STABLE_TAGS = ['button', 'a', 'input', 'select', 'textarea', 'nav', 'header', 'footer', 'section', 'article'];

export interface XPathCandidate {
  xpath: string;
  type: 'attribute' | 'text' | 'structural' | 'id' | 'combined';
}

function isLikelyStableClassName(className: string): boolean {
  if (!className) return false;
  if (className.length > 40) return false;
  if (/\d{3,}/.test(className)) return false;
  if (/[A-Za-z]+_[A-Za-z0-9]{5,}/.test(className)) return false; // CSS Modules / Styled Components
  if (className.startsWith('ant-')) return false; // Ignore Ant Design classes
  if (className.startsWith('rc-')) return false; // Ignore RC (React Component) classes often used in Ant
  if (className.startsWith('css-')) return false; // Emotion/MUI styled components
  if (className.startsWith('sc-')) return false; // Styled Components
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(className);
}

function isStableId(id: string | undefined): boolean {
  if (!id) return false;
  if (/^\d+$/.test(id)) return false;
  if (id.includes('rc-tabs-') || id.includes('rc-menu-') || id.includes('rc-select-')) return false;
  if (/^id-[a-zA-Z0-9]{6,}$/.test(id)) return false; // e.g. id-b3x9z2
  return true;
}

function isUniqueSelector(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Generate XPath candidates for an element
 */
export function generateXPathCandidates(element: Element): XPathCandidate[] {
  if (!element) return [];

  const candidates: XPathCandidate[] = [];
  const tagName = element.tagName.toLowerCase();

  // 1. Attribute-based XPath (highest priority)
  for (const attr of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    const xpath = `//${tagName}[@${attr}="${escapeXPathValue(value)}"]`;
    candidates.push({ xpath, type: 'attribute' });
  }

  // ID-based XPath
  if (isStableId(element.id)) {
    candidates.push({ xpath: `//*[@id="${CSS.escape(element.id)}"]`, type: 'id' });
  }

  // 2. Name + type combination
  const name = element.getAttribute('name');
  if (name && tagName !== 'div' && tagName !== 'span') {
    candidates.push({ xpath: `//${tagName}[@name="${escapeXPathValue(name)}"]`, type: 'combined' });
  }

  // 3. Text-based XPath for clickable elements
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length > 0 && textContent.length < 100) {
    const shortText = textContent.substring(0, 50);
    candidates.push({ xpath: `//${tagName}[contains(text(),"${escapeXPathValue(shortText)}")]`, type: 'text' });
  }

  // 4. Role-based XPath
  const role = element.getAttribute('role');
  if (role) {
    candidates.push({ xpath: `//*[@role="${escapeXPathValue(role)}"]`, type: 'attribute' });
  }

  // 5. Structural XPath - parent-based
  const parent = element.parentElement;
  if (parent) {
    // Parent with stable attribute
    for (const attr of STABLE_ATTRIBUTES) {
      const parentValue = parent.getAttribute(attr);
      if (parentValue) {
        const parentTag = parent.tagName.toLowerCase();
        candidates.push({ xpath: `//${parentTag}[@${attr}="${escapeXPathValue(parentValue)}"]/${tagName}`, type: 'structural' });
        break;
      }
    }

    // Parent with ID
    if (isStableId(parent.id)) {
      candidates.push({ xpath: `//*[@id="${CSS.escape(parent.id)}"]/${tagName}`, type: 'structural' });
    }

    // nth-child based (fallback)
    const siblings = Array.from(parent.children).filter(c => c.tagName === element.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(element) + 1;
      candidates.push({ xpath: `//${parent.tagName.toLowerCase()}/${tagName}[${index}]`, type: 'structural' });
    }
  }

  return candidates;
}

/**
 * Find element by XPath
 */
export function findByXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element;
  } catch {
    return null;
  }
}

/**
 * Find all elements by XPath
 */
export function findAllByXPath(xpath: string): Element[] {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null
    );
    const elements: Element[] = [];
    let node = result.iterateNext();
    while (node) {
      if (node instanceof Element) {
        elements.push(node);
      }
      node = result.iterateNext();
    }
    return elements;
  } catch {
    return [];
  }
}

/**
 * Escape value for XPath string
 */
function escapeXPathValue(value: string): string {
  return value
    .replace(/"/g, '&quot;')
    .replace(/'/g, "&apos;");
}

/**
 * Generate single best XPath for element
 */
export function generateXPath(element: Element): string {
  if (!element || element === document.body) {
    return '/html/body';
  }

  // Check stable attributes first
  for (const attr of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (value) {
      return `//${element.tagName.toLowerCase()}[@${attr}="${escapeXPathValue(value)}"]`;
    }
  }

  // Check ID
  if (isStableId(element.id)) {
    return `//*[@id="${CSS.escape(element.id)}"]`;
  }

  // Build path
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    let segment = current.tagName.toLowerCase();

    for (const attr of STABLE_ATTRIBUTES) {
      const value = current.getAttribute(attr);
      if (value) {
        segment += `[@${attr}="${escapeXPathValue(value)}"]`;
        break;
      }
    }

    if (!current.getAttribute('data-testid') && !current.getAttribute('data-cy') && 
        !current.getAttribute('data-qa') && !isStableId(current.id)) {
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          segment += `[${index}]`;
        }
      }
    }

    path.unshift(segment);
    current = current.parentElement;
  }

  return '/' + path.join('/');
}

export function generateSelectorCandidates(element: Element): string[] {
  if (!element) return [];

  const candidates: string[] = [];

  for (const attr of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    const selector = `[${attr}="${CSS.escape(value)}"]`;
    candidates.push(selector);
    if (isUniqueSelector(selector)) {
      return [selector, ...candidates.filter(c => c !== selector)];
    }
  }

  if (isStableId(element.id)) {
    candidates.push(`#${CSS.escape(element.id)}`);
  }

  const tagName = element.tagName.toLowerCase();
  const name = element.getAttribute('name');
  if (name) {
    candidates.push(`${tagName}[name="${CSS.escape(name)}"]`);
  }

  const role = element.getAttribute('role');
  if (role) {
    candidates.push(`${tagName}[role="${CSS.escape(role)}"]`);
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    candidates.push(`${tagName}[aria-label="${CSS.escape(ariaLabel)}"]`);
  }

  if (element.className && typeof element.className === 'string') {
    const stableClasses = element.className
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter(isLikelyStableClassName)
      .slice(0, 2);

    if (stableClasses.length > 0) {
      candidates.push(
        `${tagName}.${stableClasses.map(cls => CSS.escape(cls)).join('.')}`
      );
    }
  }

  const pathSelector = generateSelector(element);
  if (pathSelector) {
    candidates.push(pathSelector);
  }

  return Array.from(new Set(candidates));
}

/**
 * Generate a unique CSS selector for an element
 */
export function generateSelector(element: Element): string {
  if (!element || element === document.body) {
    return 'body';
  }

  // 1. Check for high-priority stable attributes (QA-friendly)
  for (const attr of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
      if (isUniqueSelector(selector)) {
        return selector;
      } else {
        // If not globally unique (e.g., multiple hidden datepickers), 
        // try to scope it by building a path up to a unique ancestor.
        let ancestor = element.parentElement;
        let scopedPath = selector;
        while (ancestor && ancestor.tagName.toLowerCase() !== 'html') {
          let ancestorSelector = ancestor.tagName.toLowerCase();
          let hasUniqueAncestorAttr = false;

          for (const aAttr of STABLE_ATTRIBUTES) {
            const aValue = ancestor.getAttribute(aAttr);
            if (aValue) {
              ancestorSelector += `[${aAttr}="${CSS.escape(aValue)}"]`;
              hasUniqueAncestorAttr = true;
              break;
            }
          }

          if (!hasUniqueAncestorAttr && isStableId(ancestor.id)) {
            ancestorSelector += `#${CSS.escape(ancestor.id)}`;
            hasUniqueAncestorAttr = true;
          }

          if (
            !hasUniqueAncestorAttr &&
            ancestor.className &&
            typeof ancestor.className === 'string'
          ) {
            const classes = ancestor.className.trim().split(/\s+/).filter(Boolean);
            const stableClasses = classes.filter(isLikelyStableClassName);
            if (stableClasses.length > 0) {
              ancestorSelector += '.' + stableClasses.slice(0, 3).map(c => CSS.escape(c)).join('.');
              hasUniqueAncestorAttr = true; // Use stable class as a scoping mechanism if nothing else
            }
          }

          if (hasUniqueAncestorAttr) {
            const testScopedSelector = `${ancestorSelector} ${selector}`;
            try {
              if (document.querySelectorAll(testScopedSelector).length === 1) {
                return testScopedSelector; // Successfully scoped to a unique container
              }
            } catch (e) {}
          }
          ancestor = ancestor.parentElement;
        }
      }
    }
  }

  // 2. Use ID if available and unique
  // Ignore purely numeric or auto-generated looking IDs
  if (isStableId(element.id)) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (isUniqueSelector(idSelector)) {
      return idSelector;
    }
  }

  // 2.5 Try to use text content for simple leaf nodes (like datepicker numbers)
  if (
    element.children.length === 0 &&
    element.textContent &&
    element.textContent.trim().length > 0 &&
    element.textContent.trim().length < 20 // Only use short text, e.g., "15" or "Submit"
  ) {
    const textContent = element.textContent.trim();
    // Use an attribute selector if text is available, as CSS doesn't have a :contains() selector
    // Fallback to evaluating uniqueness of XPath text equivalent via a custom approach or rely on XPath directly for playback.
    // For CSS Selector generation, we will fall back to structural paths if attributes and ID fail.
  }

  // 3. Build path from element to root
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    let selector = current.tagName.toLowerCase();
    let hasUniqueAttr = false;

    // Check stable attributes for current element in path
    for (const attr of STABLE_ATTRIBUTES) {
      const value = current.getAttribute(attr);
      if (value) {
        selector += `[${attr}="${CSS.escape(value)}"]`;
        hasUniqueAttr = true;
        break;
      }
    }

    if (!hasUniqueAttr && isStableId(current.id)) {
      selector += `#${CSS.escape(current.id)}`;
      hasUniqueAttr = true;
    }

    if (
      !hasUniqueAttr &&
      current.className &&
      typeof current.className === 'string'
    ) {
      const classes = current.className.trim().split(/\s+/).filter(Boolean);
      const stableClasses = classes.filter(isLikelyStableClassName);
      if (stableClasses.length > 0) {
        // Use first couple of classes
        selector +=
          '.' +
          stableClasses
            .slice(0, 3)
            .map(c => CSS.escape(c))
            .join('.');
      }
    }

    // Append nth-child only when we don't already have a stable anchor
    const parent = current.parentElement;
    if (parent && !hasUniqueAttr) {
      const index = Array.from(parent.children).indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    path.unshift(selector);
    const currentSelector = path.join(' > ');

    try {
      // Check if the current constructed path is unique globally
      if (document.querySelectorAll(currentSelector).length === 1) {
        return currentSelector;
      }
    } catch (e) {}

    current = current.parentElement;
  }

  return path.join(' > ') || '*';
}

/**
 * Get detailed information about an element
 */
export function getElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();
  const attributes: Record<string, string> = {};

  // Collect relevant attributes
  for (const attr of element.attributes) {
    if (
      ['id', 'class', 'data-*', 'name', 'type', 'role', 'aria-*'].some(
        pattern =>
          attr.name === pattern ||
          attr.name.startsWith(pattern.replace('*', ''))
      )
    ) {
      attributes[attr.name] = attr.value;
    }
  }

  // Collect parent info for deep tracking
  const parent = element.parentElement;
  let parentInfo: ElementInfo['parentInfo'];
  let structuralInfo: ElementInfo['structuralInfo'];

  if (parent) {
    const parentAttributes: Record<string, string> = {};
    for (const attr of parent.attributes) {
      if (['id', 'data-testid', 'data-test-id', 'data-qa', 'data-cy', 'name', 'role'].includes(attr.name)) {
        parentAttributes[attr.name] = attr.value;
      }
    }

    const siblings = Array.from(parent.children).filter(c => c.tagName === element.tagName);

    parentInfo = {
      tagName: parent.tagName.toLowerCase(),
      id: parent.id || undefined,
      selector: parent.id ? `#${CSS.escape(parent.id)}` : undefined,
      attributes: Object.keys(parentAttributes).length > 0 ? parentAttributes : undefined,
    };

    structuralInfo = {
      depth: getElementDepth(element),
      siblingIndex: siblings.indexOf(element) + 1,
      totalSiblings: siblings.length,
    };
  }

  // Generate XPath candidates
  const xpathCandidates = generateXPathCandidates(element);

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: generateSelector(element),
    selectorCandidates: generateSelectorCandidates(element),
    xpath: generateXPath(element),
    xpathCandidates: xpathCandidates.map(c => c.xpath),
    textContent: element.textContent?.trim().substring(0, 100) || undefined,
    attributes,
    position: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
    },
    size: {
      width: rect.width,
      height: rect.height,
    },
    parentInfo,
    structuralInfo,
  };
}

/**
 * Get element depth in DOM tree
 */
function getElementDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current && current.tagName.toLowerCase() !== 'html') {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

/**
 * Find element by selector with fallback strategies
 */
export function findElement(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch (error) {
    return null;
  }
}

/**
 * Check if element is visible and interactable
 */
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export function isElementInteractable(element: Element): boolean {
  if (!isElementVisible(element)) {
    return false;
  }

  if (element instanceof HTMLElement) {
    if (element.hasAttribute('disabled')) {
      return false;
    }
    if (element.getAttribute('aria-disabled') === 'true') {
      return false;
    }
  }

  return true;
}

/**
 * Highlight an element with visual overlay
 */
export function highlightElement(
  element: Element,
  options: {
    color?: string;
    duration?: number;
    className?: string;
  } = {}
): void {
  const {
    color = '#ff6b6b',
    duration = 2000,
    className = 'qa-extension-highlight',
  } = options;

  // Remove existing highlights
  removeHighlight();

  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');

  overlay.className = className;
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

  // Add pulse animation
  if (!document.querySelector('#qa-extension-styles')) {
    const style = document.createElement('style');
    style.id = 'qa-extension-styles';
    style.textContent = `
      @keyframes qa-pulse {
        0% { opacity: 0.6; transform: scale(1); }
        100% { opacity: 0.9; transform: scale(1.02); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      removeHighlight();
    }, duration);
  }
}

/**
 * Remove element highlight
 */
export function removeHighlight(): void {
  const highlights = document.querySelectorAll('.qa-extension-highlight');
  highlights.forEach(highlight => highlight.remove());
}

/**
 * Capture screenshot of specific element
 */
export function captureElementScreenshot(element: Element): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const rect = element.getBoundingClientRect();

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = rect.width;
      canvas.height = rect.height;

      // Use html2canvas-like approach or browser screenshot API
      // For now, return a placeholder - actual implementation would use
      // chrome.tabs.captureVisibleTab and crop the image
      resolve('data:image/png;base64,placeholder');
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get viewport information
 */
export function getViewportInfo() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio,
  };
}

/**
 * Scroll element into view with smooth animation
 */
export function scrollToElement(
  element: Element,
  options: ScrollIntoViewOptions = {}
): void {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
    ...options,
  });
}

/**
 * Get all interactive elements on the page
 */
export function getInteractiveElements(): Element[] {
  const selectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[onclick]',
    '[role="button"]',
    '[role="link"]',
    '[tabindex]:not([tabindex="-1"])',
    '.btn',
    '.button',
    '.clickable',
  ];

  const elements = document.querySelectorAll(selectors.join(', '));
  return Array.from(elements).filter(isElementVisible);
}

/**
 * Wait for element to appear in DOM
 */
export function waitForElement(
  selector: string,
  timeout: number = 30000
): Promise<Element | null> {
  return new Promise(resolve => {
    try {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        try {
          const element = document.querySelector(selector);
          if (element) {
            observer.disconnect();
            resolve(element);
          }
        } catch (e) {}
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function waitForInteractableElement(
  selector: string,
  timeout: number = 30000
): Promise<Element | null> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const element = findElement(selector);
    if (element && isElementInteractable(element)) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return null;
}

/**
 * Simulate user interaction on element
 */
export function simulateClick(element: Element): void {
  const events = ['mousedown', 'mouseup', 'click'];

  events.forEach(eventType => {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    element.dispatchEvent(event);
  });
}

/**
 * Simulate user input on an element
 */
export function simulateInput(element: Element, value: string): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    element.value = value;

    // Dispatch input event
    element.dispatchEvent(
      new Event('input', { bubbles: true, cancelable: true })
    );

    // Dispatch change event
    element.dispatchEvent(
      new Event('change', { bubbles: true, cancelable: true })
    );
  }
}

/**
 * Get the current value or text content of an element
 */
export function getElementValue(element: Element): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return element.textContent?.trim() || '';
}

/**
 * Get element's computed style properties
 */
export function getElementStyles(
  element: Element,
  properties: string[]
): Record<string, string> {
  const styles = window.getComputedStyle(element);
  const result: Record<string, string> = {};

  properties.forEach(prop => {
    result[prop] = styles.getPropertyValue(prop);
  });

  return result;
}

/**
 * Check if element matches accessibility criteria
 */
export function checkAccessibility(element: Element): {
  hasAltText: boolean;
  hasAriaLabel: boolean;
  hasProperContrast: boolean;
  isFocusable: boolean;
} {
  const tagName = element.tagName.toLowerCase();

  return {
    hasAltText: tagName === 'img' ? !!element.getAttribute('alt') : true,
    hasAriaLabel:
      !!element.getAttribute('aria-label') ||
      !!element.getAttribute('aria-labelledby'),
    hasProperContrast: true, // Would need color analysis
    isFocusable:
      element.hasAttribute('tabindex') ||
      ['a', 'button', 'input', 'select', 'textarea'].includes(tagName),
  };
}
