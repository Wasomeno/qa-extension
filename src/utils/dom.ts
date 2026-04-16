/**
 * DOM manipulation utilities for the Flowg extension
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

  // Length check - too long usually means generated
  if (className.length > 40) return false;

  // Numeric-heavy check (more than 3 consecutive digits)
  if (/\d{3,}/.test(className)) return false;

  // CSS Modules pattern: Block_element_hash (e.g., LoginForm_input_7x9y2)
  if (/_[a-zA-Z0-9]+_[0-9a-z]{5,}/.test(className)) return false;

  // Framework patterns - Ant Design
  if (className.startsWith('ant-')) return false;
  if (className.startsWith('ant\\9')) return false; // Hash suffix variant

  // RC Component patterns (React Component library patterns)
  if (className.startsWith('rc-')) return false;

  // Emotion/MUI styled components
  if (className.startsWith('css-')) return false;

  // Styled Components
  if (className.startsWith('sc-')) return false;

  // Tailwind CSS with hash suffix (tailwind-7a8b9c or similar)
  if (/^tailwind-[a-f0-9]{6,}$/.test(className)) return false;
  if (/^tw-/i.test(className)) return false; // Some Tailwind prefixes

  // Material-UI (Mui-prefixed classes)
  if (className.startsWith('Mui')) return false;
  if (/Mui[A-Z][a-zA-Z]+-[a-z0-9]+/i.test(className)) return false;

  // Hash-based class patterns (e.g., #a1b2c3)
  if (/#[a-f0-9]{6,}/.test(className)) return false;

  // BEM with long hashes (Block__Element--modifier_hash)
  if (/--[a-z0-9]{6,}$/.test(className)) return false;

  // Numeric prefix (e.g., 123abc, 1Button)
  if (/^[0-9]+[a-z]/i.test(className)) return false;

  // Long numeric suffix with short prefix (e.g., row-12345678)
  if (/^[a-z]+-[0-9]{5,}$/i.test(className)) return false;

  // CSS Modules with double underscore and hash (e.g., _Button_sc__hash)
  if (/^_[A-Z][a-zA-Z]+_sc__[a-z0-9]+$/i.test(className)) return false;

  // Chakra UI patterns
  if (/^chakra-/i.test(className)) return false;

  // Bootstrap 5 hash patterns
  if (/^bs-/i.test(className) && /-[a-f0-9]{6,}$/.test(className)) return false;

  // Valid pattern: starts with letter, alphanumeric + underscore + dash
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(className);
}

function isStableId(id: string | undefined): boolean {
  if (!id) return false;

  // Pure numeric IDs (e.g., "123", "456789")
  if (/^\d+$/.test(id)) return false;

  // Framework auto-generated IDs (Ant Design, RC components)
  if (
    id.includes('rc-tabs-') ||
    id.includes('rc-menu-') ||
    id.includes('rc-select-') ||
    id.includes('rc-drawer-') ||
    id.includes('rc-modal-') ||
    id.includes('rc-dropdown-') ||
    id.includes('ant-')
  )
    return false;

  // Generic hash pattern (id-xxxxxx or id-{6+ chars})
  if (/^id-[a-zA-Z0-9]{6,}$/.test(id)) return false;

  // UUID patterns
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return false;

  // Short prefix with long numeric suffix (e.g., tab-0, item-12345)
  if (/^[a-z]+-[0-9]{4,}$/i.test(id)) return false;

  // Numeric prefix with text (e.g., 1-submit, 2-button)
  if (/^[0-9]+-[a-z]/i.test(id)) return false;

  // React/Vue generated IDs (e.g., :r1:, :r2:, $uuid)
  if (/^:r[0-9]+:$/.test(id)) return false;
  if (/^\$[a-f0-9]+$/i.test(id)) return false;

  // Element UID patterns (e.g., __u1234, uid-123456)
  if (/^__u[0-9]+$/i.test(id)) return false;
  if (/^uid-[0-9]+$/i.test(id)) return false;

  // jQuery UI patterns
  if (/^ui-id-[0-9]+$/i.test(id)) return false;

  // Angular generated patterns
  if (/^[a-z]+-[a-z]+-[a-z0-9]+$/.test(id) && /[0-9]{4,}$/.test(id)) return false;

  // DataGrid/FancyGrid generated IDs
  if (/^grid-[0-9]+$/.test(id)) return false;

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
 * Priority: normalize-space (most robust) > exact text > partial > attributes > ID
 */
export function generateXPathCandidates(element: Element): XPathCandidate[] {
  if (!element) return [];

  const candidates: XPathCandidate[] = [];
  const tagName = element.tagName.toLowerCase();

  // 1. Text-based XPath - NORMALIZE-SPACE FIRST (MOST ROBUST)
  // normalize-space() handles whitespace variations (tabs, newlines, multiple spaces)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length > 0 && textContent.length < 60) {
    const escaped = escapeXPathValue(textContent);

    // FIRST: normalize-space match (handles whitespace variations - MOST ROBUST)
    candidates.push({
      xpath: `//${tagName}[normalize-space(.)='${escaped}']`,
      type: 'text',
    });

    // SECOND: Exact match using dot (includes nested text)
    candidates.push({ xpath: `//${tagName}[.='${escaped}']`, type: 'text' });

    // THIRD: Partial match using contains with normalize-space
    if (textContent.length > 5) {
      candidates.push({
        xpath: `//${tagName}[contains(normalize-space(.), '${escapeXPathValue(textContent.substring(0, 30))}')]`,
        type: 'text',
      });
    }

    // FOURTH: Plain contains (fallback)
    if (textContent.length > 5) {
      candidates.push({
        xpath: `//${tagName}[contains(., '${escapeXPathValue(textContent.substring(0, 30))}')]`,
        type: 'text',
      });
    }
  }

  // 2. Data-testid (The "Golden" attribute) - HIGHEST PRIORITY ATTRIBUTE
  for (const attr of ['data-testid', 'data-test-id', 'data-qa', 'data-cy']) {
    const val = element.getAttribute(attr);
    if (val) {
      candidates.push({
        xpath: `//*[@${attr}='${escapeXPathValue(val)}']`,
        type: 'attribute',
      });
    }
  }

  // 3. ARIA Roles and Labels - COMBINED WITH TEXT FOR MAXIMUM RELIABILITY
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');
  if (role) {
    if (ariaLabel) {
      // Role + aria-label combination (most reliable for ARIA elements)
      candidates.push({
        xpath: `//${tagName}[@role='${role}' and @aria-label='${ariaLabel}']`,
        type: 'attribute',
      });
      candidates.push({
        xpath: `//*[@role='${role}' and @aria-label='${ariaLabel}']`,
        type: 'attribute',
      });
      // Role + normalize-space text
      if (textContent) {
        candidates.push({
          xpath: `//${tagName}[@role='${role}' and normalize-space(.)='${escapeXPathValue(textContent.substring(0, 30))}']`,
          type: 'attribute',
        });
      }
    } else {
      candidates.push({
        xpath: `//${tagName}[@role='${role}']`,
        type: 'attribute',
      });
    }
  }

  // 4. Stable attributes (name, placeholder, alt, title)
  for (const attr of ['name', 'placeholder', 'alt', 'title']) {
    const val = element.getAttribute(attr);
    if (val) {
      candidates.push({
        xpath: `//${tagName}[@${attr}='${escapeXPathValue(val)}']`,
        type: 'attribute',
      });
    }
  }

  // 5. Stable ID (only if not framework-generated)
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

  // 1. Data-test-id attributes (HIGHEST PRIORITY - Most reliable)
  const testIdAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy', 'data-test', 'data-e2e'];
  for (const attr of testIdAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push(`[${attr}='${CSS.escape(value)}']`);
      candidates.push(`${tagName}[${attr}='${CSS.escape(value)}']`);
    }
  }

  // 2. Role + Accessible Name (Playwright-style with :has-text)
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');
  const textContent = element.textContent?.trim().substring(0, 50);

  if (role) {
    // Role + aria-label (most reliable for ARIA)
    if (ariaLabel) {
      candidates.push(
        `${tagName}[role='${CSS.escape(role)}'][aria-label='${CSS.escape(ariaLabel)}']`
      );
      candidates.push(
        `[role='${CSS.escape(role)}'][aria-label='${CSS.escape(ariaLabel)}']`
      );
    }

    // Playwright-style :has-text() with role - MOST ROBUST
    if (textContent && textContent.length > 0) {
      const escapedText = escapeSelectorValue(textContent);
      candidates.push(
        `${tagName}[role='${CSS.escape(role)}']:has-text('${escapedText}')`
      );
      candidates.push(
        `[role='${CSS.escape(role)}']:has-text('${escapedText}')`
      );
      // Just role + text without tag
      candidates.push(
        `[role='${CSS.escape(role)}']:has-text('${escapedText}')`
      );
    }

    // Just role as fallback
    candidates.push(`${tagName}[role='${CSS.escape(role)}']`);
  }

  // 3. Labels (for inputs) - Playwright label targeting
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    // Direct label association
    const label = findAssociatedLabel(element);
    if (label && label.textContent) {
      const labelText = label.textContent.trim().substring(0, 50);
      const escapedLabel = escapeSelectorValue(labelText);
      // Playwright-style for labels
      candidates.push(
        `label:has-text('${escapedLabel}') + ${tagName}`
      );
      // Get label's for attribute
      const labelFor = label.getAttribute('for');
      if (labelFor) {
        candidates.push(`${tagName}#${CSS.escape(labelFor)}`);
      }
    }

    // Name attribute (form field)
    const name = element.getAttribute('name');
    if (name) {
      candidates.push(`${tagName}[name='${CSS.escape(name)}']`);
      candidates.push(`[name='${CSS.escape(name)}']`);
    }

    // Type attribute (for inputs)
    const type = element.getAttribute('type');
    if (type && !['hidden', 'file', 'image'].includes(type)) {
      candidates.push(`input[type='${CSS.escape(type)}']`);
    }
  }

  // 4. Placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    candidates.push(`${tagName}[placeholder='${CSS.escape(placeholder)}']`);
  }

  // 5. Title attribute
  const title = element.getAttribute('title');
  if (title) {
    candidates.push(`${tagName}[title='${CSS.escape(title)}']`);
  }

  // 6. Stable ID (only if not framework-generated)
  if (isStableId(element.id)) {
    candidates.push(`#${CSS.escape(element.id)}`);
  }

  // 7. Stable Classes (filtered by stability rules)
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

  // 8. Text content based (for buttons, links, menu items)
  if (textContent && textContent.length > 0 && textContent.length < 60) {
    const escapedText = escapeSelectorValue(textContent);
    // Playwright :has-text for generic elements
    candidates.push(`${tagName}:has-text('${escapedText}')`);
  }

  // 9. Limited Path (Last resort - build from parent)
  const pathSelector = generateSelector(element);
  if (pathSelector) {
    candidates.push(pathSelector);
  }

  // Deduplicate while preserving order
  return Array.from(new Set(candidates));
}

/**
 * Helper to find implicit ARIA roles based on element type and attributes
 * Comprehensive mapping based on WAI-ARIA spec
 */
function getImplicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') || '').toLowerCase();

  // Button-like
  if (tag === 'button') return 'button';
  if (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))
    return 'button';

  // Links
  if (tag === 'a' && element.hasAttribute('href')) return 'link';

  // Form inputs
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'search') return 'searchbox';
    return 'textbox';
  }

  // Text inputs
  if (tag === 'textarea') return 'textbox';

  // Select/dropdown
  if (tag === 'select') return 'listbox';

  // Navigation
  if (tag === 'nav') return 'navigation';
  if (tag === 'menu') return 'menu';
  if (tag === 'menubar') return 'menubar';

  // Lists
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') {
    // Check if inside a menu
    const parent = element.closest('nav, [role="navigation"]');
    if (!parent) return 'listitem';
    return 'menuitem';
  }

  // Tables
  if (tag === 'table') return 'table';
  if (tag === 'thead') return 'rowgroup';
  if (tag === 'tbody') return 'rowgroup';
  if (tag === 'tr') return 'row';
  if (tag === 'th') return 'columnheader';
  if (tag === 'td') return 'cell';

  // Dialogs
  if (tag === 'dialog') return 'dialog';
  if (tag === 'article') return 'article';
  if (tag === 'main') return 'main';
  if (tag === 'aside') return 'complementary';
  if (tag === 'section') return 'region';
  if (tag === 'header') return 'banner';
  if (tag === 'footer') return 'contentinfo';

  // Heading
  if (/^h[1-6]$/.test(tag)) {
    const level = tag.charAt(1);
    return `heading`;
  }

  // Images
  if (tag === 'img') {
    const alt = element.getAttribute('alt');
    return alt === '' ? 'presentation' : 'img';
  }

  // Others
  if (tag === 'form') return 'form';
  if (tag === 'figure') return 'figure';
  if (tag === 'time') return 'time';

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
 * Enhanced to capture comprehensive data for AI processing
 */
export function getElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();
  const attributes: Record<string, string> = {};

  // Collect ALL relevant attributes for AI context
  for (const attr of element.attributes) {
    const name = attr.name;
    const value = attr.value;
    
    // Include data-*, aria-*, and common stable attributes
    if (
      name === 'id' ||
      name === 'class' ||
      name === 'name' ||
      name === 'type' ||
      name === 'role' ||
      name === 'for' ||
      name === 'value' ||
      name === 'tabindex' ||
      name === 'disabled' ||
      name === 'checked' ||
      name === 'selected' ||
      name.startsWith('data-') ||
      name.startsWith('aria-')
    ) {
      attributes[name] = value;
    }
  }

  // Collect comprehensive parent info for deep tracking
  const parent = element.parentElement;
  const grandparent = parent?.parentElement;
  let parentInfo: ElementInfo['parentInfo'];
  let structuralInfo: ElementInfo['structuralInfo'];

  if (parent) {
    const parentAttributes: Record<string, string> = {};
    for (const attr of parent.attributes) {
      // Include all identifying attributes
      if (
        [
          'id',
          'class',
          'data-testid',
          'data-test-id',
          'data-qa',
          'data-cy',
          'name',
          'role',
          'aria-label',
          'aria-labelledby',
          'type',
        ].includes(attr.name)
      ) {
        parentAttributes[attr.name] = attr.value;
      }
    }

    // Get parent's parent for deeper context
    let grandparentInfo: ElementInfo['parentInfo'];
    if (grandparent) {
      const gpAttributes: Record<string, string> = {};
      for (const attr of grandparent.attributes) {
        if (
          ['id', 'class', 'data-testid', 'data-test-id', 'name', 'role'].includes(attr.name)
        ) {
          gpAttributes[attr.name] = attr.value;
        }
      }
      grandparentInfo = {
        tagName: grandparent.tagName.toLowerCase(),
        id: grandparent.id || undefined,
        selector: grandparent.id ? `#${CSS.escape(grandparent.id)}` : undefined,
        attributes: Object.keys(gpAttributes).length > 0 ? gpAttributes : undefined,
      };
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

  // Generate comprehensive XPath candidates
  const xpathCandidates = generateXPathCandidates(element);
  const role = element.getAttribute('role') || getImplicitRole(element);
  const ariaLabel =
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby');

  // Build stable attributes map with role and aria-label
  const stableAttributes: Record<string, string> = {
    ...attributes,
  };
  if (role && !stableAttributes['role']) {
    stableAttributes['role'] = role;
  }
  if (ariaLabel && !stableAttributes['aria-label']) {
    stableAttributes['aria-label'] = ariaLabel;
  }

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: generateSelector(element),
    selectorCandidates: generateSelectorCandidates(element),
    xpath: xpathCandidates[0]?.xpath || generateXPath(element),
    xpathCandidates: xpathCandidates.map(c => c.xpath),
    textContent: element.textContent?.trim().substring(0, 100) || undefined,
    attributes: stableAttributes,
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

  // Track if this highlight should still be visible
  let shouldKeepHighlight = true;

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      if (shouldKeepHighlight) {
        removeHighlight();
      }
    }, duration);
  }

  // Watch for the element being removed from DOM (e.g., modal closes, element vanishes)
  // If the element is no longer connected, remove the highlight
  if (!element.isConnected) {
    shouldKeepHighlight = false;
    removeHighlight();
    return;
  }

  // Use MutationObserver to detect when the element is disconnected from DOM
  const observer = new MutationObserver((mutations) => {
    // Check if element is still connected to DOM
    if (!element.isConnected) {
      shouldKeepHighlight = false;
      observer.disconnect();
      removeHighlight();
    }
  });

  // Observe the element itself for removal from DOM
  // Start from the element's parent (or body if no parent)
  const observeRoot = element.parentElement || document.body;
  observer.observe(observeRoot, {
    childList: true,
    subtree: true
  });

  // Also do periodic checks as a fallback (in case MutationObserver misses something)
  const checkInterval = setInterval(() => {
    if (!element.isConnected || !shouldKeepHighlight) {
      clearInterval(checkInterval);
      observer.disconnect();
      removeHighlight();
    }
  }, 500);

  // Clean up the interval when the highlight is manually removed
  const originalRemoveHighlight = removeHighlight;
  // We can't easily hook into removeHighlight, so the checkInterval will auto-clean
}

/**
 * Remove element highlight
 */
export function removeHighlight(): void {
  // Use consistent class name to match highlightElement's default
  const highlights = document.querySelectorAll('.extension-highlight');
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

// ============================================================================
// ADVANCED ELEMENT RESOLUTION (For AI Execution Fallback)
// ============================================================================

export interface ElementResolutionContext {
  tagName?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  parentInfo?: {
    tagName?: string;
    id?: string;
    selector?: string;
    attributes?: Record<string, string>;
  };
  structuralInfo?: {
    depth?: number;
    siblingIndex?: number;
    totalSiblings?: number;
  };
}

/**
 * Find element using comprehensive context hints
 * This is the "agent_resolve" fallback strategy
 */
export function findElementByContext(
  context: ElementResolutionContext,
  root: Document = document
): Element | null {
  const { tagName, textContent, attributes, parentInfo, structuralInfo } = context;

  // Strategy 1: Try data-testid if provided
  if (attributes) {
    for (const attr of ['data-testid', 'data-test-id', 'data-qa', 'data-cy']) {
      if (attributes[attr]) {
        const found = root.querySelector(`[${attr}="${CSS.escape(attributes[attr])}"]`);
        if (found) return found;
      }
    }
  }

  // Strategy 2: Try ID if provided (Document only)
  if (attributes?.id && root instanceof Document) {
    const found = root.getElementById(attributes.id);
    if (found) return found;
  }

  // Strategy 3: Try role + text combination (Playwright-style)
  if (attributes?.role && textContent) {
    const selector = `[role='${CSS.escape(attributes.role)}']:has-text('${CSS.escape(textContent.substring(0, 30))}')`;
    const results = root.querySelectorAll(selector);
    if (results.length === 1) return results[0];
    if (results.length > 1) {
      // Use structural info to narrow down
      if (structuralInfo?.siblingIndex) {
        const allWithRole = root.querySelectorAll(`[role='${CSS.escape(attributes.role)}']`);
        if (allWithRole[structuralInfo.siblingIndex - 1]) {
          return allWithRole[structuralInfo.siblingIndex - 1];
        }
      }
      return results[0]; // Return first as fallback
    }
  }

  // Strategy 4: Try XPath with normalize-space text
  if (textContent && tagName) {
    const escaped = textContent.replace(/'/g, '&apos;');
    const xpath = `//${tagName}[normalize-space(.)='${escaped}']`;
    const found = findByXPath(xpath);
    if (found) return found;
  }

  // Strategy 5: Try just text content
  if (textContent) {
    const escaped = textContent.replace(/'/g, '&apos;');
    const xpath = `//*[normalize-space(.)='${escaped}']`;
    const found = findByXPath(xpath);
    if (found) return found;
  }

  // Strategy 6: Try role alone
  if (attributes?.role) {
    const found = root.querySelector(`[role='${CSS.escape(attributes.role)}']`);
    if (found) return found;
  }

  // Strategy 7: Try parent-based resolution
  if (parentInfo?.id && root instanceof Document) {
    const parent = root.getElementById(parentInfo.id);
    if (parent) {
      if (tagName) {
        const child = parent.querySelector(tagName);
        if (child) return child;
      }
      return parent.children[0] || null;
    }
  }

  return null;
}

/**
 * Find all elements matching a role
 */
export function findElementsByRole(role: string): Element[] {
  return Array.from(document.querySelectorAll(`[role='${CSS.escape(role)}']`));
}

/**
 * Find element by text content within a container
 */
export function findByText(
  text: string,
  container: Element | Document = document,
  exactMatch: boolean = true
): Element | null {
  const escaped = text.replace(/'/g, '&apos;');
  const xpath = exactMatch
    ? `.//*[normalize-space(.)='${escaped}']`
    : `.//*[contains(normalize-space(.), '${escaped}')]`;

  return document.evaluate(xpath, container, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
    .singleNodeValue as Element | null;
}

/**
 * Get element path for debugging/logging
 */
export function getElementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break; // ID is unique, stop here
    }
    
    const siblings = Array.from(current.parentElement?.children || [])
      .filter(c => c.tagName === current!.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      part += `:nth-child(${index})`;
    }
    
    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

/**
 * Extract all meaningful text from element (including nested)
 */
export function getFullTextContent(element: Element): string {
  return Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Check if element has visible text content
 */
export function hasVisibleText(element: Element): boolean {
  const text = getFullTextContent(element);
  return text.length > 0 && text.trim().length > 0;
}
