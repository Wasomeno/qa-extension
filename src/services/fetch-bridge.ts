import { BackgroundFetchRequest, BackgroundFetchResponse, MessageResponse, MessageType } from '@/types/messages';

function isExtensionPage(): boolean {
  try { return typeof window !== 'undefined' && String(window.location?.protocol) === 'chrome-extension:'; } catch { return false; }
}

async function sendMessageWithRetry(payload: any, attempts = 6, delayMs = 200): Promise<MessageResponse> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    const res = await new Promise<MessageResponse | null>((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (reply) => {
          const err = chrome.runtime.lastError;
          if (err) { lastErr = err; resolve(null); return; }
          resolve(reply as MessageResponse);
        });
      } catch (e) { lastErr = e; resolve(null); }
    });
    if (res) return res;
    await new Promise(r => setTimeout(r, delayMs));
  }
  const msg = lastErr?.message || String(lastErr || 'Background not reachable');
  throw new Error(msg);
}

// Simple direct fetch with timeout and response-type handling.
export async function bridgeFetch<T = any>(req: BackgroundFetchRequest): Promise<BackgroundFetchResponse<T>> {
  // Content scripts run under the page origin and are subject to CORS.
  // Route their requests through the background via message.
  if (!isExtensionPage()) {
    try {
      const reply = await sendMessageWithRetry({ type: MessageType.BACKGROUND_FETCH, data: req }, 8, 200);
      if (reply && (reply as any).success && (reply as any).data) {
        return (reply as any).data as BackgroundFetchResponse<T>;
      }
      // Fall through to a uniform failure
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        statusText: e?.message || 'Background not reachable',
        url: req.url,
        headers: {},
        body: undefined,
      } as BackgroundFetchResponse<T>;
    }
  }

  // No client-side timeout: never abort requests here.
  try {
    const resp = await fetch(req.url, { ...(req.init as RequestInit) });
    const ct = resp.headers.get('content-type') || '';
    const want = req.responseType || (ct.includes('application/json') ? 'json' : (ct.startsWith('text/') ? 'text' : 'arrayBuffer'));
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
    const headers: Record<string, string> = {};
    try { resp.headers.forEach((v, k) => { headers[k] = v; }); } catch {}
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      url: resp.url,
      headers,
      body,
    } as BackgroundFetchResponse<T>;
  } catch (e) {
    // Surface as a network-like response for uniform handling
    return {
      ok: false,
      status: 0,
      statusText: (e as any)?.message || 'Network error',
      url: req.url,
      headers: {},
      body: undefined,
    } as BackgroundFetchResponse<T>;
  }
}

export default bridgeFetch;
