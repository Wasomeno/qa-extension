/**
 * DOM manipulation utilities for the Gitlab Companion extension
 */

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  selector: string;
  textContent?: string;
  attributes?: Record<string, string>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

/**
 * Generate a unique CSS selector for an element
 */
export function generateSelector(element: Element): string {
  if (!element || element === document.body) {
    return 'body';
  }

  // Use ID if available and unique
  if (element.id) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) {
      return idSelector;
    }
  }

  // Build path from element to root
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    // Add ID if available
    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
    }
    
    // Add classes if available
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(Boolean);
      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }
    
    // Add nth-child if needed for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        sibling => sibling.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * Get detailed information about an element
 */
export function getElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();
  const attributes: Record<string, string> = {};
  
  // Collect relevant attributes
  for (const attr of element.attributes) {
    if (['id', 'class', 'data-*', 'name', 'type', 'role', 'aria-*'].some(pattern => 
      attr.name === pattern || attr.name.startsWith(pattern.replace('*', ''))
    )) {
      attributes[attr.name] = attr.value;
    }
  }

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: generateSelector(element),
    textContent: element.textContent?.trim().substring(0, 100) || undefined,
    attributes,
    position: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY
    },
    size: {
      width: rect.width,
      height: rect.height
    }
  };
}

/**
 * Find element by selector with fallback strategies
 */
export function findElement(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn('Invalid selector:', selector, error);
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

/**
 * Highlight an element with visual overlay
 */
export function highlightElement(element: Element, options: {
  color?: string;
  duration?: number;
  className?: string;
} = {}): void {
  const {
    color = '#ff6b6b',
    duration = 2000,
    className = 'qa-extension-highlight'
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
    devicePixelRatio: window.devicePixelRatio
  };
}

/**
 * Scroll element into view with smooth animation
 */
export function scrollToElement(element: Element, options: ScrollIntoViewOptions = {}): void {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
    ...options
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
    '.clickable'
  ];

  const elements = document.querySelectorAll(selectors.join(', '));
  return Array.from(elements).filter(isElementVisible);
}

/**
 * Wait for element to appear in DOM
 */
export function waitForElement(
  selector: string,
  timeout: number = 5000
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
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
      view: window
    });
    element.dispatchEvent(event);
  });
}

/**
 * Get element's computed style properties
 */
export function getElementStyles(element: Element, properties: string[]): Record<string, string> {
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
    hasAriaLabel: !!element.getAttribute('aria-label') || !!element.getAttribute('aria-labelledby'),
    hasProperContrast: true, // Would need color analysis
    isFocusable: element.hasAttribute('tabindex') || 
      ['a', 'button', 'input', 'select', 'textarea'].includes(tagName)
  };
}