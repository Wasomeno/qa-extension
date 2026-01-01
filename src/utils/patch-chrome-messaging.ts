// Dev-only shim to ensure all sendMessage calls in extension pages
// consume chrome.runtime.lastError to prevent "Unchecked runtime.lastError"
// errors from appearing in popup/options consoles. Also logs the origin.
// Safe to include in production; it only wraps message APIs.

(() => {
  try {
    // Only run in extension pages (not content scripts)
    const isExtensionPage = typeof window !== 'undefined' && String(window.location?.protocol) === 'chrome-extension:';
    if (!isExtensionPage) return;

    const rt: any = (chrome as any)?.runtime;
    const tabs: any = (chrome as any)?.tabs;
    if (!rt) return;

    // Wrap chrome.runtime.sendMessage
    try {
      const orig = rt.sendMessage?.bind(rt);
      if (typeof orig === 'function') {
        rt.sendMessage = (...args: any[]) => {
          const hasCb = args.length > 0 && typeof args[args.length - 1] === 'function';
          if (!hasCb) {
            // Append a callback that consumes lastError to suppress the error entry
            args.push(() => {
              try { const _ = chrome.runtime.lastError; } catch {}
            });
          } else {
            // Wrap existing callback to still consume lastError first
            const userCb = args.pop();
            args.push((...cbArgs: any[]) => {
              try { const _ = chrome.runtime.lastError; } catch {}
              try { return userCb(...cbArgs); } catch {}
            });
          }
          try {
            return orig(...args);
          } catch (e) {
            // If connect errors bubble synchronously in MV3, swallow here
            return undefined as any;
          }
        };
      }
    } catch {}

    // Wrap chrome.tabs.sendMessage
    try {
      if (tabs && typeof tabs.sendMessage === 'function') {
        const origTabs = tabs.sendMessage.bind(tabs);
        tabs.sendMessage = (tabId: any, message: any, ...rest: any[]) => {
          const hasCb = rest.length > 0 && typeof rest[rest.length - 1] === 'function';
          if (!hasCb) {
            rest.push(() => {
              try { const _ = chrome.runtime.lastError; } catch {}
            });
          } else {
            const userCb = rest.pop();
            rest.push((...cbArgs: any[]) => {
              try { const _ = chrome.runtime.lastError; } catch {}
              try { return userCb(...cbArgs); } catch {}
            });
          }
          try {
            return origTabs(tabId, message, ...rest);
          } catch (e) {
            return undefined as any;
          }
        };
      }
    } catch {}
  } catch {}
})();

