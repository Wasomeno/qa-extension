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

const STABLE_TAGS = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'nav',
  'header',
  'footer',
  'section',
  'article',
];

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
  if (
    id.includes('rc-tabs-') ||
    id.includes('rc-menu-') ||
    id.includes('rc-select-')
  )
    return false;
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

  // 1. Text-based XPath (extremely robust for semantic elements)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length > 0 && textContent.length < 60) {
    const escaped = escapeXPathValue(textContent);
    // Exact match using dot (includes nested text)
    candidates.push({ xpath: `//${tagName}[.='${escaped}']`, type: 'text' });
    // Normalize space match (best for multi-line or spaced text)
    candidates.push({
      xpath: `//${tagName}[normalize-space(.)='${escaped}']`,
      type: 'text',
    });
    // Partial match (very robust)
    if (textContent.length > 5) {
      candidates.push({
        xpath: `//${tagName}[contains(., '${escaped.substring(0, 30)}')]`,
        type: 'text',
      });
    }
  }

  // 2. Data-testid (The "Golden" attribute)
  for (const attr of ['data-testid', 'data-test-id', 'data-qa', 'data-cy']) {
    const val = element.getAttribute(attr);
    if (val) {
      candidates.push({
        xpath: `//*[@${attr}='${escapeXPathValue(val)}']`,
        type: 'attribute',
      });
    }
  }

  // 3. ARIA Roles and Labels
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');
  if (role) {
    if (ariaLabel) {
      candidates.push({
        xpath: `//${tagName}[@role='${role}' and (@aria-label='${ariaLabel}' or @aria-labelledby='${ariaLabel}')]`,
        type: 'attribute',
      });
      candidates.push({
        xpath: `//*[@role='${role}' and @aria-label='${ariaLabel}']`,
        type: 'attribute',
      });
    } else {
      candidates.push({
        xpath: `//${tagName}[@role='${role}']`,
        type: 'attribute',
      });
    }
  }

  // 4. Name, placeholder, alt
  for (const attr of ['name', 'placeholder', 'alt', 'title']) {
    const val = element.getAttribute(attr);
    if (val) {
      candidates.push({
        xpath: `//${tagName}[@${attr}='${escapeXPathValue(val)}']`,
        type: 'attribute',
      });
    }
  }

  // 5. Stable ID
  if (isStableId(element.id)) {
    candidates.push({ xpath: `//*[@id='${element.id}']`, type: 'id' });
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
  return value.replace(/'/g, '&apos;');
}

/**
 * Escape value for Playwright-style selectors using single quotes
 */
function escapeSelectorValue(value: string): string {
  return value.replace(/'/g, "\\'");
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
      return `//${element.tagName.toLowerCase()}[@${attr}='${escapeXPathValue(value)}']`;
    }
  }

  // Check ID
  if (isStableId(element.id)) {
    return `//*[@id='${CSS.escape(element.id)}']`;
  }

  // Build path
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    let segment = current.tagName.toLowerCase();

    for (const attr of STABLE_ATTRIBUTES) {
      const value = current.getAttribute(attr);
      if (value) {
        segment += `[@${attr}='${escapeXPathValue(value)}']`;
        break;
      }
    }

    if (
      !current.getAttribute('data-testid') &&
      !current.getAttribute('data-cy') &&
      !current.getAttribute('data-qa') &&
      !isStableId(current.id)
    ) {
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current!.tagName
        );
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
  const tagName = element.tagName.toLowerCase();

  // 1. Data-test-id attributes (Highest priority)
  const testIdAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy'];
  for (const attr of testIdAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push(`[${attr}='${CSS.escape(value)}']`);
    }
  }

  // 2. Role + Accessible Name (Semantic Priority)
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');
  const textContent = element.textContent?.trim().substring(0, 50);

  if (role) {
    if (ariaLabel) {
      candidates.push(
        `${tagName}[role='${CSS.escape(role)}'][aria-label='${CSS.escape(ariaLabel)}']`
      );
      candidates.push(
        `[role='${CSS.escape(role)}'][aria-label='${CSS.escape(ariaLabel)}']`
      );
    }
    if (textContent && textContent.length > 0) {
      // Playwright-style :has-text() for better targeting in both extension and backend
      candidates.push(
        `${tagName}[role='${CSS.escape(role)}']:has-text('${escapeSelectorValue(textContent)}')`
      );
      candidates.push(
        `[role='${CSS.escape(role)}']:has-text('${escapeSelectorValue(textContent)}')`
      );
    }
  }

  // 3. Labels (for inputs)
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const label = findAssociatedLabel(element);
    if (label && label.textContent) {
      const labelText = label.textContent.trim().substring(0, 50);
      // Playwright-style for labels
      candidates.push(
        `label:has-text('${escapeSelectorValue(labelText)}') + ${tagName}`
      );
    }
  }

  // 4. Name attribute
  const name = element.getAttribute('name');
  if (name) {
    candidates.push(`${tagName}[name='${CSS.escape(name)}']`);
  }

  // 5. Placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    candidates.push(`${tagName}[placeholder='${CSS.escape(placeholder)}']`);
  }

  // 6. Stable ID
  if (isStableId(element.id)) {
    candidates.push(`#${CSS.escape(element.id)}`);
  }

  // 7. Stable Classes
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

  // 8. Limited Path (Last resort)
  const pathSelector = generateSelector(element);
  if (pathSelector) {
    candidates.push(pathSelector);
  }

  return Array.from(new Set(candidates));
}

/**
 * Helper to find implicit roles
 */
function getImplicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute('type');

  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'input') {
    if (['button', 'submit', 'reset', 'image'].includes(type || ''))
      return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    return 'textbox';
  }
  return null;
}

/**
 * Find label associated with input
 */
function findAssociatedLabel(element: HTMLElement): HTMLElement | null {
  if (element.id) {
    const label = document.querySelector(
      `label[for="${CSS.escape(element.id)}"]`
    );
    if (label instanceof HTMLElement) return label;
  }
  return element.closest('label');
}

/**
 * Generate a unique CSS selector for an element
 */
export function generateSelector(element: Element): string {
  if (!element || element === document.body) {
    return 'body';
  }

  // 1. Try simple unique attributes first
  const uniqueAttrs = [
    'data-testid',
    'data-test-id',
    'data-qa',
    'data-cy',
    'id',
  ];
  for (const attr of uniqueAttrs) {
    const val = element.getAttribute(attr);
    if (val && (attr !== 'id' || isStableId(val))) {
      const sel =
        attr === 'id'
          ? `#${CSS.escape(val)}`
          : `[${attr}='${CSS.escape(val)}']`;
      if (isUniqueSelector(sel)) return sel;
    }
  }

  // 2. Build limited path (max 3 levels)
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && current.tagName.toLowerCase() !== 'html' && depth < 3) {
    let selector = current.tagName.toLowerCase();

    // Use ID if stable
    if (isStableId(current.id)) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      if (isUniqueSelector(path.join(' > '))) return path.join(' > ');
      break; // Stop climbing if we hit an ID
    }

    // Use stable classes
    const classes =
      current.className && typeof current.className === 'string'
        ? current.className
            .trim()
            .split(/\s+/)
            .filter(isLikelyStableClassName)
            .slice(0, 2)
        : [];

    if (classes.length > 0) {
      selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }

    // Add nth-child only if necessary
    const currentParent: Element | null = current.parentElement;
    if (currentParent) {
      const siblings = Array.from(currentParent.children).filter(
        c => (c as Element).tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = Array.from(currentParent.children).indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    if (isUniqueSelector(path.join(' > '))) return path.join(' > ');

    current = currentParent;
    depth++;
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
      if (
        [
          'id',
          'data-testid',
          'data-test-id',
          'data-qa',
          'data-cy',
          'name',
          'role',
        ].includes(attr.name)
      ) {
        parentAttributes[attr.name] = attr.value;
      }
    }

    const siblings = Array.from(parent.children).filter(
      c => c.tagName === element.tagName
    );

    parentInfo = {
      tagName: parent.tagName.toLowerCase(),
      id: parent.id || undefined,
      selector: parent.id ? `#${CSS.escape(parent.id)}` : undefined,
      attributes:
        Object.keys(parentAttributes).length > 0 ? parentAttributes : undefined,
    };

    structuralInfo = {
      depth: getElementDepth(element),
      siblingIndex: siblings.indexOf(element) + 1,
      totalSiblings: siblings.length,
    };
  }

  // Generate XPath candidates
  const xpathCandidates = generateXPathCandidates(element);
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: generateSelector(element),
    selectorCandidates: generateSelectorCandidates(element),
    xpath: xpathCandidates[0]?.xpath || generateXPath(element),
    xpathCandidates: xpathCandidates.map(c => c.xpath),
    textContent: element.textContent?.trim().substring(0, 100) || undefined,
    attributes: {
      ...attributes,
      ...(role ? { role } : {}),
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
    },
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
    return queryAllShadows(selector)[0] || null;
  } catch (error) {
    return null;
  }
}

/**
 * Recursively find elements including those in Shadow DOMs
 */
export function queryAllShadows(
  selector: string,
  root: Document | Element | ShadowRoot = document
): Element[] {
  let results: Element[] = [];

  // Try standard querySelectorAll on the current root
  try {
    results = Array.from(root.querySelectorAll(selector));
  } catch (e) {}

  // Find all shadow hosts under the current root
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

/**
 * Check if element is visible and actionable (Playwright-style)
 */
export async function isElementActionable(element: Element): Promise<boolean> {
  if (!element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  const isVisible =
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0.1;

  if (!isVisible) return false;

  // Check if it's disabled
  if (element instanceof HTMLElement) {
    if (
      element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true'
    ) {
      return false;
    }
  }

  // Stability Check: ensure it's not moving
  const getRect = () => element.getBoundingClientRect();
  const rect1 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect2 = getRect();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rect3 = getRect();

  if (
    Math.abs(rect1.top - rect2.top) > 0.5 ||
    Math.abs(rect1.left - rect2.left) > 0.5 ||
    Math.abs(rect2.top - rect3.top) > 0.5 ||
    Math.abs(rect2.left - rect3.left) > 0.5
  ) {
    return false; // Element is animating/moving
  }

  // Occlusion Check: is it covered by something else?
  const centerX = rect1.left + rect1.width / 2;
  const centerY = rect1.top + rect1.height / 2;

  // If outside viewport, we can't check occlusion with elementFromPoint accurately
  if (
    centerX < 0 ||
    centerY < 0 ||
    centerX > window.innerWidth ||
    centerY > window.innerHeight
  ) {
    return true; // Assume actionable if outside, we'll scroll later
  }

  let elAtPoint = document.elementFromPoint(centerX, centerY);

  // Pierce Shadow DOM to find the actual element at point
  while (elAtPoint && elAtPoint.shadowRoot) {
    const shadowEl = elAtPoint.shadowRoot.elementFromPoint(centerX, centerY);
    if (!shadowEl || shadowEl === elAtPoint) break;
    elAtPoint = shadowEl;
  }

  if (!elAtPoint) return true;

  // Allow if it's the element itself, a child, or an ancestor
  if (element.contains(elAtPoint) || elAtPoint.contains(element)) {
    return true;
  }

  console.log(
    `[Actionable] Occlusion check: Element at (${Math.round(centerX)}, ${Math.round(centerY)}) is blocked by:`,
    elAtPoint
  );
  return false; // Covered by something else
}

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
    className = 'extension-highlight',
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
    style.id = 'extension-styles';
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
