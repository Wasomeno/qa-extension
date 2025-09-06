(() => {
  try {
    if (window.__QA_CC_CONSOLE_HOOKED__) return;
    Object.defineProperty(window, '__QA_CC_CONSOLE_HOOKED__', { value: true, configurable: false });
    const levels = ['log','info','warn','error','debug'];
    const originals = {};
    const serialize = (args) => {
      try {
        return JSON.parse(JSON.stringify(args, (k,v) => {
          if (typeof v === 'function') return '[function]';
          try { if (v instanceof Element) return '<' + v.tagName.toLowerCase() + '>'; } catch {}
          try { if (v && v.window === v) return '[window]'; } catch {}
          if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
          return v;
        }));
      } catch {
        try { return (Array.isArray(args) ? args : [args]).map((x) => { try { return String(x) } catch { return '[unserializable]' } }); } catch { return ['[unserializable]']; }
      }
    };
    levels.forEach((lvl) => {
      try { originals[lvl] = console[lvl]; } catch {}
      try {
        console[lvl] = function(...args) {
          try { window.postMessage({ __qa_cc: true, type: 'QA_CC_CONSOLE_EVENT', level: lvl, args: serialize(args), ts: Date.now() }, '*'); } catch {}
          try { return originals[lvl].apply(this, args); } catch { return undefined; }
        };
      } catch {}
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
})();

