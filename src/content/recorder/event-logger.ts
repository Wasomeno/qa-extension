import { getElementInfo } from '@/utils/dom';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

export class EventLogger {
  private isRecording: boolean = false;
  private onEventCaptured?: (event: RawEvent) => void;
  private shadowHostId: string;
  private eventCount: number = 0;
  private capturedEvents: RawEvent[] = [];

  constructor(
    shadowHostId: string,
    onEventCaptured?: (event: RawEvent) => void
  ) {
    this.shadowHostId = shadowHostId;
    this.onEventCaptured = onEventCaptured;
    this.handleEvent = this.handleEvent.bind(this);
  }

  public start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.eventCount = 0;
    this.capturedEvents = [];
    

    window.addEventListener('click', this.handleEvent, true);
    window.addEventListener('input', this.handleEvent, true);
    window.addEventListener('change', this.handleEvent, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    
    
  }

  public stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    

    window.removeEventListener('click', this.handleEvent, true);
    window.removeEventListener('input', this.handleEvent, true);
    window.removeEventListener('change', this.handleEvent, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
  }

  private handleKeyDown(event: KeyboardEvent) {
    // Capture Tab/Enter for navigation awareness
    if (!this.isRecording) return;
    
    if (event.key === 'Tab' || event.key === 'Enter') {
      
    }
  }

  private handleEvent(event: Event) {
    if (!this.isRecording) return;

    const rawTarget = event.target as HTMLElement;
    
    // Debug logging for all captured events
    const targetClass = typeof rawTarget?.className === 'string' ? rawTarget.className.substring(0, 50) : String(rawTarget?.className);
    

    // Check if this is from our extension's iframe
    if (this.isEventFromShadowDOM(rawTarget)) {
      
      return;
    }

    // Get the semantic target element
    const target = this.getActionableTarget(rawTarget, event.type);
    if (!target) {
      
      return;
    }

    const textContent = target.textContent?.trim();
    const displayText = typeof textContent === 'string' ? textContent.substring(0, 50) : String(textContent);
    

    this.eventCount++;

    const elementInfo = getElementInfo(target);
    
    // Debug: Log xpath generation status
    

    const interactionEvent: RawEvent = {
      type: event.type as any,
      timestamp: Date.now(),
      element: elementInfo,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      isTrusted: event.isTrusted,
    };

    // Capture input values
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      interactionEvent.value = target.value;
    }

    // Also capture for contenteditable
    if (target.getAttribute('contenteditable') === 'true') {
      interactionEvent.value = target.textContent || '';
    }

    // Store locally for retrieval on stop
    this.capturedEvents.push(interactionEvent);

    // Local callback
    if (this.onEventCaptured) {
      this.onEventCaptured(interactionEvent);
    }

    // Send to background
    chrome.runtime.sendMessage({
      type: MessageType.TRACK_INTERACTION,
      data: interactionEvent,
    }).then(() => {
      
    }).catch((err) => {
      console.error(`[EventLogger] Failed to send event to background:`, err);
    });
  }

  public getEvents(): RawEvent[] {
    return [...this.capturedEvents];
  }

  private getActionableTarget(
    target: HTMLElement | null,
    eventType: string
  ): HTMLElement | null {
    if (!target) return null;

    // For input/change events, immediately return the form element
    if (eventType === 'input' || eventType === 'change') {
      const formElement = target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
      ) as HTMLElement;
      return formElement || target;
    }

    // Extended interactive selectors list (matching Playwright CRX reference)
    const interactiveSelectors = [
      // Native interactive elements
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'input[type="hidden"]',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable=""]',

      // ARIA interactive roles
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="tab"]',
      '[role="tablist"]',
      '[role="tabpanel"]',
      '[role="option"]',
      '[role="listbox"]',
      '[role="combobox"]',
      '[role="gridcell"]',
      '[role="row"]',
      '[role="cell"]',
      '[role="treeitem"]',
      '[role="treegrid"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="slider"]',
      '[role="spinbutton"]',
      '[role="textbox"]',
      '[role="searchbox"]',
      '[role="listbox"]',
      '[role="tree"]',
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[role="menu"]',
      '[role="menubar"]',
      '[role="tooltip"]',
      '[role="application"]',

      // Test data attributes
      '[data-testid]',
      '[data-test-id]',
      '[data-qa]',
      '[data-cy]',
      '[data-test]',
      '[data-e2e]',

      // Labels and titles
      'label',
      'td[title]',
      'th[title]',

      // Draggable elements
      '[draggable="true"]',

      // Custom clickable patterns
      '[onclick]',
      '[oncontextmenu]',
      '[ondblclick]',
      '[onmousedown]',

      // Common class patterns
      '.btn',
      '.button',
      '.btn-primary',
      '.btn-secondary',
      '.btn-sm',
      '.btn-lg',
      '.btn-block',
      '.btn-close',
    ].join(', ');

    let current: HTMLElement | null = target;

    while (current && current !== document.body) {
      if (current.matches(interactiveSelectors)) {
        return current;
      }
      current = current.parentElement;
    }

    // Fallback: return original target if no semantic element found
    return target;
  }

  private isEventFromShadowDOM(element: HTMLElement): boolean {
    let current: Node | null = element;
    let depth = 0;
    const maxDepth = 20; // Prevent infinite loops
    
    while (current && depth < maxDepth) {
      if (current instanceof HTMLElement) {
        // Check if this is our extension's iframe
        if (current.id === this.shadowHostId) {
          return true;
        }
        
        // Also check by checking if we're inside an iframe with qa-recorder-iframe
        if (current.tagName === 'IFRAME' && current.id === this.shadowHostId) {
          return true;
        }
      }
      current = current.parentNode;
      // Handle shadow DOM
      if (!current && element instanceof Element) {
        const shadowRoot = (element as any).getRootNode?.();
        if (shadowRoot instanceof ShadowRoot) {
          current = shadowRoot.host;
        }
      }
      depth++;
    }
    return false;
  }

  public getEventCount(): number {
    return this.eventCount;
  }

  public isActive(): boolean {
    return this.isRecording;
  }
}
