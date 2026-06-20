interface WindowWithBridge extends Window {
  __qaNetworkBridgeInstalled?: boolean;
}

(function mainWorldNetworkBridge() {
  const SOURCE = '__QA_EXTENSION_NETWORK_BRIDGE__';
  const w = window as WindowWithBridge;

  // Avoid double-injection.
  if (w.__qaNetworkBridgeInstalled) return;
  w.__qaNetworkBridgeInstalled = true;

  let requestId = 0;

  interface QaXHRInfo {
    method: string;
    url: string;
    startTime: number;
    requestHeaders: Record<string, string>;
    requestPayload?: string;
    durationMs?: number;
  }

  function getQaXHR(xhr: XMLHttpRequest): QaXHRInfo | undefined {
    return (xhr as unknown as { __qaXHR?: QaXHRInfo }).__qaXHR;
  }

  function setQaXHR(xhr: XMLHttpRequest, info: QaXHRInfo) {
    (xhr as unknown as { __qaXHR?: QaXHRInfo }).__qaXHR = info;
  }

  function post(payload: Record<string, unknown>) {
    window.postMessage({ source: SOURCE, payload }, '*');
  }

  function shouldCapture(url: string): boolean {
    return (
      typeof url === 'string' &&
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.includes('chrome-extension://')
    );
  }

  function normalizeHeaders(headers: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        out[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]: [string, string]) => {
        if (key) out[key] = value;
      });
    } else if (typeof headers === 'object') {
      Object.entries(headers as Record<string, unknown>).forEach(
        ([key, value]) => {
          out[key] = String(value);
        }
      );
    }

    return out;
  }

  function tryExtractPayload(body: unknown): string | undefined {
    if (body === null || body === undefined) return undefined;
    if (typeof body === 'string') return body;
    if (body instanceof FormData) return '[FormData]';
    if (body instanceof URLSearchParams) return body.toString();
    try {
      return JSON.stringify(body);
    } catch {
      return undefined;
    }
  }

  function isTextBasedContentType(contentType: string): boolean {
    return /json|text|xml|html|form-urlencoded|graphql/.test(contentType);
  }

  // Patch fetch
  const originalFetch = window.fetch;
  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const startTime = Date.now();
    const id = `mw-fetch-${++requestId}`;

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
        const req = input as { url?: string; method?: string; headers?: unknown };
        url = req.url || '';
        if (req.method) method = req.method;
        requestHeaders = normalizeHeaders(req.headers);
      }
    } catch {
      // fall through
    }

    if (init) {
      method = init.method || method;
      requestHeaders = { ...requestHeaders, ...normalizeHeaders(init.headers) };
      requestPayload = tryExtractPayload(init.body);
    }

    if (!shouldCapture(url)) {
      return originalFetch.call(window, input, init);
    }

    try {
      const response = await originalFetch.call(window, input, init);

      try {
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const contentType = responseHeaders['content-type'] || '';
        let responsePayload: string | undefined;
        if (isTextBasedContentType(contentType)) {
          try {
            const cloned = response.clone();
            const body = await cloned.text();
            responsePayload =
              body.length > 10240
                ? body.slice(0, 10240) + '\n... [truncated]'
                : body;
          } catch {
            // ignore body read failures
          }
        }

        post({
          requestId: id,
          url,
          method: String(method).toUpperCase(),
          timestamp: startTime,
          durationMs: Date.now() - startTime,
          status: response.status,
          statusText: response.statusText,
          requestHeaders,
          responseHeaders,
          requestPayload,
          responsePayload,
        });
      } catch {
        // ignore capture errors
      }

      return response;
    } catch (error) {
      post({
        requestId: id,
        url,
        method: String(method).toUpperCase(),
        timestamp: startTime,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Fetch failed',
        requestHeaders,
        requestPayload,
      });
      throw error;
    }
  };

  // Patch XMLHttpRequest
  const OriginalXHR = window.XMLHttpRequest;
  const originalOpen = OriginalXHR.prototype.open;
  const originalSend = OriginalXHR.prototype.send;
  const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

  OriginalXHR.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    setQaXHR(this, {
      method,
      url: url instanceof URL ? url.toString() : String(url),
      startTime: Date.now(),
      requestHeaders: {},
    });
    return originalOpen.apply(this, [method, url, ...rest] as any);
  };

  OriginalXHR.prototype.setRequestHeader = function (
    this: XMLHttpRequest,
    header: string,
    value: string
  ) {
    const xhrInfo = getQaXHR(this);
    if (xhrInfo) {
      xhrInfo.requestHeaders[header] = value;
    }
    return originalSetRequestHeader.call(this, header, value);
  };

  OriginalXHR.prototype.send = function (this: XMLHttpRequest, data?: unknown) {
    const xhrInfo = getQaXHR(this);
    if (!xhrInfo) {
      return originalSend.call(this, data as XMLHttpRequestBodyInit | null | undefined);
    }

    xhrInfo.requestPayload = tryExtractPayload(data);

    const originalOnReadyStateChange = this.onreadystatechange;

    this.onreadystatechange = (...args: unknown[]) => {
      if (this.readyState === 4) {
        xhrInfo.durationMs = Date.now() - xhrInfo.startTime;

        const responseHeaders: Record<string, string> = {};
        try {
          const all = this.getAllResponseHeaders();
          if (all) {
            all.split('\r\n').forEach((line) => {
              const idx = line.indexOf(': ');
              if (idx > 0) {
                responseHeaders[line.substring(0, idx)] = line.substring(
                  idx + 2
                );
              }
            });
          }
        } catch {
          // ignore
        }

        const contentType = responseHeaders['content-type'] || '';
        const responsePayload = isTextBasedContentType(contentType)
          ? this.responseText
          : undefined;

        const entry: Record<string, unknown> = {
          requestId: `mw-xhr-${++requestId}`,
          url: xhrInfo.url,
          method: String(xhrInfo.method).toUpperCase(),
          timestamp: xhrInfo.startTime,
          durationMs: xhrInfo.durationMs,
          status: this.status,
          statusText: this.statusText,
          requestHeaders: xhrInfo.requestHeaders,
          requestPayload: xhrInfo.requestPayload,
          responseHeaders,
          responsePayload,
        };

        if (this.status >= 400) {
          entry.error = `HTTP ${this.status} ${this.statusText}`;
        }

        if (shouldCapture(xhrInfo.url)) {
          post(entry);
        }

        this.onreadystatechange = originalOnReadyStateChange;
      }

      if (originalOnReadyStateChange) {
        return originalOnReadyStateChange.apply(this, args as [Event]);
      }
    };

    return originalSend.call(this, data as XMLHttpRequestBodyInit | null | undefined);
  };
})();
