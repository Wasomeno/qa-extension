(() => {
  try {
    if (window.__QA_CC_NETWORK_HOOKED__) return;
    Object.defineProperty(window, '__QA_CC_NETWORK_HOOKED__', { value: true, configurable: false });

    const post = (payload) => {
      try { window.postMessage({ __qa_cc: true, type: 'QA_CC_NETWORK_EVENT', ...payload, ts: Date.now() }, '*'); } catch {}
    };

    // fetch hook
    try {
      const origFetch = window.fetch;
      window.fetch = async function(input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url) || String(input);
        const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET';
        const start = performance.now ? performance.now() : Date.now();
        post({ phase: 'start', kind: 'fetch', method, url });
        try {
          const res = await origFetch.apply(this, arguments);
          const end = performance.now ? performance.now() : Date.now();
          post({ phase: 'end', kind: 'fetch', method, url, status: res && res.status, duration: end - start });
          return res;
        } catch (err) {
          const end = performance.now ? performance.now() : Date.now();
          post({ phase: 'error', kind: 'fetch', method, url, error: err && (err.message || String(err)), duration: end - start });
          throw err;
        }
      };
    } catch {}

    // XHR hook
    try {
      const OrigXHR = window.XMLHttpRequest;
      function HookedXHR() {
        const xhr = new OrigXHR();
        let method = 'GET';
        let url = '';
        let start = 0;
        const open = xhr.open;
        xhr.open = function(m, u) { method = m || 'GET'; url = u || ''; return open.apply(xhr, arguments); };
        const send = xhr.send;
        xhr.addEventListener('loadstart', function() { start = performance.now ? performance.now() : Date.now(); post({ phase: 'start', kind: 'xhr', method, url }); });
        xhr.addEventListener('loadend', function() { const end = performance.now ? performance.now() : Date.now(); post({ phase: 'end', kind: 'xhr', method, url, status: xhr.status, duration: end - start }); });
        xhr.addEventListener('error', function() { const end = performance.now ? performance.now() : Date.now(); post({ phase: 'error', kind: 'xhr', method, url, status: xhr.status, duration: end - start }); });
        xhr.send = function() { return send.apply(xhr, arguments); };
        return xhr;
      }
      HookedXHR.prototype = OrigXHR.prototype;
      // @ts-ignore
      window.XMLHttpRequest = HookedXHR;
    } catch {}

  } catch {}
})();

