import { record } from 'rrweb';
import type {
  eventWithTime,
  RecordPlugin,
  listenerHandler,
} from '@rrweb/types';
import { storageService } from './storage';
import { MessageType } from '@/types/messages';

export interface RecordingSessionMeta {
  id: string;
  url: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  eventCount: number;
  // Optional enriched stats
  consoleCount?: number;
  networkCount?: number;
}

export interface StoredRecording extends RecordingSessionMeta {
  events: eventWithTime[];
}

class RrwebRecorderService {
  private stopFn: listenerHandler | null = null;
  private events: eventWithTime[] = [];
  private meta: RecordingSessionMeta | null = null;
  private overlayEl: HTMLDivElement | null = null;
  private consoleHookInjected = false;

  get isRecording(): boolean {
    return !!this.stopFn;
  }

  get currentMeta(): RecordingSessionMeta | null {
    return this.meta;
  }

  async start(options?: {
    maskAllInputs?: boolean;
    plugins?: RecordPlugin[];
    sampling?: any;
  }): Promise<RecordingSessionMeta> {
    if (this.stopFn) return this.meta!;

    this.events = [];
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.meta = {
      id,
      url: location.href,
      title: document.title,
      startedAt: Date.now(),
      eventCount: 0,
    };

    // Create small on-page overlay indicator
    this.showOverlay();

    this.stopFn =
      record({
        emit: e => {
          this.events.push(e);
          if (this.meta) this.meta.eventCount = this.events.length;
        },
        maskAllInputs: options?.maskAllInputs ?? true,
        blockClass: 'qa-recorder-ignore',
        sampling: options?.sampling ?? {
          mousemove: 50,
          scroll: 100,
          media: 1000,
        },
        plugins: options?.plugins,
      }) || null;

    // Request background to inject MAIN world console hook (CSP-safe)
    try {
      await new Promise<void>(resolve => {
        chrome.runtime.sendMessage(
          { type: MessageType.CONSOLE_HOOK_INSTALL },
          () => {
            void chrome.runtime.lastError;
            resolve();
          }
        );
      });
    } catch {}

    // Notify background to start network capture for this tab/session
    try {
      await new Promise<void>(resolve => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.NETWORK_CAPTURE_START,
            data: {
              sessionId: id,
              startedAt: this.meta?.startedAt,
              url: location.href,
            },
          },
          () => {
            void chrome.runtime.lastError;
            resolve();
          }
        );
      });
    } catch (e) {
      // non-fatal if background not available
      console.warn('Network capture start notify failed:', e);
    }

    return this.meta;
  }

  async stop({
    persist = true,
  }: { persist?: boolean } = {}): Promise<StoredRecording | null> {
    if (!this.stopFn || !this.meta) return null;
    try {
      this.stopFn();
    } catch {}
    this.stopFn = null;
    this.hideOverlay();

    this.meta.endedAt = Date.now();

    // Compute console event count from rrweb custom events tagged 'console'
    try {
      const consoleCount = this.events.reduce((acc, e: any) => {
        try {
          return (
            acc +
            (e?.type === 5 &&
            (e?.data?.tag === 'console' || e?.data?.tag === 'log')
              ? 1
              : 0)
          );
        } catch {
          return acc;
        }
      }, 0);
      (this.meta as any).consoleCount = consoleCount;
    } catch {}

    const payload: StoredRecording = { ...this.meta, events: this.events };

    // Reset buffers
    this.events = [];

    if (persist) {
      await this.saveRecording(payload);
    }

    // Notify background to stop network capture and flush buffer
    try {
      const res = await new Promise<any>(resolve => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.NETWORK_CAPTURE_STOP,
            data: { sessionId: this.meta?.id },
          },
          reply => {
            const _ = chrome.runtime.lastError;
            resolve(reply);
          }
        );
      });
      if (
        res &&
        res.success &&
        res.data &&
        typeof res.data.networkCount === 'number'
      ) {
        try {
          this.meta.networkCount = res.data.networkCount;
          // Fallback override if persisted array length is greater
          try {
            const blob = await chrome.storage.local.get(
              `recording:${this.meta.id}:network`
            );
            const arr = blob && blob[`recording:${this.meta.id}:network`];
            if (
              Array.isArray(arr) &&
              arr.length > (this.meta.networkCount || 0)
            ) {
              this.meta.networkCount = arr.length;
            }
          } catch {}
          // Persist updated meta index with networkCount
          const index =
            (await storageService.get('recordings' as any)) ||
            ({} as Record<string, RecordingSessionMeta>);
          if (index[this.meta.id]) {
            index[this.meta.id] = {
              ...index[this.meta.id],
              networkCount: this.meta.networkCount,
              consoleCount: this.meta.consoleCount,
            } as any;
            await storageService.set('recordings' as any, index);
          }
        } catch {}
      } else {
        // Fallback: read persisted network buffer length
        try {
          const blob = await chrome.storage.local.get(
            `recording:${this.meta.id}:network`
          );
          const arr = blob && blob[`recording:${this.meta.id}:network`];
          if (Array.isArray(arr)) {
            this.meta.networkCount = arr.length;
            const index =
              (await storageService.get('recordings' as any)) ||
              ({} as Record<string, RecordingSessionMeta>);
            if (index[this.meta.id]) {
              index[this.meta.id] = {
                ...index[this.meta.id],
                networkCount: this.meta.networkCount,
                consoleCount: this.meta.consoleCount,
              } as any;
              await storageService.set('recordings' as any, index);
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Network capture stop notify failed:', e);
    }

    return payload;
  }

  emitCustomEvent(name: string, payload: any) {
    try {
      if (!this.stopFn) return; // only when actively recording
      // Increment consoleCount in real-time for robustness
      if (name === 'console' && this.meta) {
        this.meta.consoleCount = (this.meta.consoleCount || 0) + 1;
      }
      const fn = (record as any)?.addCustomEvent;
      if (typeof fn === 'function') {
        fn(name, payload);
      }
    } catch (e) {
      // ignore
    }
  }

  private injectConsoleHook() {
    if (this.consoleHookInjected) return;
    const script = document.createElement('script');
    script.textContent = `(() => {
      try {
        if (window.__QA_CC_CONSOLE_HOOKED__) return;
        Object.defineProperty(window, '__QA_CC_CONSOLE_HOOKED__', { value: true, configurable: false });
        const levels = ['log','info','warn','error','debug'];
        const originals = {};
        const serialize = (args) => {
          try {
            return JSON.parse(JSON.stringify(args, (k,v) => {
              if (typeof v === 'function') return '[function]';
              if (v instanceof Element) { try { return '<' + v.tagName.toLowerCase() + '>' } catch { return '[element]' } }
              if (v && v.window === v) return '[window]';
              if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
              return v;
            }));
          } catch {
            try { return (Array.isArray(args) ? args : [args]).map((x) => { try { return String(x) } catch { return '[unserializable]' } }); } catch { return ['[unserializable]']; }
          }
        };
        levels.forEach((lvl) => {
          originals[lvl] = console[lvl];
          console[lvl] = function(...args) {
            try {
              window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: lvl, args: serialize(args), ts: Date.now() }, '*');
            } catch {}
            return originals[lvl].apply(this, args);
          };
        });
        window.addEventListener('error', function(e) {
          try {
            const info = { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error && (e.error.stack || e.error.message) };
            window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'error', args: [info], ts: Date.now(), kind: 'error' }, '*');
          } catch {}
        }, true);
        window.addEventListener('unhandledrejection', function(e) {
          try {
            const r = e.reason;
            const info = r && (r.stack || r.message) ? { message: r.message, stack: r.stack } : { message: String(r) };
            window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'error', args: [info], ts: Date.now(), kind: 'unhandledrejection' }, '*');
          } catch {}
        }, true);
        try { window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: 'debug', args: ['hook-installed'], ts: Date.now(), kind: 'install' }, '*'); } catch {}
      } catch {}
    })();`;
    (document.head || document.documentElement).appendChild(script);
    // Remove the script node to avoid leaking DOM nodes
    try {
      script.remove();
    } catch {}
    this.consoleHookInjected = true;
  }

  private async saveRecording(rec: StoredRecording): Promise<void> {
    const all =
      (await storageService.get('recordings' as any)) ||
      ({} as Record<string, RecordingSessionMeta>);
    // Store meta index
    all[rec.id] = {
      id: rec.id,
      url: rec.url,
      title: rec.title,
      startedAt: rec.startedAt,
      endedAt: rec.endedAt,
      eventCount: rec.eventCount,
      consoleCount: (rec as any).consoleCount,
      networkCount: (rec as any).networkCount,
    };
    await storageService.set('recordings' as any, all);

    // Store events payload (attempt single-item first, then fallback to chunked)
    await this.saveEvents(rec.id, rec.events);
  }

  async loadRecording(id: string): Promise<StoredRecording | null> {
    const index =
      (await storageService.get('recordings' as any)) ||
      ({} as Record<string, RecordingSessionMeta>);
    const meta = index[id];
    if (!meta) return null;
    const events = await this.loadEvents(id);
    return { ...meta, events } as StoredRecording;
  }

  async loadNetworkEvents(id: string): Promise<any[] | null> {
    try {
      const blob = await chrome.storage.local.get(`recording:${id}:network`);
      const arr = blob && blob[`recording:${id}:network`];
      if (Array.isArray(arr)) return arr as any[];
      return null;
    } catch (e) {
      console.warn('Failed to load network events:', e);
      return null;
    }
  }

  private async saveEvents(id: string, events: eventWithTime[]): Promise<void> {
    try {
      await chrome.storage.local.set({ [`recording:${id}`]: events });
      return;
    } catch (e) {
      // Fallback to chunked storage by string size
      try {
        const json = JSON.stringify(events);
        const maxChunkSize = 700000; // ~700KB per item to avoid per-item limits
        const chunks: string[] = [];
        for (let i = 0; i < json.length; i += maxChunkSize) {
          chunks.push(json.slice(i, i + maxChunkSize));
        }
        const toSet: Record<string, any> = {
          [`recording:${id}:chunks`]: chunks.length,
        };
        chunks.forEach((chunk, idx) => {
          toSet[`recording:${id}:chunk:${idx}`] = chunk;
        });
        await chrome.storage.local.set(toSet);
        // Also remove the non-chunk key if partially created
        try {
          await chrome.storage.local.remove(`recording:${id}`);
        } catch {}
      } catch (err) {
        console.error('Failed to save recording events (chunked):', err);
        throw err;
      }
    }
  }

  private async loadEvents(id: string): Promise<eventWithTime[]> {
    try {
      const blob = await chrome.storage.local.get(`recording:${id}`);
      const arr = blob && blob[`recording:${id}`];
      if (Array.isArray(arr)) return arr as eventWithTime[];
    } catch {}
    // Try chunked
    try {
      const meta = await chrome.storage.local.get(`recording:${id}:chunks`);
      const count = meta && meta[`recording:${id}:chunks`];
      if (!count || typeof count !== 'number' || count <= 0) return [];
      const keys = Array.from(
        { length: count },
        (_, i) => `recording:${id}:chunk:${i}`
      );
      const data = await chrome.storage.local.get(keys);
      let json = '';
      for (let i = 0; i < count; i++) {
        json += data[`recording:${id}:chunk:${i}`] || '';
      }
      if (!json) return [];
      const events = JSON.parse(json);
      return Array.isArray(events) ? (events as eventWithTime[]) : [];
    } catch (e) {
      console.error('Failed to load chunked recording events:', e);
      return [];
    }
  }

  async listRecordings(): Promise<RecordingSessionMeta[]> {
    const index = (await storageService.get('recordings' as any)) as
      | Record<string, RecordingSessionMeta>
      | undefined;
    const normalized: Record<string, RecordingSessionMeta> = index || {};
    return Object.values(normalized).sort(
      (a: RecordingSessionMeta, b: RecordingSessionMeta) =>
        (b.startedAt || 0) - (a.startedAt || 0)
    );
  }

  async deleteRecording(id: string): Promise<void> {
    const index =
      (await storageService.get('recordings' as any)) ||
      ({} as Record<string, RecordingSessionMeta>);
    if (index[id]) {
      delete index[id];
      await storageService.set('recordings' as any, index);
    }
    try {
      await chrome.storage.local.remove(`recording:${id}`);
    } catch {}
    try {
      await chrome.storage.local.remove(`recording:${id}:network`);
    } catch {}
    try {
      const meta = await chrome.storage.local.get(`recording:${id}:chunks`);
      const count = meta && meta[`recording:${id}:chunks`];
      if (typeof count === 'number' && count > 0) {
        const keys = [
          `recording:${id}:chunks`,
          ...Array.from(
            { length: count },
            (_, i) => `recording:${id}:chunk:${i}`
          ),
        ];
        await chrome.storage.local.remove(keys);
      }
    } catch {}
  }

  private showOverlay() {
    if (this.overlayEl) return;
    const el = document.createElement('div');
    el.className = 'qa-recorder-overlay qa-recorder-ignore';
    el.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483647',
      'background:#dc2626',
      'color:white',
      'font-family:Inter,system-ui,Arial,sans-serif',
      'font-size:12px',
      'padding:6px 10px',
      'border-radius:9999px',
      'box-shadow:0 2px 6px rgba(0,0,0,0.2)',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'pointer-events:none',
    ].join(';');
    el.innerHTML =
      '<span style="display:inline-block;width:8px;height:8px;background:white;border-radius:50%;box-shadow:0 0 6px rgba(255,255,255,0.6)"></span> Recording';
    document.documentElement.appendChild(el);
    this.overlayEl = el;
  }

  private hideOverlay() {
    if (!this.overlayEl) return;
    try {
      this.overlayEl.remove();
    } catch {}
    this.overlayEl = null;
  }
}

export const rrwebRecorder = new RrwebRecorderService();
export default rrwebRecorder;
