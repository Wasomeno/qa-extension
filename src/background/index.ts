import {
  ExtensionMessage,
  MessageType,
  BackgroundFetchRequest,
} from '../types/messages';
import { AIProcessor } from '../services/ai-processor';
import { RawEvent } from '../types/recording';

class BackgroundService {
  private aiProcessor: AIProcessor;
  private recordingEvents: RawEvent[] = [];

  constructor() {
    console.log('BackgroundService constructor called');
    this.aiProcessor = new AIProcessor(__GOOGLE_API_KEY__);
    this.setupListeners();
    console.log('BackgroundService listeners set up');
  }

  private broadcast(payload: any) {
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }

  private async withAuthHeaders(
    init?: RequestInit | null
  ): Promise<RequestInit> {
    const headers = { ...(init?.headers as Record<string, string>) };
    if (!headers['Authorization']) {
      try {
      } catch {}
    }
    return { ...(init || {}), headers } as RequestInit;
  }

  private setupListeners() {
    console.log('Setting up message listeners...');

    chrome.runtime.onInstalled.addListener(() => {
      // Allow content scripts to access storage.session
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.setAccessLevel({
          accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        try {
          await this.handleMessage(message, sender, sendResponse);
        } catch (error) {
          console.error('Background message handler error:', error);
          try {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          } catch {}
        }
      })();
      return true;
    });

    // Port-based bridge
    chrome.runtime.onConnect.addListener(port => {
      if (!port || port.name !== 'bridge') return;
      port.onMessage.addListener(async msg => {
        let _reqId: string | undefined;
        try {
          if (!msg || msg.type !== MessageType.BACKGROUND_FETCH) return;
          _reqId = msg.reqId;
          const { url, init, responseType, includeHeaders } = msg.data as BackgroundFetchRequest;

          if (!url) {
            port.postMessage({
              ok: false,
              error: 'Missing URL',
              reqId: _reqId,
            });
            return;
          }

          const authInit = await this.withAuthHeaders(init);
          const resp = await fetch(url, { ...authInit } as RequestInit);

          const ct = resp.headers.get('content-type') || '';
          const want: 'json' | 'text' | 'arrayBuffer' =
            responseType ||
            (ct.includes('application/json')
              ? 'json'
              : ct.startsWith('text/')
                ? 'text'
                : 'arrayBuffer');

          let body: any = undefined;
          try {
            if (want === 'json') body = await resp.json();
            else if (want === 'text') body = await resp.text();
            else {
              const buf = await resp.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let bin = '';
              for (let i = 0; i < bytes.length; i++)
                bin += String.fromCharCode(bytes[i]);
              body = btoa(bin);
            }
          } catch {}

          const headers = includeHeaders
            ? (() => {
                const obj: Record<string, string> = {};
                resp.headers.forEach((v, k) => {
                  obj[k] = v;
                });
                return obj;
              })()
            : undefined;

          port.postMessage({
            ok: true,
            reqId: _reqId,
            data: {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              url: resp.url,
              headers,
              body,
            },
          });
        } catch (e: any) {
          port.postMessage({
            ok: false,
            error: e?.message || 'Fetch failed',
            reqId: _reqId,
          });
        }
      });
    });

    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));
    chrome.contextMenus.onClicked.addListener(
      this.handleContextMenu.bind(this)
    );
    this.setupContextMenus();

    // Listen for tab updates to re-inject player if playback is active
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        void this.checkAndInjectPlayer(tabId, tab.url);
        void this.checkAndInjectRecorder(tabId, tab.url);
      }
    });
  }

  private async checkAndInjectPlayer(tabId: number, url: string) {
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://'))
      return;

    try {
      const result = await chrome.storage.local.get(['activePlayback']);
      if (result.activePlayback && result.activePlayback.isActive) {
        console.log('[Background] Active playback detected, injecting player.js');
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['player.js'],
        });
      }
    } catch (error) {
      console.error('[Background] Failed to inject player.js:', error);
    }
  }

  private async checkAndInjectRecorder(tabId: number, url: string) {
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://'))
      return;

    try {
      const result = await chrome.storage.local.get(['isRecording']);
      if (result.isRecording) {
        console.log('[Background] Active recording detected, injecting recorder.js');
        // Check if already injected to avoid duplicates
        const [{ result: isInjected }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!document.getElementById('qa-recorder-root'),
        });

        if (!isInjected) {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['recorder.js'],
          });
        }
      }
    } catch (error) {
      console.error('[Background] Failed to inject recorder.js:', error);
    }
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    switch (message.type) {
      case MessageType.AUTH_LOGOUT:
        this.broadcast({ type: MessageType.AUTH_SESSION_UPDATED, data: null });
        sendResponse({ success: true });
        break;

      case MessageType.BACKGROUND_FETCH:
        try {
          const req = (message.data || {}) as BackgroundFetchRequest;
          const authInit = await this.withAuthHeaders(req.init);
          const resp = await fetch(req.url, { ...authInit } as RequestInit);
          // Simplified response handling...
          const body = await (resp.headers.get('content-type')?.includes('json')
            ? resp.json()
            : resp.text());
          const headers: Record<string, string> = {};
          resp.headers.forEach((v, k) => (headers[k] = v));

          sendResponse({
            success: true,
            data: {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              url: resp.url,
              headers,
              body,
            },
          });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_ISSUE_CREATOR:
        await this.openIssueCreator();
        sendResponse({ success: true });
        break;

      case MessageType.GENERATE_BLUEPRINT:
        try {
          const { events } = message.data || {};
          if (!events || !Array.isArray(events)) {
            sendResponse({ success: false, error: 'Missing or invalid events' });
            return;
          }
          const blueprint = await this.aiProcessor.generateBlueprint(events);
          sendResponse({ success: true, data: { blueprint } });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message || 'AI processing failed' });
        }
        break;

      case MessageType.SAVE_BLUEPRINT:
        try {
          const { blueprint } = message.data || {};
          if (!blueprint) {
            sendResponse({ success: false, error: 'Missing blueprint' });
            return;
          }

          const result = await chrome.storage.local.get(['test-blueprints']);
          const blueprints = result['test-blueprints'] || [];
          
          // Add or update
          const index = blueprints.findIndex((b: any) => b.id === blueprint.id);
          if (index >= 0) {
            blueprints[index] = blueprint;
          } else {
            blueprints.push(blueprint);
          }

          await chrome.storage.local.set({ 'test-blueprints': blueprints });
          // Clear last blueprint after saving
          await chrome.storage.local.remove('lastBlueprint');
          
          this.broadcast({ type: 'BLUEPRINT_SAVED', data: { blueprint } });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.DELETE_BLUEPRINT:
        try {
          const { id } = message.data || {};
          if (!id) {
            sendResponse({ success: false, error: 'Missing blueprint ID' });
            return;
          }

          const result = await chrome.storage.local.get(['test-blueprints']);
          const blueprints = result['test-blueprints'] || [];
          const filtered = blueprints.filter((b: any) => b.id !== id);

          await chrome.storage.local.set({ 'test-blueprints': filtered });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.START_PLAYBACK:
        try {
          const { blueprint } = message.data || {};
          if (!blueprint) {
            sendResponse({ success: false, error: 'Missing blueprint' });
            return;
          }

          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ success: false, error: 'No active tab' });
            return;
          }

          // Persist state
          await chrome.storage.local.set({
            activePlayback: {
              isActive: true,
              blueprint,
              currentStepIndex: 0,
              status: 'playing',
            },
          });

          // Inject player
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['player.js'],
          });

          // Send message to start
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id!, {
              type: MessageType.START_PLAYBACK,
              data: { blueprint },
            });
          }, 500);

          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.STOP_PLAYBACK:
        await chrome.storage.local.remove('activePlayback');
        this.broadcast({ type: MessageType.STOP_PLAYBACK });
        sendResponse({ success: true });
        break;

      case MessageType.PLAYBACK_STATUS_UPDATE:
        // Could be used to update UI or logs
        console.log('[Background] Playback status update:', message.data);
        if (message.data.status === 'completed' || message.data.status === 'failed') {
          // Keep state for a bit so UI can show it, or remove?
          // For now, let's keep it until manually cleared or new test starts
        }
        sendResponse({ success: true });
        break;

      case MessageType.START_RECORDING:
        try {
          await this.startRecording();
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.STOP_RECORDING:
        try {
          await this.stopRecording();
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.TRACK_INTERACTION:
        if (message.data) {
          this.recordingEvents.push(message.data);
          // Also persist to session storage for recovery
          chrome.storage.session.get(['currentRecording'], (result) => {
            const recording = result.currentRecording || { events: [] };
            recording.events.push(message.data);
            chrome.storage.session.set({ currentRecording: recording });
          });
        }
        sendResponse({ success: true });
        break;

      default:
      // Forward to content script if needed or ignore
    }
  }

  private setupContextMenus() {
    chrome.contextMenus.create({
      id: 'create-issue-context',
      title: 'Create Issue from Selection',
      contexts: ['selection', 'page'],
    });
  }

  private async handleCommand(command: string) {
    if (command === 'create-issue') await this.openIssueCreator();
  }

  private async handleContextMenu(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) {
    if (tab?.id && info.menuItemId === 'create-issue-context') {
      chrome.tabs.sendMessage(tab.id, {
        type: MessageType.CREATE_ISSUE_FROM_CONTEXT,
        data: { selection: info.selectionText, url: info.pageUrl },
      });
    }
  }

  private async openIssueCreator() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: MessageType.OPEN_ISSUE_CREATOR,
      });
    }
  }

  private async startRecording() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
    await chrome.storage.local.remove('activePlayback');
    await chrome.storage.local.set({ isRecording: true });

    // Inject recorder.js if not already present
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['recorder.js'],
      });
    } catch (e) {
      console.warn('Failed to inject recorder.js, it might already be there:', e);
    }

    const offscreenPath = 'offscreen.html';

    // Check if offscreen document already exists using getContexts
    const existingContexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: offscreenPath,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Recording tab for test evidence',
      });
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });

    chrome.runtime.sendMessage({
      type: MessageType.START_RECORDING,
      data: { streamId },
    });

    // Also notify the content script to start logging
    chrome.tabs.sendMessage(tab.id, { type: MessageType.START_RECORDING });
  }

  private async stopRecording() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.storage.local.set({ isRecording: false });

    // Tell content script to stop and get final events
    let events = this.recordingEvents;
    if (tab?.id) {
      try {
        const response = await new Promise<any>((resolve) => {
          chrome.tabs.sendMessage(
            tab.id!,
            { type: MessageType.STOP_RECORDING },
            (reply) => {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(reply);
            }
          );
        });
        if (response?.events) {
          events = response.events;
        }
      } catch (e) {
        console.warn('Failed to get events from content script:', e);
      }
    }

    // Generate blueprint if we have events
    if (events.length > 0) {
      try {
        console.log('[Background] Generating blueprint from', events.length, 'events');
        const blueprint = await this.aiProcessor.generateBlueprint(events);
        await chrome.storage.local.set({ lastBlueprint: blueprint });
        this.broadcast({ type: 'BLUEPRINT_GENERATED', data: { blueprint } });
      } catch (e) {
        console.error('Failed to generate blueprint:', e);
      }
    }

    chrome.runtime.sendMessage({
      type: MessageType.STOP_RECORDING,
    });

    // We wait a bit before closing the document to ensure the download starts
    setTimeout(async () => {
      const existingContexts = await (chrome.runtime as any).getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (existingContexts.length > 0) {
        await chrome.offscreen.closeDocument();
      }
    }, 1000);

    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
  }
}

// Hot reload (Development only)
if (process.env.NODE_ENV === 'development') {
  const connect = () => {
    try {
      console.log('🔌 [Hot Reload] Connecting to server...');
      const ws = new WebSocket('ws://localhost:8080');

      ws.onopen = () => {
        console.log('✅ [Hot Reload] Connected');
      };

      ws.onmessage = e => {
        if (JSON.parse(e.data).type === 'reload') {
          console.log('🔄 [Hot Reload] Reloading extension...');
          chrome.runtime.reload();
        }
      };

      ws.onclose = () => {
        console.log('❌ [Hot Reload] Disconnected. Retrying in 2s...');
        setTimeout(connect, 2000);
      };

      ws.onerror = err => {
        console.error('⚠️ [Hot Reload] Error:', err);
        ws.close();
      };
    } catch (e) {
      console.error('⚠️ [Hot Reload] Connection failed:', e);
      setTimeout(connect, 2000);
    }
  };
  connect();
}

// Initialize the background service
new BackgroundService();
