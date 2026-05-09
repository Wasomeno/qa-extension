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
  private networkRequests: NetworkRequestEntry[] = [];
  private mutationObserver: MutationObserver | null = null;
  private originalConsole: Partial<typeof console> = {};
  private originalFetch: typeof fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;
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
    this.networkRequests = [];

    this.patchConsole();
    this.patchErrors();
    this.patchNetwork();
    this.startMutationObserver();
    this.captureStorageSnapshot();

    console.log('[TelemetryCapture] Started');
  }

  public stop(): Partial<SessionTelemetry> {
    if (!this.isActive) return {};
    this.isActive = false;

    this.restoreConsole();
    this.restoreNetwork();
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
      networkRequests: this.networkRequests,
      storageSnapshots: this.storageSnapshots,
      domMutations: this.domMutations,
    };

    console.log('[TelemetryCapture] Stopped', {
      logs: this.consoleLogs.length,
      errors: this.jsErrors.length,
      mutations: this.domMutations.length,
      networkRequests: this.networkRequests.length,
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
      networkRequests: this.networkRequests,
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
    const currentTelemetry = this.getCurrentTelemetry();
    console.log('[TelemetryCapture] Flushing to background:', {
      networkRequests: currentTelemetry.networkRequests?.length || 0,
      consoleLogs: currentTelemetry.consoleLogs?.length || 0
    });
    this.onTelemetryUpdate(currentTelemetry);
  }

  private patchAxios() {
    const self = this;
    let requestId = 0;

    // Check if axios is available in the page
    const axios = (window as any).axios;
    if (!axios) {
      console.log('[TelemetryCapture] Axios not found in window - page may be using a bundled version');
      return;
    }

    console.log('[TelemetryCapture] Axios found, patching...');

    // Store original adapter
    const originalAdapter = axios.defaults.adapter;

    // Patch axios adapter
    axios.defaults.adapter = async (config: any) => {
      const startTime = Date.now();
      const url = config.url || '';
      const method = config.method || 'GET';

      console.log('[TelemetryCapture] Axios request intercepted:', method, url);

      // Skip non-http URLs
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return originalAdapter(config);
      }

      const entry: NetworkRequestEntry = {
        requestId: `axios-${++requestId}`,
        url,
        method: method.toUpperCase(),
        timestamp: startTime,
        requestHeaders: config.headers || {},
        requestPayload: config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : undefined,
      };

      try {
        const response = await originalAdapter(config);

        entry.status = response.status;
        entry.statusText = response.statusText;
        entry.durationMs = Date.now() - startTime;

        // Get response headers
        if (response.headers) {
          entry.responseHeaders = {};
          if (typeof response.headers.forEach === 'function') {
            response.headers.forEach((value: string, key: string) => {
              entry.responseHeaders![key] = value;
            });
          }
        }

        // Get response payload
        if (response.data) {
          const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          entry.responsePayload = body.length > 10240 ? body.slice(0, 10240) + '\n... [truncated]' : body;
        }

        self.networkRequests.push(entry);
        console.log(`[TelemetryCapture] Network: ${method} ${url} -> ${response.status} (${self.networkRequests.length} total)`);

        return response;
      } catch (error: any) {
        entry.error = error.message || 'Request failed';
        entry.durationMs = Date.now() - startTime;
        self.networkRequests.push(entry);
        console.log(`[TelemetryCapture] Network: ${method} ${url} -> ERROR (${self.networkRequests.length} total)`);
        throw error;
      }
    };

    console.log('[TelemetryCapture] Axios adapter patched');
  }

  private patchResponsePrototype() {
    const self = this;
    let requestId = 0;

    // Patch Response constructor to capture all Response objects
    if (typeof Response !== 'undefined') {
      const OriginalResponse = Response;
      
      (window as any).Response = function(body, init) {
        const response = new OriginalResponse(body, init);
        const url = init?.url || (response as any).url || '';
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          console.log('[TelemetryCapture] Response constructor called for:', url);
        }
        return response;
      } as any;
      
      // Copy prototype and properties
      (window as any).Response.prototype = OriginalResponse.prototype;
      (window as any).Response.headers = OriginalResponse.headers;
      (window as any).Response.redirect = OriginalResponse.redirect;
      (window as any).Response.error = OriginalResponse.error;
      (window as any).Response.json = OriginalResponse.json;
      
      console.log('[TelemetryCapture] Response constructor patched');
    }

    // Patch Response.prototype.clone to capture responses from any source
    if (typeof Response !== 'undefined' && Response.prototype) {
      const originalClone = Response.prototype.clone;
      
      Response.prototype.clone = function() {
        const url = (this as any).url || '';
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          console.log('[TelemetryCapture] Response.clone intercepted:', url);
        }
        return originalClone.call(this);
      };
      console.log('[TelemetryCapture] Response.prototype.clone patched');
    }

    // Patch Body.prototype.json if available
    if (typeof Body !== 'undefined' && Body.prototype) {
      const originalJson = Body.prototype.json;
      if (originalJson) {
        Body.prototype.json = async function() {
          const result = await originalJson.call(this);
          const url = (this as any).url || '';
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            console.log('[TelemetryCapture] Body.json intercepted for:', url);
          }
          return result;
        };
        console.log('[TelemetryCapture] Body.prototype.json patched');
      }
    }

    // Use PerformanceObserver to catch resource timing
    this.setupPerformanceObserver();
  }

  private setupPerformanceObserver() {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const self = this;
      let requestId = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resource = entry as PerformanceResourceTiming;
            const url = resource.name;
            const method = (resource as any).initiatorType || 'unknown';
            
            // Skip chrome-extension and non-http URLs
            if (!url || url.includes('chrome-extension://') || !url.startsWith('http')) {
              continue;
            }

            console.log('[TelemetryCapture] PerformanceObserver caught resource:', method, url, 'duration:', resource.duration?.toFixed(2));

            // Only capture if we haven't captured this URL recently
            const entryKey = `perf-${url}`;
            if (!(window as any).__qaLastCapture || (Date.now() - ((window as any).__qaLastCapture[entryKey] || 0)) > 100) {
              (window as any).__qaLastCapture = (window as any).__qaLastCapture || {};
              (window as any).__qaLastCapture[entryKey] = Date.now();

              // Check if we already have this via fetch/XHR
              const alreadyCaptured = self.networkRequests.some(r => r.url === url);
              if (!alreadyCaptured) {
                console.log('[TelemetryCapture] NEW resource from PerformanceObserver (not captured by fetch/XHR):', url);
                self.networkRequests.push({
                  requestId: `perf-${++requestId}`,
                  url,
                  method: method.toUpperCase(),
                  timestamp: Date.now() - resource.duration,
                  durationMs: resource.duration,
                  requestHeaders: {},
                  responseHeaders: {},
                });
                console.log(`[TelemetryCapture] Network: ${method} ${url} -> captured via PerformanceObserver (${self.networkRequests.length} total)`);
              }
            }
          }
        }
      });

      observer.observe({ entryTypes: ['resource'] });
      console.log('[TelemetryCapture] PerformanceObserver for resource timing enabled');
      
      // Store reference for cleanup
      (this as any).__performanceObserver = observer;
    } catch (e) {
      console.log('[TelemetryCapture] PerformanceObserver setup failed:', e);
    }
  }

  private patchNetwork() {
    if (typeof window === 'undefined') return;

    const self = this;
    let requestId = 0;

    console.log('[TelemetryCapture] Patching fetch...');

    // Test that fetch is being patched
    console.log('[TelemetryCapture] Before patch - window.fetch type:', typeof window.fetch);

    // Also try to detect and patch axios if present
    this.patchAxios();

    // Also patch Response prototype for additional coverage
    this.patchResponsePrototype();

    // Patch fetch
    this.originalFetch = window.fetch;
    
    console.log('[TelemetryCapture] After patch - window.fetch type:', typeof window.fetch);
    console.log('[TelemetryCapture] originalFetch type:', typeof this.originalFetch);
    
    // Test the fetch interception by making a test request
    console.log('[TelemetryCapture] Testing fetch interception...');
    fetch('https://httpbin.org/get').then(() => {
      console.log('[TelemetryCapture] Test fetch completed - fetch interception is working!');
    }).catch(e => {
      console.log('[TelemetryCapture] Test fetch failed (expected in some environments):', e?.message);
    });
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const startTime = Date.now();
      const id = `fetch-${++requestId}`;
      
      let url = '';
      let method = 'GET';
      let requestHeaders: Record<string, string> = {};
      let requestPayload: string | undefined;

      try {
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input && typeof input === 'object') {
          // Handle Request object or any object with url property
          const req = input as any;
          url = req.url || '';
          if (req.method) method = req.method;
          // Extract headers from Request
          if (req.headers && typeof req.headers.forEach === 'function') {
            requestHeaders = {};
            req.headers.forEach((value: string, key: string) => {
              requestHeaders[key] = value;
            });
          }
        }
      } catch (e) {
        console.log('[TelemetryCapture] Fetch: URL extraction error:', e);
      }

      // Extract from init
      if (init) {
        method = init.method || method;
        if (init.headers) {
          if (typeof init.headers === 'object' && !Array.isArray(init.headers)) {
            requestHeaders = { ...requestHeaders, ...(init.headers as Record<string, string>) };
          }
        }
        if (init.body && typeof init.body === 'string') {
          requestPayload = init.body;
        } else if (init.body && typeof init.body === 'object') {
          try {
            requestPayload = JSON.stringify(init.body);
          } catch {}
        }
      }

      // Debug log the URL
      console.log('[TelemetryCapture] Fetch intercepted:', method, url);

      // Skip non-http(s) URLs and extension URLs
      if (!url) {
        console.log('[TelemetryCapture] Fetch: empty URL, passing through');
        return self.originalFetch!.call(window, input, init);
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.log('[TelemetryCapture] Fetch: non-http URL, passing through:', url);
        return self.originalFetch!.call(window, input, init);
      }
      if (url.includes('chrome-extension://')) {
        console.log('[TelemetryCapture] Fetch: extension URL, passing through');
        return self.originalFetch!.call(window, input, init);
      }

      const entry: NetworkRequestEntry = {
        requestId: id,
        url,
        method,
        timestamp: startTime,
        requestHeaders,
        requestPayload,
      };

      try {
        const response = await self.originalFetch!.call(window, input, init);
        
        entry.status = response.status;
        entry.statusText = response.statusText;
        entry.durationMs = Date.now() - startTime;

        // Try to get response headers
        try {
          const headers: Headers = response.headers;
          entry.responseHeaders = {};
          headers.forEach((value, key) => {
            entry.responseHeaders![key] = value;
          });
        } catch {}

        // Try to capture response body for text content types
        const contentType = entry.responseHeaders?.['content-type'] || '';
        const isTextBased = contentType.includes('json') || contentType.includes('text') || 
                           contentType.includes('xml') || contentType.includes('html') ||
                           contentType.includes('form-urlencoded') || contentType.includes('graphql');

        if (isTextBased) {
          try {
            const cloned = response.clone();
            const body = await cloned.text();
            entry.responsePayload = body.length > 10240 ? body.slice(0, 10240) + '\n... [truncated]' : body;
          } catch {}
        }

        self.networkRequests.push(entry);
        console.log(`[TelemetryCapture] Network: ${method} ${url} -> ${response.status} (${self.networkRequests.length} total)`);

        // Flush network requests to background periodically
        if (self.networkRequests.length % 20 === 0) {
          self.flushToBackground();
        }

        return response;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : 'Fetch failed';
        entry.durationMs = Date.now() - startTime;
        self.networkRequests.push(entry);
        console.log(`[TelemetryCapture] Network: ${method} ${url} -> ERROR (${self.networkRequests.length} total)`);
        throw error;
      }
    };

    // Patch XMLHttpRequest
    const OriginalXHR = window.XMLHttpRequest;
    const xhrOpen = OriginalXHR.prototype.open;
    const xhrSend = OriginalXHR.prototype.send;

    console.log('[TelemetryCapture] XHR patching - OriginalXHR exists:', !!OriginalXHR);
    console.log('[TelemetryCapture] XHR patching - original xhrOpen type:', typeof xhrOpen);
    console.log('[TelemetryCapture] XHR patching - original xhrSend type:', typeof xhrSend);

    this.originalXHROpen = xhrOpen;
    this.originalXHRSend = xhrSend;

    OriginalXHR.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
      console.log('[TelemetryCapture] XHR.open intercepted:', method, url);
      (this as any).__qaXHR = {
        method: method as string,
        url: url instanceof URL ? url.toString() : String(url),
        startTime: Date.now(),
        requestHeaders: {},
      };
      return xhrOpen.apply(this, [method, url, ...rest] as any);
    };

    OriginalXHR.prototype.send = function(data?: any) {
      const xhrInfo = (this as any).__qaXHR;
      console.log('[TelemetryCapture] XHR.send intercepted, xhrInfo:', xhrInfo?.url);
      const capture = self; // Reference to TelemetryCapture instance
      if (xhrInfo) {
        xhrInfo.requestPayload = typeof data === 'string' ? data : 
                                 (data instanceof FormData ? '[FormData]' : 
                                 (data ? JSON.stringify(data) : undefined));

        const self = this;
        const originalOnReadyStateChange = this.onreadystatechange;
        
        this.onreadystatechange = function() {
          if (self.readyState === 4) {
            xhrInfo.durationMs = Date.now() - xhrInfo.startTime;
            
            // Try to get response headers
            try {
              const getAllResponseHeaders = self.getAllResponseHeaders();
              xhrInfo.responseHeaders = {};
              getAllResponseHeaders.split('\r\n').forEach(line => {
                const idx = line.indexOf(': ');
                if (idx > 0) {
                  const key = line.substring(0, idx);
                  const value = line.substring(idx + 2);
                  xhrInfo.responseHeaders[key] = value;
                }
              });
            } catch {}

            const contentType = xhrInfo.responseHeaders?.['content-type'] || '';
            const isTextBased = contentType.includes('json') || contentType.includes('text') ||
                               contentType.includes('xml') || contentType.includes('html');

            const entry: NetworkRequestEntry = {
              requestId: `xhr-${++requestId}`,
              url: xhrInfo.url,
              method: xhrInfo.method,
              timestamp: xhrInfo.startTime,
              status: self.status,
              statusText: self.statusText,
              durationMs: xhrInfo.durationMs,
              requestHeaders: xhrInfo.requestHeaders,
              requestPayload: xhrInfo.requestPayload,
              responseHeaders: xhrInfo.responseHeaders,
            };

            if (self.status >= 400) {
              entry.error = `HTTP ${self.status} ${self.statusText}`;
            }

            // Try to capture response body
            if (isTextBased && self.responseText) {
              try {
                entry.responsePayload = self.responseText.length > 10240 
                  ? self.responseText.slice(0, 10240) + '\n... [truncated]'
                  : self.responseText;
              } catch {}
            }

            if (entry.url && entry.url.startsWith('http')) {
              capture.networkRequests.push(entry);
              console.log(`[TelemetryCapture] Network: ${entry.method} ${entry.url} -> ${entry.status} (${capture.networkRequests.length} total)`);

              // Flush network requests to background periodically
              if (capture.networkRequests.length % 20 === 0) {
                capture.flushToBackground();
              }
            }

            self.onreadystatechange = originalOnReadyStateChange;
          }
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, arguments as any);
          }
        };
      }
      return xhrSend.call(this, data);
    };

    console.log('[TelemetryCapture] Network interception enabled (fetch + XHR)');
  }

  private restoreNetwork() {
    // Restore fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // Restore XHR
    if (this.originalXHROpen && this.originalXHRSend) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHROpen = null;
      this.originalXHRSend = null;
    }
  }
}
