import { ExtensionMessage, MessageType, BackgroundFetchRequest } from '../types/messages';
import { apiService } from '../services/api';
import { storageService } from '../services/storage';

class BackgroundService {
  private store = storageService;
  // Active recording sessions per tab
  private activeSessions = new Map<number, { sessionId: string; t0: number }>();
  // In-flight network requests by webRequest.requestId
  private inflight = new Map<string, {
    tabId: number;
    sessionId: string;
    url: string;
    method: string;
    type?: string;
    tStart: number; // epoch ms
    redirects: Array<{ from: string; to: string; status?: number; timeStamp: number }>
  }>();
  // Buffered finalized network events per session
  private buffers = new Map<string, any[]>();
  // Refresh single-flight state
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    console.log('BackgroundService constructor called');
    this.setupListeners();
    console.log('BackgroundService listeners set up');
  }

  private broadcast(payload: any) {
    try {
      chrome.runtime.sendMessage(payload, () => {
        // Swallow runtime.lastError when no receiver is present to avoid console noise
        void chrome.runtime.lastError;
      });
    } catch {}
  }

  private async withAuthHeaders(init?: RequestInit | null, force = false): Promise<RequestInit> {
    const headers = { ...(init?.headers as Record<string, string>) };
    if (force || !headers || !headers['Authorization']) {
      try {
        const session = await this.store.get('session' as any);
        const token = (session && (session as any).accessToken) || (await this.store.getAuth())?.jwtToken;
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}
    }
    return { ...(init || {}), headers } as RequestInit;
  }

  private async refreshTokenSingleFlight(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const res = await apiService.refreshToken();
        if (res.success && res.data) {
          const auth = res.data;
          // Update session + legacy
          const currentUser = await this.store.get('user' as any);
          await this.store.setSession({
            user: currentUser || null,
            accessToken: auth.jwtToken || null,
            refreshToken: auth.refreshToken || null,
            expiresAt: auth.expiresAt || null,
          } as any);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private async pollOAuthSession(sessionId: string) {
    let attempts = 0;
    const maxAttempts = 20; // ~60s if 3s interval
    const intervalMs = 3000;
    const tick = async () => {
      attempts++;
      try {
        const res = await apiService.getOAuthSession(sessionId);
        if (res.success && res.data) {
          // Convert to session + save
          const authData = res.data.tokens;
          const user = res.data.user;
          try {
            await this.store.setSession({
              user,
              accessToken: authData?.accessToken || null,
              refreshToken: authData?.refreshToken || null,
              expiresAt: authData?.expiresAt || null,
            } as any);
            await chrome.storage.local.remove('pendingOAuthSession');
          } catch {}
          this.broadcast({ type: MessageType.AUTH_SESSION_UPDATED, data: { ok: true } });
          return; // done
        }
      } catch {}
      if (attempts < maxAttempts) {
        setTimeout(tick, intervalMs);
      } else {
        try { await chrome.storage.local.remove('pendingOAuthSession'); } catch {}
      }
    };
    setTimeout(tick, intervalMs);
  }

  private setupListeners() {
    console.log('Setting up message listeners...');

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(
        'Background received message:',
        message.type,
        'from:',
        sender
      );

      this.handleMessage(message, sender, sendResponse).catch(error => {
        console.error('Background message handler error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error',
        });
      });
      return true; // Keep message channel open for async response
    });

    // Port-based bridge (more reliable wake-up on MV3)
    chrome.runtime.onConnect.addListener((port) => {
      try {
        if (!port) return;
        if (port.name === 'keepalive') {
          // Keep the service worker alive while the port is open
          port.onDisconnect.addListener(() => {
            // no-op
          });
          return;
        }
        if (port.name !== 'bridge') return;
        console.log('[BG] Bridge connected from', port.sender?.url || 'unknown');
        port.onMessage.addListener(async (msg) => {
          let _reqId: string | undefined;
          try {
            if (!msg) return;
            if (msg.type === 'BRIDGE_PING') {
              try { port.postMessage({ type: 'BRIDGE_PONG' }); } catch {}
              return;
            }
            if (msg.type !== MessageType.BACKGROUND_FETCH) return;
            _reqId = (msg && (msg as any).reqId) || undefined;
            const { url, init, responseType, includeHeaders, timeoutMs } = (msg.data || {}) as any;
            if (!url || typeof url !== 'string') {
              port.postMessage({ ok: false, error: 'Missing URL', reqId: _reqId });
              return;
            }
            try { console.log('[BG] BACKGROUND_FETCH via port', _reqId, url); } catch {}
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), Math.max(1, timeoutMs || 30000));
            const firstInit = await this.withAuthHeaders(init);
            let resp = await fetch(url, { ...firstInit, signal: controller.signal } as RequestInit);
            // If 401 and not refresh endpoint, try single-flight refresh and retry once
            if (resp.status === 401 && !/\/auth\/refresh\b/.test(url)) {
              const ok = await this.refreshTokenSingleFlight();
              if (ok) {
                const secondInit = await this.withAuthHeaders(init, /*force*/ true);
                try { resp = await fetch(url, { ...secondInit, signal: controller.signal } as RequestInit); } catch {}
              }
            }
            clearTimeout(t);
            const ct = resp.headers.get('content-type') || '';
            const want: 'json' | 'text' | 'arrayBuffer' = responseType
              ? responseType
              : ct.includes('application/json')
                ? 'json'
                : ct.startsWith('text/')
                  ? 'text'
                  : 'arrayBuffer';
            let body: any = undefined;
            try {
              if (want === 'json') body = await resp.json();
              else if (want === 'text') body = await resp.text();
              else {
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                body = btoa(bin);
              }
            } catch {}
            const headers = includeHeaders ? (() => {
              const obj: Record<string, string> = {};
              try { resp.headers.forEach((v, k) => { obj[k] = v; }); } catch {}
              return obj;
            })() : undefined;
            try { console.log('[BG] Replying via port', _reqId, resp.status); } catch {}
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
              }
            });
          } catch (e: any) {
            const msg = e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Fetch failed');
            try { console.warn('[BG] Port fetch failed', _reqId, msg); } catch {}
            try { port.postMessage({ ok: false, error: msg, reqId: _reqId }); } catch {}
          }
        });
      } catch {}
    });

    console.log('Message listener added');
    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));
    chrome.contextMenus.onClicked.addListener(
      this.handleContextMenu.bind(this)
    );
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.webNavigation.onCompleted.addListener(
      this.handleNavigationComplete.bind(this)
    );

    this.setupContextMenus();

    // Set up network capture listeners (observe only)
    const filter = { urls: ['<all_urls>'] } as chrome.webRequest.RequestFilter;
    try {
      chrome.webRequest.onBeforeRequest.addListener(
        (d) => this.onBeforeRequest(d),
        filter
      );
      chrome.webRequest.onBeforeRedirect.addListener(
        (d) => this.onBeforeRedirect(d),
        filter
      );
      chrome.webRequest.onCompleted.addListener(
        (d) => this.onCompleted(d),
        filter
      );
      chrome.webRequest.onErrorOccurred.addListener(
        (d) => this.onErrorOccurred(d),
        filter
      );
      console.log('webRequest listeners registered');
    } catch (e) {
      console.warn('Failed to register webRequest listeners (permissions?):', e);
    }
  }

  private isTabEligible(tab?: chrome.tabs.Tab | null): boolean {
    if (!tab || !tab.url) return false;
    const url = tab.url;
    // Block internal browser pages and extension pages where content scripts cannot run
    const disallowed = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'moz-extension://',
      'about:',
      'devtools://',
      'view-source:',
      'brave://',
      'opera://',
    ];
    if (disallowed.some((p) => url.startsWith(p))) return false;
    // Chrome Web Store blocks content scripts
    if (url.startsWith('https://chrome.google.com/webstore') || url.startsWith('https://chromewebstore.google.com')) {
      return false;
    }
    return true;
  }

  private async getTabById(tabId: number): Promise<chrome.tabs.Tab | null> {
    try {
      // Query all and find matching id (works across MV3 promise/callback variations)
      const all = await chrome.tabs.query({});
      return all.find((t) => t.id === tabId) || null;
    } catch {
      try {
        // Direct get when available
        // @ts-ignore
        const t = await chrome.tabs.get(tabId);
        return t as any;
      } catch {
        return null;
      }
    }
  }

  private async ensureContentScript(tabId: number): Promise<void> {
    try {
      const tab = await this.getTabById(tabId);
      if (!this.isTabEligible(tab)) {
        throw new Error('This page does not allow content scripts');
      }
      // Use callback form to avoid noisy Unchecked runtime.lastError logs
      const alive = await new Promise<boolean>((resolve) => {
        try {
          chrome.tabs.sendMessage(tabId, { type: 'PING' }, () => {
            const err = chrome.runtime.lastError;
            if (err) return resolve(false);
            resolve(true);
          });
        } catch {
          resolve(false);
        }
      });
      if (alive) return; // Content script alive
    } catch {
      // no-op, we'll try injection below
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
        world: 'ISOLATED',
      } as any);
      // Give it a brief moment to initialize, then verify
      await new Promise(r => setTimeout(r, 150));
      const alive2 = await new Promise<boolean>((resolve) => {
        try {
          chrome.tabs.sendMessage(tabId, { type: 'PING' }, () => {
            const err = chrome.runtime.lastError;
            if (err) return resolve(false);
            resolve(true);
          });
        } catch {
          resolve(false);
        }
      });
      if (!alive2) throw new Error('Content script did not respond after injection');
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : 'Failed to inject content script'
      );
    }
  }

  private async sendMessageToTab<T = any>(tabId: number, message: any): Promise<T> {
    await this.ensureContentScript(tabId);
    // Use callback form to avoid Unchecked runtime.lastError spam
    return await new Promise<T>((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || 'Could not reach content script on this page'));
          resolve(res as T);
        });
      } catch (e: any) {
        reject(new Error(e?.message || 'Could not reach content script on this page'));
      }
    });
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    try {
      switch (message.type) {
        case MessageType.AUTH_START: {
          try {
            const reqSessionId = (message?.data && (message as any).data.sessionId) as string | undefined;
            const sessionId = reqSessionId || `oauth_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
            // Ask backend for OAuth URL
            const res = await apiService.getGitLabOAuthUrlWithSession(sessionId);
            if (!res.success || !res.data?.authUrl) {
              sendResponse({ success: false, error: res.error || 'Failed to get OAuth URL' });
              break;
            }
            // Persist pending session for visibility/debug
            try { await chrome.storage.local.set({ pendingOAuthSession: sessionId }); } catch {}
            // Start background polling for completion (best effort; SW may unload; popup can also poll)
            this.pollOAuthSession(sessionId).catch(() => {});
            sendResponse({ success: true, data: { authUrl: res.data.authUrl, sessionId } });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'AUTH_START failed' });
          }
          break;
        }

        case MessageType.AUTH_GET_SESSION: {
          try {
            const s = await this.store.get('session' as any);
            sendResponse({ success: true, data: s || null });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'AUTH_GET_SESSION failed' });
          }
          break;
        }

        case MessageType.AUTH_LOGOUT: {
          try {
            await apiService.logout();
            try {
              await chrome.storage.local.remove(['session','auth','user']);
            } catch {}
            this.broadcast({ type: MessageType.AUTH_SESSION_UPDATED, data: null });
            sendResponse({ success: true });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'AUTH_LOGOUT failed' });
          }
          break;
        }
        case MessageType.BACKGROUND_FETCH: {
          const req = (message.data || {}) as BackgroundFetchRequest;
          const { url, init, responseType, includeHeaders, timeoutMs } = req;
          if (!url || typeof url !== 'string') {
            sendResponse({ success: false, error: 'Missing URL' });
            break;
          }
          try {
            try { console.log('[BG] BACKGROUND_FETCH via onMessage', url); } catch {}
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), Math.max(1, timeoutMs || 30000));
            const firstInit = await this.withAuthHeaders(init);
            let resp = await fetch(url, { ...firstInit, signal: controller.signal } as RequestInit);
            if (resp.status === 401 && !/\/auth\/refresh\b/.test(url)) {
              const ok = await this.refreshTokenSingleFlight();
              if (ok) {
                const secondInit = await this.withAuthHeaders(init, /*force*/ true);
                try { resp = await fetch(url, { ...secondInit, signal: controller.signal } as RequestInit); } catch {}
              }
            }
            clearTimeout(t);

            const ct = resp.headers.get('content-type') || '';
            const want: 'json' | 'text' | 'arrayBuffer' = responseType
              ? responseType
              : ct.includes('application/json')
                ? 'json'
                : ct.startsWith('text/')
                  ? 'text'
                  : 'arrayBuffer';

            let body: any = undefined;
            try {
              if (want === 'json') body = await resp.json();
              else if (want === 'text') body = await resp.text();
              else {
                const buf = await resp.arrayBuffer();
                // Return base64 for safe message passing
                const bytes = new Uint8Array(buf);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                body = btoa(bin);
              }
            } catch (e) {
              // parsing failed; leave body undefined
            }

            const headers: Record<string, string> | undefined = includeHeaders
              ? (() => {
                  const obj: Record<string, string> = {};
                  try { resp.headers.forEach((v, k) => { obj[k] = v; }); } catch {}
                  return obj;
                })()
              : undefined;

            const payload = {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              url: resp.url,
              headers,
              body,
            };
            sendResponse({ success: true, data: payload });
          } catch (e: any) {
            const msg = e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Fetch failed');
            sendResponse({ success: false, error: msg });
          }
          break;
        }
        case MessageType.CREATE_ISSUE:
          const issue = await apiService.createIssue(message.data);
          sendResponse({ success: true, data: issue });
          break;

        case MessageType.FILE_UPLOAD: {
          try {
            const { url, file, purpose, filename } = (message?.data || {}) as { url?: string; file?: any; purpose?: 'screenshot' | 'attachment'; filename?: string };
            if (!url || !file || !purpose) {
              sendResponse({ success: false, error: 'Missing url, file, or purpose' });
              break;
            }
            const auth = await this.store.getAuth();
            const headers: Record<string, string> = {};
            if (auth?.jwtToken) headers['Authorization'] = `Bearer ${auth.jwtToken}`;
            const form = new FormData();
            // If a filename is provided (File-like), preserve it; otherwise default
            let inferredExtFromMime: string | undefined;
            let inferredMime: string | undefined;
            if (typeof file === 'string' && file.startsWith('data:')) {
              const semi = file.indexOf(';');
              const colon = file.indexOf(':');
              if (colon >= 0 && semi > colon) {
                inferredMime = file.slice(colon + 1, semi);
                const mm = inferredMime.toLowerCase();
                const map: Record<string, string> = {
                  'image/png': 'png',
                  'image/jpeg': 'jpg',
                  'image/jpg': 'jpg',
                  'image/gif': 'gif',
                  'image/webp': 'webp',
                  'image/bmp': 'bmp',
                  'image/svg+xml': 'svg',
                  'image/tiff': 'tif',
                  'image/heic': 'heic',
                  'image/heif': 'heif',
                };
                inferredExtFromMime = map[mm];
              }
            }
            const fname = (typeof filename === 'string' && filename) ? filename
              : ((file && typeof file.name === 'string' && file.name) ? file.name
                : ('upload.' + (inferredExtFromMime || 'bin')));
            try {
              form.append('file', file as Blob, fname);
            } catch {
              // As a last resort, try to reconstruct from ArrayBuffer or data URL
              let blob: Blob;
              if (file && file.arrayBuffer && typeof file.arrayBuffer === 'function') {
                const buf = await file.arrayBuffer();
                blob = new Blob([buf]);
              } else if (typeof file === 'string' && file.startsWith('data:')) {
                const comma = file.indexOf(',');
                const base64 = file.slice(comma + 1);
                const bin = atob(base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                blob = new Blob([bytes.buffer], { type: inferredMime || 'application/octet-stream' });
              } else {
                blob = new Blob([]);
              }
              form.append('file', blob, fname);
            }
            form.append('purpose', purpose);
            let resp = await fetch(url, { method: 'POST', headers, body: form });
            if (resp.status === 401 && !/\/auth\/refresh\b/.test(url)) {
              const ok = await this.refreshTokenSingleFlight();
              if (ok) {
                const a2 = await this.store.getAuth();
                if (a2?.jwtToken) headers['Authorization'] = `Bearer ${a2.jwtToken}`; else delete headers['Authorization'];
                try { resp = await fetch(url, { method: 'POST', headers, body: form }); } catch {}
              }
            }
            const data = await (async () => { try { return await resp.json(); } catch { return null; } })();
            if (!resp.ok) {
              sendResponse({ success: false, error: (data && (data.error || data.message)) || `HTTP ${resp.status}: ${resp.statusText}` });
              break;
            }
            sendResponse({ success: true, data: data && (data.data !== undefined ? data.data : data) });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'Upload failed' });
          }
          break;
        }

        case MessageType.AI_TRANSCRIBE: {
          try {
            const { url, audioBlob, language } = (message?.data || {}) as {
              url?: string;
              audioBlob?: Blob;
              language?: string;
            };
            if (!url || !audioBlob) {
              sendResponse({ success: false, error: 'Missing url or audioBlob' });
              break;
            }
            const auth = await this.store.getAuth();
            const headers: Record<string, string> = {};
            if (auth?.jwtToken) headers['Authorization'] = `Bearer ${auth.jwtToken}`;
            const form = new FormData();
            form.append('audio', audioBlob);
            if (language) form.append('language', language);
            let resp = await fetch(url, { method: 'POST', headers, body: form });
            if (resp.status === 401 && !/\/auth\/refresh\b/.test(url)) {
              const ok = await this.refreshTokenSingleFlight();
              if (ok) {
                const a2 = await this.store.getAuth();
                if (a2?.jwtToken) headers['Authorization'] = `Bearer ${a2.jwtToken}`; else delete headers['Authorization'];
                try { resp = await fetch(url, { method: 'POST', headers, body: form }); } catch {}
              }
            }
            const data = await (async () => { try { return await resp.json(); } catch { return null; } })();
            if (!resp.ok) {
              sendResponse({ success: false, error: (data && (data.error || data.message)) || `HTTP ${resp.status}: ${resp.statusText}` });
              break;
            }
            sendResponse({ success: true, data: data && (data.data !== undefined ? data.data : data) });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'Transcription failed' });
          }
          break;
        }

        case MessageType.GET_USER_DATA:
          const userData = await (this.store as any).getUserData();
          sendResponse({ success: true, data: userData });
          break;

        case MessageType.AUTHENTICATE:
          await this.handleAuthentication(message.data);
          sendResponse({ success: true });
          break;

        case MessageType.CONSOLE_HOOK_INSTALL: {
          try {
            const tabId = sender.tab?.id;
            if (tabId == null) throw new Error('No tab to inject');
            await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: () => {
                try {
                  // Install console hook in page main world if not already
                  // @ts-ignore
                  if ((window as any).__QA_CC_CONSOLE_HOOKED__) return;
                  Object.defineProperty(window, '__QA_CC_CONSOLE_HOOKED__', { value: true, configurable: false });
                  const levels = ['log','info','warn','error','debug'] as const;
                  const originals: any = {};
                  const serialize = (args: any[]) => {
                    try {
                      return JSON.parse(JSON.stringify(args, (k,v) => {
                        if (typeof v === 'function') return '[function]';
                        if (v instanceof Element) { try { return '<' + v.tagName.toLowerCase() + '>' } catch { return '[element]' } }
                        if (v && (v as any).window === v) return '[window]';
                        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
                        return v;
                      }));
                    } catch {
                      try { return (Array.isArray(args) ? args : [args]).map((x) => { try { return String(x) } catch { return '[unserializable]' } }); } catch { return ['[unserialializable]']; }
                    }
                  };
                  levels.forEach((lvl) => {
                    originals[lvl] = (console as any)[lvl];
                    (console as any)[lvl] = function(...args: any[]) {
                      try {
                        window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: lvl, args: serialize(args), ts: Date.now() }, '*');
                      } catch {}
                      try { return originals[lvl].apply(this, args); } catch { return undefined; }
                    };
                  });
                  window.addEventListener('error', function(e: any) {
                    try {
                      const info = { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error && (e.error.stack || e.error.message) };
                      window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'error', args: [info], ts: Date.now(), kind: 'error' }, '*');
                    } catch {}
                  }, true);
                  window.addEventListener('unhandledrejection', function(e: any) {
                    try {
                      const r = e.reason;
                      const info = r && (r.stack || r.message) ? { message: r.message, stack: r.stack } : { message: String(r) };
                      window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'error', args: [info], ts: Date.now(), kind: 'unhandledrejection' }, '*');
                    } catch {}
                  }, true);
                  try { window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'debug', args: ['hook-installed'], ts: Date.now(), kind: 'install' }, '*'); } catch {}
                } catch {}
              }
            });
            sendResponse({ success: true });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'Console hook inject failed' });
          }
          break;
        }

        case MessageType.START_RECORDING: {
          const tab = await this.getActiveTab();
          if (!tab?.id) throw new Error('No active tab');
          try {
            await this.ensureContentScript(tab.id);
            const res = await this.sendMessageToTab(tab.id, { type: MessageType.START_RECORDING, data: message.data });
            if (res?.success) {
              // Register session for network capture
              try {
                const meta = res?.data?.meta;
                if (meta?.id && typeof meta?.startedAt === 'number') {
                  this.registerSession(tab.id, meta.id, meta.startedAt);
                  try {
                    await chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      world: 'MAIN',
                      files: ['scripts/main-console-hook.js', 'scripts/main-network-hook.js'],
                    } as any);
                  } catch (e) {
                    console.warn('Failed to inject main-world hooks:', e);
                  }
                }
              } catch {}
              this.showNotification('Recording started', 'User interactions are now being recorded');
            } else {
              this.showNotification('Recording failed', res?.error || 'Could not start recording on this page');
            }
            sendResponse(res);
          } catch (e: any) {
            const msg = e?.message || 'Could not reach content script on this page';
            this.showNotification('Recording failed', msg);
            sendResponse({ success: false, error: msg });
          }
          break;
        }

        case MessageType.STOP_RECORDING: {
          const tab = await this.getActiveTab();
          if (!tab?.id) throw new Error('No active tab');
          try {
            await this.ensureContentScript(tab.id);
            const res = await this.sendMessageToTab(tab.id, { type: MessageType.STOP_RECORDING, data: message.data });
            if (res?.success) {
              // Flush network buffer for this session if available
              try {
                const meta = res?.data?.meta;
                const id: string | undefined = meta?.id || res?.data?.id;
                if (id) this.flushSession(id);
                // Clear tab mapping
                this.activeSessions.delete(tab.id);
              } catch {}
              this.showNotification('Recording stopped', 'Session saved in extension storage');
            } else {
              this.showNotification('Stop failed', res?.error || 'Could not stop recording');
            }
            sendResponse(res);
          } catch (e: any) {
            const msg = e?.message || 'Could not reach content script on this page';
            this.showNotification('Stop failed', msg);
            sendResponse({ success: false, error: msg });
          }
          break;
        }

        // When content script starts/stops rrweb on its own (e.g., UI button)
        case MessageType.NETWORK_CAPTURE_START: {
          let tabId = sender.tab?.id as number | undefined;
          const sessionId = message?.data?.sessionId as string | undefined;
          const startedAt = message?.data?.startedAt as number | undefined;
          const pageUrl = message?.data?.url as string | undefined;
          if (tabId == null && pageUrl) {
            try {
              const tabs = await chrome.tabs.query({});
              const match = tabs.find(t => t?.url === pageUrl);
              if (match?.id != null) tabId = match.id;
            } catch {}
          }
          if (tabId != null && sessionId && typeof startedAt === 'number') {
            this.registerSession(tabId, sessionId, startedAt);
            // Inject MAIN-world hooks at start
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                files: ['scripts/main-console-hook.js', 'scripts/main-network-hook.js'],
              } as any);
            } catch (e) {
              console.warn('MAIN-world hooks injection failed:', e);
            }
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Missing tab/session info' });
          }
          break;
        }
        case MessageType.NETWORK_CAPTURE_STOP: {
          const sessionId = message?.data?.sessionId as string | undefined;
          if (sessionId) {
            // Compute count from persisted storage (most reliable under MV3)
            let networkCount = 0;
            try {
              const key = `recording:${sessionId}:network`;
              const existing = await chrome.storage.local.get(key);
              const arr = existing && existing[key];
              if (Array.isArray(arr)) networkCount = arr.length;
              else {
                // fallback to in-memory buffer length
                const buf = this.buffers.get(sessionId) || [];
                networkCount = Array.isArray(buf) ? buf.length : 0;
              }
            } catch {}
            await this.flushSession(sessionId);
            // Also remove any tab mapping pointing to this session
            for (const [tabId, ctx] of this.activeSessions.entries()) {
              if (ctx.sessionId === sessionId) this.activeSessions.delete(tabId);
            }
            sendResponse({ success: true, data: { networkCount } });
          } else {
            sendResponse({ success: false, error: 'Missing sessionId' });
          }
          break;
        }

        case MessageType.GET_RECORDING_STATUS: {
          const tab = await this.getActiveTab();
          if (!tab?.id) throw new Error('No active tab');
          const res = await this.sendMessageToTab(tab.id, { type: MessageType.GET_RECORDING_STATUS });
          sendResponse(res);
          break;
        }

        case MessageType.TRACK_NETWORK_EVENT: {
          try {
            const { sessionId, event } = (message?.data || {}) as { sessionId?: string; event?: any };
            const sid = sessionId || (() => {
              const tabId = sender.tab?.id;
              if (tabId == null) return undefined;
              const ctx = this.activeSessions.get(tabId);
              return ctx?.sessionId;
            })();
            if (!sid || !event) {
              sendResponse({ success: false, error: 'Missing sessionId or event' });
              break;
            }
            const evt = {
              id: `hook-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
              tabId: sender.tab?.id ?? -1,
              sessionId: sid,
              type: event.kind,
              method: event.method,
              url: event.url,
              status: event.status,
              error: event.error,
              tStart: event.ts,
              tEnd: typeof event.duration === 'number' ? event.ts + event.duration : undefined,
              duration: event.duration,
              redirects: [],
              source: 'hook',
            };
            await this.persistNetworkEvent(sid, this.redactEvent(evt));
            // Also mirror into in-memory buffer for immediate count
            const arr = this.buffers.get(sid) || [];
            arr.push(this.redactEvent(evt));
            this.buffers.set(sid, arr);
            sendResponse({ success: true });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || 'TRACK_NETWORK_EVENT failed' });
          }
          break;
        }

        

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      sendResponse({ success: false, error: errorMessage });
    }
  }

  private async handleCommand(command: string) {
    switch (command) {
      case 'create-issue':
        await this.openIssueCreator();
        break;
      case 'start-recording': {
        // Toggle start/stop depending on current status
        try {
          const tab = await this.getActiveTab();
          if (!tab?.id) return;
          await this.ensureContentScript(tab.id);
          const status = await this.sendMessageToTab(tab.id, { type: MessageType.GET_RECORDING_STATUS });
          if (status?.data?.isRecording) {
            await this.sendMessageToTab(tab.id, { type: MessageType.STOP_RECORDING });
            this.showNotification('Recording stopped', 'Session saved in extension storage');
          } else {
            await this.sendMessageToTab(tab.id, { type: MessageType.START_RECORDING });
            this.showNotification('Recording started', 'User interactions are now being recorded');
          }
        } catch (e) {
          console.error('Recording toggle failed:', e);
        }
        break;
      }
    }
  }

  private async handleContextMenu(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) {
    if (!tab) return;
    switch (info.menuItemId) {
      case 'create-issue-context':
        await this.createIssueFromContext(info, tab);
        break;
      
    }
  }

  private async handleTabUpdate(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) {
    // Content scripts are now declared in manifest only - no programmatic injection needed
    if (changeInfo.status === 'complete' && tab.url) {
      console.log('Tab updated:', tab.url);
    }
  }

  private async handleNavigationComplete(
    details: chrome.webNavigation.WebNavigationFramedCallbackDetails
  ) {
    // Navigation complete - could track analytics here
    console.log('Navigation completed:', details.url);
  }

  private setupContextMenus() {
    chrome.contextMenus.create({
      id: 'create-issue-context',
      title: 'Create Issue from Selection',
      contexts: ['selection', 'page'],
    });

    
  }

  private async openIssueCreator() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      try {
        await this.sendMessageToTab(tabs[0].id!, {
          type: MessageType.OPEN_ISSUE_CREATOR,
          data: { url: tabs[0].url, title: tabs[0].title },
        });
      } catch (e) {
        console.warn('Open issue creator: unable to reach content script:', e);
      }
    }
  }

  private async getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0];
  }

  private async quickCapture() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0] && tabs[0].id) {
        // Send message to content script to handle capture
        const response = await this.sendMessageToTab(tabs[0].id, {
          type: MessageType.CAPTURE_ELEMENT,
          data: {},
        });

        if (response && response.success) {
          this.showNotification(
            'Quick capture completed',
            'Screenshot and context captured successfully.'
          );
        } else {
          this.showNotification(
            'Quick capture failed',
            response?.error || 'Unable to capture screenshot'
          );
        }
      }
    } catch (error) {
      console.error('Quick capture failed:', error);
      this.showNotification(
        'Quick capture failed',
        'An error occurred during capture'
      );
    }
  }

  private async createIssueFromContext(
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab
  ) {
    const contextData = {
      selectionText: info.selectionText,
      pageUrl: info.pageUrl,
      frameUrl: info.frameUrl,
      linkUrl: info.linkUrl,
      mediaType: info.mediaType,
      srcUrl: info.srcUrl,
      tab: { id: tab.id, title: tab.title, url: tab.url },
    };
    try {
      await this.sendMessageToTab(tab.id!, {
        type: MessageType.CREATE_ISSUE_FROM_CONTEXT,
        data: contextData,
      });
    } catch (e) {
      console.warn('Context menu: unable to reach content script:', e);
    }
  }

  

  private async handleAuthentication(authData: any) {
    await (apiService as any).authenticate(authData);
    await (this.store as any).saveAuthData(authData);
  }

  

  // Removed injectContentScript method - using manifest-declared content scripts only

  private showNotification(title: string, message: string) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title,
      message,
    });
  }

  private registerSession(tabId: number, sessionId: string, t0: number) {
    this.activeSessions.set(tabId, { sessionId, t0 });
    if (!this.buffers.has(sessionId)) this.buffers.set(sessionId, []);
  }

  private async flushSession(sessionId: string) {
    const buf = this.buffers.get(sessionId) || [];
    try {
      // If we already have persisted events, avoid overwriting; otherwise persist buffer
      const existing = await chrome.storage.local.get(`recording:${sessionId}:network`);
      const arr = existing && existing[`recording:${sessionId}:network`];
      if (!Array.isArray(arr) && buf.length) {
        await chrome.storage.local.set({ [`recording:${sessionId}:network`]: buf });
      } else if (Array.isArray(arr) && buf.length) {
        // Merge any in-memory residuals to persisted
        const merged = arr.concat(buf);
        await chrome.storage.local.set({ [`recording:${sessionId}:network`]: merged });
      }
      this.buffers.set(sessionId, []);
    } catch (e) {
      console.error('Failed to persist network events:', e);
    }
  }

  private onBeforeRequest(d: chrome.webRequest.WebRequestBodyDetails) {
    if (d.tabId == null || d.tabId < 0) return;
    const ctx = this.activeSessions.get(d.tabId);
    if (!ctx) return;
    const tStart = d.timeStamp; // epoch ms
    const rec = {
      tabId: d.tabId,
      sessionId: ctx.sessionId,
      url: d.url,
      method: (d as any).method || 'GET',
      type: d.type,
      tStart,
      redirects: [] as Array<{ from: string; to: string; status?: number; timeStamp: number }>,
    };
    this.inflight.set(d.requestId, rec);
  }

  private onBeforeRedirect(d: chrome.webRequest.WebRedirectionResponseDetails) {
    const rec = this.inflight.get(d.requestId);
    if (!rec) return;
    try {
      rec.redirects.push({ from: d.initiator || rec.url, to: d.redirectUrl, status: d.statusCode, timeStamp: d.timeStamp });
    } catch {}
  }

  private onCompleted(d: chrome.webRequest.WebResponseCacheDetails) {
    const rec = this.inflight.get(d.requestId);
    if (!rec) return;
    const tEnd = d.timeStamp;
    const evt = {
      id: d.requestId,
      tabId: rec.tabId,
      sessionId: rec.sessionId,
      type: rec.type,
      method: rec.method,
      url: rec.url,
      status: d.statusCode,
      fromCache: d.fromCache,
      tStart: rec.tStart,
      tEnd,
      duration: Math.max(0, tEnd - rec.tStart),
      redirects: rec.redirects,
    };
    this.bufferEvent(evt);
    this.inflight.delete(d.requestId);
  }

  private onErrorOccurred(d: chrome.webRequest.WebResponseErrorDetails) {
    const rec = this.inflight.get(d.requestId);
    if (!rec) return;
    const tEnd = d.timeStamp;
    const evt = {
      id: d.requestId,
      tabId: rec.tabId,
      sessionId: rec.sessionId,
      type: rec.type,
      method: rec.method,
      url: rec.url,
      status: undefined,
      error: d.error,
      tStart: rec.tStart,
      tEnd,
      duration: Math.max(0, tEnd - rec.tStart),
      redirects: rec.redirects,
    };
    this.bufferEvent(evt);
    this.inflight.delete(d.requestId);
  }

  private bufferEvent(evt: any) {
    const arr = this.buffers.get(evt.sessionId) || [];
    arr.push(this.redactEvent(evt));
    this.buffers.set(evt.sessionId, arr);
    // Persist incrementally to survive service worker restarts
    this.persistNetworkEvent(evt.sessionId, this.redactEvent(evt)).catch(() => {});
  }

  private async persistNetworkEvent(sessionId: string, evt: any) {
    try {
      const key = `recording:${sessionId}:network`;
      const existing = await chrome.storage.local.get(key);
      const arr = (existing && existing[key]) || [];
      arr.push(evt);
      await chrome.storage.local.set({ [key]: arr });
    } catch (e) {
      // best-effort; ignore
    }
  }

  private redactEvent(evt: any) {
    try {
      const u = new URL(evt.url);
      // redact common sensitive query params
      ['token', 'auth', 'authorization', 'password', 'key', 'code'].forEach((k) => {
        if (u.searchParams.has(k)) u.searchParams.set(k, 'REDACTED');
      });
      return { ...evt, url: u.toString() };
    } catch {
      return evt;
    }
  }
}

// Initialize the background service
console.log('Background script starting...');
try {
  const backgroundService = new BackgroundService();
  console.log('Background service initialized successfully');

  // Initialize storage when extension starts
  storageService
    .initialize()
    .then(() => {
      console.log('Storage service initialized successfully');
    })
    .catch(error => {
      console.error('Failed to initialize storage service:', error);
    });

  // Keep service worker alive
  chrome.runtime.onStartup.addListener(() => {
    console.log('Extension startup detected');
  });

  chrome.runtime.onInstalled.addListener(async () => {
    console.log('Extension installed/updated');
    // Re-initialize storage on install/update
    storageService.initialize().catch(console.error);

    // Content scripts are now declared in manifest - no manual injection needed
    console.log('Extension installed/updated - content scripts will load automatically on matching pages');
  });
} catch (error) {
  console.error('Failed to initialize background service:', error);
}

// Hot reload support for development
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
  try {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log('🔥 Hot reload connected');
    };

    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'reload') {
        console.log('🔄 Reloading extension...');
        chrome.runtime.reload();
      }
    };

    ws.onclose = () => {
      console.log('🔥 Hot reload disconnected');
    };

    ws.onerror = error => {
      console.log('🔥 Hot reload error:', error);
    };
  } catch (error) {
    // Silently fail if WebSocket is not available
    console.log('Hot reload not available in this environment');
  }
}
