import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingTrigger from '@/components/floating-trigger';
import { MessageType } from '@/types/messages';
import { getViewportInfo, getInteractiveElements } from '@/utils/dom';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import { createIframeHost } from '@/utils/iframe-host';
import { storageService } from '@/services/storage';
import { isUrlWhitelisted } from '@/utils/domain-matcher';

class SimpleTrigger {
  private floatingTriggerContainer: HTMLDivElement | null = null;
  private floatingTriggerRoot: any = null;
  private isActive = false;
  private shadowDOMInstance: any = null;
  private iframeHost: any = null;
  private keepalivePort: chrome.runtime.Port | null = null;
  private hiddenReason: 'auto' | 'manual' | null = null;
  private screenshotHideTimeout: number | null = null;
  private readonly SCREENSHOT_RESTORE_DELAY = 7000;
  private screenshotShortcutHandler = (event: KeyboardEvent) => {
    // On Mac, detect Shift+Command combination to make popup nearly invisible
    const platform =
      typeof navigator !== 'undefined'
        ? (navigator.platform || navigator.userAgent || '').toLowerCase()
        : '';
    const isMac = /mac|darwin/.test(platform);

    if (
      isMac &&
      event.metaKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      // Only trigger if it's a modifier key itself (not another key with modifiers)
      const isModifierOnly = event.key === 'Meta' || event.key === 'Shift';
      if (isModifierOnly) {
        console.log(
          'QA Extension: Cmd+Shift detected, making popup nearly invisible'
        );
        void this.setFloatingTriggerOpacity(0.1);
        return;
      }
    }

    if (this.isNativeScreenshotShortcut(event)) {
      this.handleNativeScreenshot();
    }
  };
  private screenshotListenersAttached = false;

  constructor() {
    this.setupMessageListener();
    this.setupKeyboardShortcuts();
    this.registerScreenshotShortcutListener();
    this.ensureKeepalive();

    // Auto-activate on allowed domains (check whitelist)
    this.checkWhitelistAndActivate();

    // Listen for whitelist changes
    storageService.onChanged('settings', () => {
      this.checkWhitelistAndActivate();
    });
  }

  private async checkWhitelistAndActivate(): Promise<void> {
    if (!this.shouldShowFloatingTrigger()) {
      return;
    }

    try {
      const settings = await storageService.getSettings();
      const whitelistedDomains =
        settings.floatingTrigger.whitelistedDomains || [];
      const currentUrl = window.location.href;

      if (isUrlWhitelisted(currentUrl, whitelistedDomains)) {
        console.log(
          'QA Extension: URL is whitelisted, activating floating trigger'
        );
        setTimeout(() => {
          this.activate();
        }, 1000);
      } else {
        console.log('QA Extension: URL not whitelisted, skipping activation');
        // Deactivate if currently active
        this.removeFloatingTrigger();
      }
    } catch (error) {
      console.warn(
        'QA Extension: Failed to check whitelist, skipping activation',
        error
      );
      // On error, do NOT activate - fail safely by not showing the trigger
      this.removeFloatingTrigger();
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
    if (href.startsWith('chrome://') || href.startsWith('chrome-extension://'))
      return false;
    return true;
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', e => {
      // Ctrl+Shift+Q to toggle floating trigger
      if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        void this.handleToggleShortcut();
      }

      // Cmd+Shift+H to hide for screenshot (Mac)
      // Ctrl+Shift+H to hide for screenshot (Windows/Linux)
      if (
        e.shiftKey &&
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'H' || e.key === 'h')
      ) {
        e.preventDefault();
        console.log('QA Extension: Manual screenshot hide triggered');
        void this.handleNativeScreenshot();
      }
    });
  }

  private registerScreenshotShortcutListener(): void {
    if (this.screenshotListenersAttached) return;
    try {
      // Use capture phase (true) to catch events before they might be stopped
      window.addEventListener('keydown', this.screenshotShortcutHandler, {
        capture: true,
        passive: true,
      });
      document.addEventListener('keydown', this.screenshotShortcutHandler, {
        capture: true,
        passive: true,
      });
      this.screenshotListenersAttached = true;
      console.log('QA Extension: Screenshot shortcut listener registered');
    } catch (error) {
      console.warn('QA Extension: Failed to attach screenshot listener', error);
    }
  }

  private async handleToggleShortcut(): Promise<void> {
    try {
      // If manually hidden, show it again
      if (this.hiddenReason === 'manual') {
        await this.setFloatingTriggerVisibility(true, 'manual');
        return;
      }

      if (this.floatingTriggerContainer) {
        // Toggle off manually
        await this.setFloatingTriggerVisibility(false, 'manual');
      } else {
        await this.activate();
      }
    } catch (error) {
      console.warn('QA Extension: Toggle shortcut failed', error);
    }
  }

  private isNativeScreenshotShortcut(event: KeyboardEvent): boolean {
    try {
      const key = event.key || '';
      const lower = key.toLowerCase();
      const platform =
        typeof navigator !== 'undefined'
          ? (navigator.platform || navigator.userAgent || '').toLowerCase()
          : '';
      const isMac = /mac|darwin/.test(platform);

      if (isMac) {
        // Mac screenshot shortcuts: Cmd+Shift+3/4/5
        // Check both key and code for better compatibility

        if (event.metaKey && event.shiftKey) {
          return true;
        }
        return false;
      }

      // Windows/Linux screenshot shortcuts
      if (key === 'PrintScreen') return true;
      if (event.metaKey && event.shiftKey && lower === 's') return true;
      if (event.ctrlKey && event.shiftKey && lower === 's') return true;
      return false;
    } catch {
      return false;
    }
  }

  private async setFloatingTriggerOpacity(opacity: number): Promise<void> {
    try {
      const hostWindow = this.getHostWindow();
      hostWindow.dispatchEvent(
        new CustomEvent('qa-floating-trigger-opacity', {
          detail: { opacity },
        })
      );
      console.log(`QA Extension: Set popup opacity to ${opacity}`);
    } catch (error) {
      console.warn('QA Extension: Failed to set popup opacity', error);
    }
  }

  private handleNativeScreenshot(): void {
    console.log(
      'QA Extension: Handling native screenshot - hiding floating trigger'
    );
    if (this.hiddenReason === 'manual') {
      console.log('QA Extension: Skipping auto-hide due to manual hide state');
      return;
    }
    void this.setFloatingTriggerVisibility(false, 'auto')
      .then(success => {
        if (success) {
          console.log(
            'QA Extension: Successfully hid floating trigger, scheduling restore'
          );
          this.scheduleScreenshotRestore();
        } else {
          console.log('QA Extension: Failed to hide floating trigger');
        }
      })
      .catch(error => {
        console.warn(
          'QA Extension: Failed to hide floating trigger for screenshot',
          error
        );
      });
  }

  private scheduleScreenshotRestore(): void {
    this.clearScreenshotHideTimeout();
    try {
      this.screenshotHideTimeout = window.setTimeout(async () => {
        this.screenshotHideTimeout = null;
        if (this.hiddenReason === 'auto') {
          try {
            await this.setFloatingTriggerVisibility(true, 'auto');
          } catch (error) {
            console.warn(
              'QA Extension: Failed to restore floating trigger after screenshot',
              error
            );
          }
        }
      }, this.SCREENSHOT_RESTORE_DELAY);
    } catch (error) {
      console.warn(
        'QA Extension: Failed to schedule floating trigger restore',
        error
      );
    }
  }

  private clearScreenshotHideTimeout(): void {
    if (this.screenshotHideTimeout !== null) {
      try {
        window.clearTimeout(this.screenshotHideTimeout);
      } catch {}
      this.screenshotHideTimeout = null;
    }
  }

  private removeScreenshotShortcutListener(): void {
    if (!this.screenshotListenersAttached) return;
    try {
      window.removeEventListener(
        'keydown',
        this.screenshotShortcutHandler,
        true
      );
      document.removeEventListener(
        'keydown',
        this.screenshotShortcutHandler,
        true
      );
    } catch (error) {
      console.warn('QA Extension: Failed to detach screenshot listener', error);
    } finally {
      this.screenshotListenersAttached = false;
    }
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

      if (message.type === MessageType.SET_FLOATING_TRIGGER_VISIBILITY) {
        const { visible, reason } = message.data || {};
        const targetVisible = visible !== false;
        const reasonValue = reason === 'manual' ? 'manual' : 'auto';

        this.setFloatingTriggerVisibility(targetVisible, reasonValue)
          .then(result => {
            sendResponse({ success: result, data: { visible: targetVisible } });
          })
          .catch(error => {
            console.error(
              'QA Extension: Failed to toggle floating trigger visibility',
              error
            );
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Toggle visibility failed',
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

  private getHostWindow(): Window {
    try {
      if (this.iframeHost?.iframe?.contentWindow) {
        return this.iframeHost.iframe.contentWindow;
      }
      if (this.floatingTriggerContainer?.ownerDocument?.defaultView) {
        return this.floatingTriggerContainer.ownerDocument.defaultView;
      }
    } catch (error) {
      console.warn('QA Extension: Failed to resolve host window', error);
    }
    return window;
  }

  private async setFloatingTriggerVisibility(
    visible: boolean,
    reason: 'auto' | 'manual'
  ): Promise<boolean> {
    if (!visible && reason === 'auto' && this.hiddenReason === 'manual') {
      return false;
    }

    if (visible && !this.floatingTriggerContainer) {
      await this.activate();
    }

    if (!this.floatingTriggerContainer) {
      return false;
    }

    try {
      const hostWindow = this.getHostWindow();
      hostWindow.dispatchEvent(
        new CustomEvent('qa-floating-trigger-visibility', {
          detail: { visible, reason },
        })
      );

      if (!visible) {
        if (reason === 'manual') {
          this.clearScreenshotHideTimeout();
        }
        this.hiddenReason = reason;
      } else if (
        reason === 'manual' ||
        (reason === 'auto' && this.hiddenReason === 'auto')
      ) {
        this.hiddenReason = null;
        if (reason === 'manual') {
          this.clearScreenshotHideTimeout();
        }
      }

      return true;
    } catch (error) {
      console.warn(
        'QA Extension: Error dispatching floating trigger visibility event',
        error
      );
      return false;
    }
  }

  private async activate(): Promise<void> {
    // Check whitelist before activating
    if (!(await this.isUrlAllowedByWhitelist())) {
      console.log('QA Extension: Activation blocked - URL not whitelisted');
      return;
    }

    if (!this.isActive) {
      this.isActive = true;
      try {
        await this.injectFloatingTrigger();
      } catch (error) {
        this.isActive = false;
        throw error;
      }
    }
    this.hiddenReason = null;
  }

  /**
   * Check if current URL is allowed by whitelist
   * @returns true if URL is whitelisted or whitelist is empty, false otherwise
   */
  private async isUrlAllowedByWhitelist(): Promise<boolean> {
    try {
      const settings = await storageService.getSettings();
      const whitelistedDomains =
        settings.floatingTrigger.whitelistedDomains || [];
      const currentUrl = window.location.href;

      return isUrlWhitelisted(currentUrl, whitelistedDomains);
    } catch (error) {
      console.warn(
        'QA Extension: Failed to check whitelist in activate()',
        error
      );
      // Fail safely - don't activate if we can't check whitelist
      return false;
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
        } catch {
          return false;
        }
      })();

      // NOTE: Avoid injecting global portal styles into the page to
      // prevent leaking Tailwind utilities into the host site.
      // Our components pass a portal container inside the shadow root,
      // so no global CSS injection is necessary.

      if (useIframe) {
        console.log('QA Extension: Using iframe host for floating trigger');
        // Create isolated iframe host
        this.iframeHost = createIframeHost({
          id: 'qa-floating-trigger-iframe',
          css,
        });
        // In iframe, allow interactivity at root container
        this.iframeHost.container.style.pointerEvents = 'none';
        // Create a child mount node that can receive pointer events
        const mount = this.iframeHost.document.createElement('div');
        mount.style.pointerEvents = 'auto';
        this.iframeHost.container.appendChild(mount);

        // Mark wrapper for styles
        try {
          mount.classList.add('qa-floating-trigger');
        } catch {}

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
      try {
        this.iframeHost.destroy();
      } catch {}
      this.iframeHost = null;
    }

    this.floatingTriggerContainer = null;
    this.isActive = false;
    this.hiddenReason = null;
  }

  destroy(): void {
    this.removeScreenshotShortcutListener();
    this.clearScreenshotHideTimeout();
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
