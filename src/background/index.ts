import {
  ExtensionMessage,
  MessageType,
  BackgroundFetchRequest,
} from '../types/messages';
import { storageService } from '../services/storage';

class BackgroundService {
  private store = storageService;

  constructor() {
    console.log('BackgroundService constructor called');
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
        const auth = await this.store.getAuth();
        const token = auth?.gitlabToken || auth?.jwtToken;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}
    }
    return { ...(init || {}), headers } as RequestInit;
  }

  private setupListeners() {
    console.log('Setting up message listeners...');

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
          const { url, init, responseType, includeHeaders } = (msg.data ||
            {}) as any;

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
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    switch (message.type) {
      case MessageType.AUTH_LOGOUT:
        await this.store.remove('auth' as any);
        await this.store.remove('user' as any);
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
          sendResponse({
            success: true,
            data: { ok: resp.ok, status: resp.status, body },
          });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_ISSUE_CREATOR:
        await this.openIssueCreator();
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
}

// Initialize
const backgroundService = new BackgroundService();
storageService.initialize().catch(console.error);

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

      ws.onerror = (err) => {
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
