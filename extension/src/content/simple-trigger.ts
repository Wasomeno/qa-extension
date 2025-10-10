import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingTrigger from '@/components/floating-trigger';
import { MessageType } from '@/types/messages';
import { getViewportInfo, getInteractiveElements } from '@/utils/dom';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import { createIframeHost } from '@/utils/iframe-host';

class SimpleTrigger {
  private floatingTriggerContainer: HTMLDivElement | null = null;
  private floatingTriggerRoot: any = null;
  private isActive = false;
  private shadowDOMInstance: any = null;
  private iframeHost: any = null;
  private keepalivePort: chrome.runtime.Port | null = null;

  constructor() {
    this.setupMessageListener();
    this.setupKeyboardShortcuts();
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

  // Removed console event relay as recording feature is no longer supported

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

      // Recording-related messages are no longer supported
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
    if (this.shadowDOMInstance || this.iframeHost) {
      return;
    }

    try {
      // Load CSS bundle (used by both shadow and iframe host)
      const css = await loadShadowDOMCSS();

      // Hosting strategy: default to Shadow DOM for reliability.
      // You can force iframe mode by setting localStorage.QA_USE_IFRAME_HOST = '1'.
      const useIframe = (() => {
        try {
          return localStorage.getItem('QA_USE_IFRAME_HOST') === '1';
        } catch { return false; }
      })();

      // NOTE: Avoid injecting global portal styles into the page to
      // prevent leaking Tailwind utilities into the host site.
      // Our components pass a portal container inside the shadow root,
      // so no global CSS injection is necessary.

      if (useIframe) {
        console.log('QA Extension: Using iframe host for floating trigger');
        // Create isolated iframe host
        this.iframeHost = createIframeHost({ id: 'qa-floating-trigger-iframe', css });
        // In iframe, allow interactivity at root container
        this.iframeHost.container.style.pointerEvents = 'none';
        // Create a child mount node that can receive pointer events
        const mount = this.iframeHost.document.createElement('div');
        mount.style.pointerEvents = 'auto';
        this.iframeHost.container.appendChild(mount);

        // Mark wrapper for styles
        try { mount.classList.add('qa-floating-trigger'); } catch {}

        this.floatingTriggerContainer = mount as any;
        this.floatingTriggerRoot = createRoot(mount);
      } else {
        console.log('QA Extension: Using Shadow DOM host for floating trigger');
        // Create Shadow DOM instance
        this.shadowDOMInstance = shadowDOMManager.create({
          hostId: 'qa-floating-trigger-root',
          shadowMode: 'closed',
          css,
          isolateEvents: true,
          // Do not copy host page CSS variables into shadow root for stricter isolation
          applyTokensFromDocument: false,
        });

        // Store container reference and mark wrapper for styles
        this.floatingTriggerContainer = this.shadowDOMInstance.container;
        try {
          this.floatingTriggerContainer?.classList.add('qa-floating-trigger');
        } catch {}

        // Create React root and render
        this.floatingTriggerRoot = createRoot(this.shadowDOMInstance.container);
      }
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

    if (this.iframeHost) {
      try { this.iframeHost.destroy(); } catch {}
      this.iframeHost = null;
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
