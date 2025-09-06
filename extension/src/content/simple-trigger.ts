import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingTrigger from '@/components/floating-trigger';
import { MessageType } from '@/types/messages';
import { getViewportInfo, getInteractiveElements } from '@/utils/dom';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import rrwebRecorder from '@/services/rrweb-recorder';

class SimpleTrigger {
  private floatingTriggerContainer: HTMLDivElement | null = null;
  private floatingTriggerRoot: any = null;
  private isActive = false;
  private shadowDOMInstance: any = null;
  private keepalivePort: chrome.runtime.Port | null = null;

  constructor() {
    this.setupMessageListener();
    this.setupKeyboardShortcuts();
    this.setupConsoleEventRelay();
    this.ensureKeepalive();

    // Auto-activate on allowed domains
    if (this.shouldShowFloatingTrigger()) {
      setTimeout(() => {
        this.activate();
      }, 1000);
    }
  }

  private ensureKeepalive(): void {
    try {
      const connect = () => {
        try {
          this.keepalivePort = chrome.runtime.connect({ name: 'keepalive' });
          this.keepalivePort.onDisconnect.addListener(() => {
            // Attempt to reconnect after a short delay
            setTimeout(connect, 500);
          });
        } catch {
          setTimeout(connect, 1000);
        }
      };
      connect();
    } catch {}
  }

  private setupConsoleEventRelay(): void {
    // Listen for page-level console events posted by injected script
    window.addEventListener('message', (event: MessageEvent) => {
      try {
        const data: any = (event as any).data;
        if (!data || !data.__qa_cc) return;
        if (data.type === 'QA_CC_CONSOLE_EVENT') {
          // Forward into rrweb as a custom event when recording
          try {
            rrwebRecorder.emitCustomEvent('console', {
              level: data.level,
              args: data.args,
              ts: data.ts,
              kind: data.kind,
              url: window.location.href,
            });
          } catch {}
          return;
        }
        if (data.type === 'QA_CC_NETWORK_EVENT') {
          // Forward to background for persistence
          try {
            const sessionId = rrwebRecorder.currentMeta?.id;
            if (!sessionId) return;
            chrome.runtime.sendMessage({
              type: MessageType.TRACK_NETWORK_EVENT,
              data: { sessionId, event: {
                kind: data.kind,
                phase: data.phase,
                method: data.method,
                url: data.url,
                status: data.status,
                error: data.error,
                ts: data.ts,
                duration: data.duration,
              }},
            }, () => { void chrome.runtime.lastError; });
          } catch {}
          return;
        }
      } catch {}
    });
  }

  private shouldShowFloatingTrigger(): boolean {
    // Show on all non-internal pages; actual injection guard exists in injectFloatingTrigger
    const href = window.location.href;
    if (href.startsWith('chrome://') || href.startsWith('chrome-extension://')) return false;
    return true;
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', e => {
      // Ctrl+Shift+Q to toggle floating trigger
      if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        this.activate();
      }
    });
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === MessageType.TOGGLE_FLOATING_TRIGGER) {
        this.activate().then(() => {
          sendResponse({
            success: true,
            data: { enabled: !!this.floatingTriggerContainer },
          });
        });
        return true;
      }

      if (message.type === MessageType.CREATE_ISSUE_FROM_CONTEXT) {
        this.handleCreateIssueFromContext(message.data).then(result => {
          sendResponse(result);
        });
        return true;
      }

      // Handle PING messages for connectivity checking
      if (message.type === 'PING') {
        sendResponse({ success: true, data: 'PONG' });
        return true;
      }

      if (message.type === MessageType.START_RECORDING) {
        rrwebRecorder
          .start()
          .then(meta => {
            sendResponse({ success: true, data: { meta } });
          })
          .catch(err => {
            sendResponse({ success: false, error: err?.message || 'Failed to start recording' });
          });
        return true;
      }

      if (message.type === MessageType.STOP_RECORDING) {
        rrwebRecorder
          .stop({ persist: true })
          .then(payload => {
            sendResponse({ success: true, data: { meta: payload?.id ? { ...payload, events: undefined } : null, id: payload?.id } });
          })
          .catch(err => {
            sendResponse({ success: false, error: err?.message || 'Failed to stop recording' });
          });
        return true;
      }

      if ((message.type as any) === 'GET_RECORDING_STATUS') {
        const meta = rrwebRecorder.currentMeta;
        sendResponse({ success: true, data: { isRecording: rrwebRecorder.isRecording, meta } });
        return true;
      }
    });
  }

  private async handleCreateIssueFromContext(
    data?: any
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Collect page context information
      const pageContext = {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
        viewport: getViewportInfo(),
        interactiveElements: getInteractiveElements(),
        contextData: data || {},
      };

      // Activate the floating trigger to show issue creator
      await this.activate();

      return {
        success: true,
        data: pageContext,
      };
    } catch (error) {
      console.error('Failed to create issue from context:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create issue context',
      };
    }
  }

  private async activate(): Promise<void> {
    if (!this.isActive) {
      this.isActive = true;
      await this.injectFloatingTrigger();
    }
  }

  private async injectFloatingTrigger(): Promise<void> {
    // Don't inject on extension pages
    if (
      window.location.href.startsWith('chrome://') ||
      window.location.href.startsWith('chrome-extension://')
    ) {
      return;
    }

    // Check if already injected
    if (this.shadowDOMInstance) {
      return;
    }

    try {
      // Load CSS for shadow DOM
      const css = await loadShadowDOMCSS();

      // NOTE: Avoid injecting global portal styles into the page to
      // prevent leaking Tailwind utilities into the host site.
      // Our components pass a portal container inside the shadow root,
      // so no global CSS injection is necessary.

      // Create Shadow DOM instance
      this.shadowDOMInstance = shadowDOMManager.create({
        hostId: 'qa-floating-trigger-root',
        shadowMode: 'closed',
        css,
        isolateEvents: true,
      });

      // Store container reference for compatibility and mark wrapper for styles
      this.floatingTriggerContainer = this.shadowDOMInstance.container;
      try {
        this.floatingTriggerContainer?.classList.add('qa-floating-trigger');
      } catch {}

      // Create React root and render
      this.floatingTriggerRoot = createRoot(this.shadowDOMInstance.container);
      this.floatingTriggerRoot.render(
        React.createElement(FloatingTrigger, {
          onClose: () => this.removeFloatingTrigger(),
        })
      );

      console.log('QA Extension: Floating trigger injected successfully');
    } catch (error) {
      console.error('QA Extension: Failed to inject floating trigger:', error);
    }
  }

  private removeFloatingTrigger(): void {
    if (this.floatingTriggerRoot) {
      this.floatingTriggerRoot.unmount();
      this.floatingTriggerRoot = null;
    }

    if (this.shadowDOMInstance) {
      this.shadowDOMInstance.destroy();
      this.shadowDOMInstance = null;
    }

    this.floatingTriggerContainer = null;
  }

  destroy(): void {
    this.removeFloatingTrigger();
    shadowDOMManager.destroyAll();
  }
}

// Initialize
if (!(window as any).__QA_EXTENSION_INITIALIZED__) {
  const simpleTrigger = new SimpleTrigger();
  (window as any).__QA_EXTENSION_INITIALIZED__ = true;

  window.addEventListener('beforeunload', () => {
    simpleTrigger.destroy();
  });

  console.log('QA Extension: Simple trigger initialized');
}
