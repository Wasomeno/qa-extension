import {
  ConsoleLogEntry,
  JSErrorEntry,
  StorageSnapshot,
  DOMMutationEntry,
  BrowserContext,
  SessionTelemetry,
  StepContext,
  NetworkRequestEntry,
} from '@/types/telemetry';

export class TelemetryCapture {
  private isActive = false;
  private consoleLogs: ConsoleLogEntry[] = [];
  private jsErrors: JSErrorEntry[] = [];
  private storageSnapshots: StorageSnapshot[] = [];
  private domMutations: DOMMutationEntry[] = [];
  private mutationObserver: MutationObserver | null = null;
  private originalConsole: Partial<typeof console> = {};
  private startTime = 0;
  private recordingId = '';

  // Callback to send telemetry to background periodically
  private onTelemetryUpdate?: (telemetry: Partial<SessionTelemetry>) => void;

  constructor(
    recordingId: string,
    onTelemetryUpdate?: (telemetry: Partial<SessionTelemetry>) => void
  ) {
    this.recordingId = recordingId;
    this.onTelemetryUpdate = onTelemetryUpdate;
  }

  public start() {
    if (this.isActive) return;
    this.isActive = true;
    this.startTime = Date.now();
    this.consoleLogs = [];
    this.jsErrors = [];
    this.storageSnapshots = [];
    this.domMutations = [];

    this.patchConsole();
    this.patchErrors();
    this.startMutationObserver();
    this.captureStorageSnapshot();

    console.log('[TelemetryCapture] Started');
  }

  public stop(): Partial<SessionTelemetry> {
    if (!this.isActive) return {};
    this.isActive = false;

    this.restoreConsole();
    this.stopMutationObserver();

    // Capture final storage snapshot
    this.captureStorageSnapshot();

    const browserContext: BrowserContext = {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      url: window.location.href,
    };

    const telemetry: Partial<SessionTelemetry> = {
      recordingId: this.recordingId,
      startUrl: window.location.href,
      startTime: this.startTime,
      endTime: Date.now(),
      browserContext,
      consoleLogs: this.consoleLogs,
      jsErrors: this.jsErrors,
      storageSnapshots: this.storageSnapshots,
      domMutations: this.domMutations,
    };

    console.log('[TelemetryCapture] Stopped', {
      logs: this.consoleLogs.length,
      errors: this.jsErrors.length,
      mutations: this.domMutations.length,
    });

    return telemetry;
  }

  public getCurrentTelemetry(): Partial<SessionTelemetry> {
    return {
      recordingId: this.recordingId,
      startUrl: window.location.href,
      startTime: this.startTime,
      consoleLogs: this.consoleLogs,
      jsErrors: this.jsErrors,
      storageSnapshots: this.storageSnapshots,
      domMutations: this.domMutations,
    };
  }

  public addNetworkRequests(requests: NetworkRequestEntry[]) {
    // Network requests are managed by background; this is a hook if needed
  }

  private patchConsole() {
    const levels: Array<'log' | 'warn' | 'error' | 'info' | 'debug'> = [
      'log',
      'warn',
      'error',
      'info',
      'debug',
    ];

    for (const level of levels) {
      this.originalConsole[level] = console[level];
      console[level] = (...args: any[]) => {
        // Call original first
        (this.originalConsole[level] as any)?.(...args);

        if (!this.isActive) return;

        const message = args
          .map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return '[Object]';
              }
            }
            return String(arg);
          })
          .join(' ');

        this.consoleLogs.push({
          level,
          message,
          timestamp: Date.now(),
          source: 'console',
        });

        // Flush periodically to background
        if (this.consoleLogs.length % 20 === 0) {
          this.flushToBackground();
        }
      };
    }
  }

  private restoreConsole() {
    const levels: Array<'log' | 'warn' | 'error' | 'info' | 'debug'> = [
      'log',
      'warn',
      'error',
      'info',
      'debug',
    ];
    for (const level of levels) {
      if (this.originalConsole[level]) {
        console[level] = this.originalConsole[level] as any;
      }
    }
  }

  private patchErrors() {
    const handleError = (event: ErrorEvent) => {
      if (!this.isActive) return;
      this.jsErrors.push({
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
        timestamp: Date.now(),
      });
      this.flushToBackground();
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!this.isActive) return;
      const reason = event.reason;
      this.jsErrors.push({
        message: typeof reason === 'string' ? reason : reason?.message || 'Unhandled Promise Rejection',
        stack: reason?.stack,
        timestamp: Date.now(),
      });
      this.flushToBackground();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Store cleanup references (we won't remove them since page lifecycle is short,
    // but in a real app you'd track these)
  }

  private startMutationObserver() {
    if (!window.MutationObserver) return;

    let mutationCount = 0;
    let lastFlush = Date.now();

    this.mutationObserver = new MutationObserver(mutations => {
      if (!this.isActive) return;

      const now = Date.now();
      for (const mutation of mutations) {
        mutationCount++;
        const target = this.describeElement(mutation.target as HTMLElement);
        let summary = '';

        if (mutation.type === 'childList') {
          summary = `+${mutation.addedNodes.length} -${mutation.removedNodes.length} nodes`;
        } else if (mutation.type === 'attributes') {
          summary = `attr: ${mutation.attributeName}`;
        } else if (mutation.type === 'characterData') {
          summary = 'text changed';
        }

        this.domMutations.push({
          type: mutation.type as any,
          target,
          summary,
          timestamp: now,
        });
      }

      // Batch mutations - flush every 50 mutations or 2 seconds
      if (mutationCount >= 50 || now - lastFlush > 2000) {
        mutationCount = 0;
        lastFlush = now;
        this.flushToBackground();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: false,
    });
  }

  private stopMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private captureStorageSnapshot() {
    try {
      const local: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) local[key] = localStorage.getItem(key) || '';
      }

      const session: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) session[key] = sessionStorage.getItem(key) || '';
      }

      if (Object.keys(local).length > 0) {
        this.storageSnapshots.push({
          type: 'localStorage',
          data: local,
          timestamp: Date.now(),
        });
      }
      if (Object.keys(session).length > 0) {
        this.storageSnapshots.push({
          type: 'sessionStorage',
          data: session,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      // Storage access may be restricted
    }
  }

  private describeElement(el: HTMLElement): string {
    if (!el) return 'unknown';
    const tag = el.tagName?.toLowerCase() || 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string'
      ? `.${el.className.split(' ')[0]}`
      : '';
    return `${tag}${id}${cls}`;
  }

  private flushToBackground() {
    if (!this.onTelemetryUpdate) return;
    this.onTelemetryUpdate(this.getCurrentTelemetry());
  }
}
