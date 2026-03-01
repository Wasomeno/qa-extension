import { getElementInfo } from '@/utils/dom';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

export class EventLogger {
  private isRecording: boolean = false;
  private onEventCaptured?: (event: RawEvent) => void;
  private shadowHostId: string;

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
    console.log(
      `[EventLogger] Started listening for interactions in frame: ${window.location.href}`
    );

    window.addEventListener('click', this.handleEvent, true);
    window.addEventListener('input', this.handleEvent, true);
    window.addEventListener('change', this.handleEvent, true);
  }

  public stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    console.log(
      `[EventLogger] Stopped listening for interactions in frame: ${window.location.href}`
    );

    window.removeEventListener('click', this.handleEvent, true);
    window.removeEventListener('input', this.handleEvent, true);
    window.removeEventListener('change', this.handleEvent, true);
  }

  private handleEvent(event: Event) {
    if (!this.isRecording) return;

    const rawTarget = event.target as HTMLElement;
    const target = this.getActionableTarget(rawTarget, event.type);
    if (!target || this.isEventFromShadowDOM(target)) return;

    console.log(
      `[EventLogger] Captured ${event.type} on ${target.tagName.toLowerCase()}`
    );

    const interactionEvent: RawEvent = {
      type: event.type as any,
      timestamp: Date.now(),
      element: getElementInfo(target),
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      isTrusted: event.isTrusted,
    };

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      interactionEvent.value = target.value;
    }

    if (this.onEventCaptured) {
      this.onEventCaptured(interactionEvent);
    }

    chrome.runtime.sendMessage({
      type: MessageType.TRACK_INTERACTION,
      data: interactionEvent,
    });
  }

  private getActionableTarget(
    target: HTMLElement | null,
    eventType: string
  ): HTMLElement | null {
    if (!target) return null;

    if (eventType === 'input' || eventType === 'change') {
      return (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
        ) || target
      ) as HTMLElement;
    }

    // Traverse up to find semantic interactive element to avoid capturing SVGs/spans inside buttons
    let current: HTMLElement | null = target;
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'textarea', 'select', 
      '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
      '[role="option"]', '[role="gridcell"]', '[role="treeitem"]',
      'label', '[data-testid]', '[data-test-id]', '[data-qa]', '[data-cy]',
      'td[title]' // Common for datepickers like Ant Design
    ].join(', ');

    while (current && current !== document.body) {
      if (current.matches(interactiveSelectors)) {
        return current;
      }
      current = current.parentElement;
    }

    return target;
  }

  private isEventFromShadowDOM(element: HTMLElement): boolean {
    let current: Node | null = element;
    while (current) {
      if (current instanceof HTMLElement && current.id === this.shadowHostId) {
        return true;
      }
      current = current.parentNode || (current as any).host;
    }
    return false;
  }
}
