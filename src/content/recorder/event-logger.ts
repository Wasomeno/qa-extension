import { generateSelector, getElementInfo } from '@/utils/dom';
import { MessageType } from '@/types/messages';
import { RawEvent } from '@/types/recording';

export class EventLogger {
  private isRecording: boolean = false;
  private onEventCaptured?: (event: RawEvent) => void;
  private shadowHostId: string;

  constructor(shadowHostId: string, onEventCaptured?: (event: RawEvent) => void) {
    this.shadowHostId = shadowHostId;
    this.onEventCaptured = onEventCaptured;
    this.handleEvent = this.handleEvent.bind(this);
  }

  public start() {
    if (this.isRecording) return;
    this.isRecording = true;

    window.addEventListener('click', this.handleEvent, true);
    window.addEventListener('input', this.handleEvent, true);
    window.addEventListener('change', this.handleEvent, true);
    
    console.log('⏺️ Recorder: Event listeners attached');
  }

  public stop() {
    if (!this.isRecording) return;
    this.isRecording = false;

    window.removeEventListener('click', this.handleEvent, true);
    window.removeEventListener('input', this.handleEvent, true);
    window.removeEventListener('change', this.handleEvent, true);
    
    console.log('⏹️ Recorder: Event listeners removed');
  }

  private handleEvent(event: Event) {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    if (!target || this.isEventFromShadowDOM(target)) return;

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

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
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

  private isEventFromShadowDOM(element: HTMLElement): boolean {
    let current: Node | null = element;
    while (current) {
      if (current instanceof ShadowRoot && (current.host as HTMLElement).id === this.shadowHostId) {
        return true;
      }
      if (current instanceof HTMLElement && current.id === this.shadowHostId) {
        return true;
      }
      current = current.parentNode || (current as any).host;
    }
    return false;
  }
}
