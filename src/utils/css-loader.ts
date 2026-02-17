/**
 * Loads CSS bundle for shadow DOM injection
 */
export async function loadShadowDOMCSS(): Promise<string> {
  try {
    // In production, load from built CSS file
    const response = await fetch(chrome.runtime.getURL('shadow-dom-styles.css'));
    if (!response.ok) {
      throw new Error(`Failed to load CSS: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    // Fallback minimal styles
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #0b1220;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        color-scheme: light;
        contain: style;
        --qa-fg: #0b1220;
        --qa-border: rgba(11, 18, 32, 0.12);
        --qa-glass: rgba(255, 255, 255, 0.15);
        --qa-glass-hover: rgba(255, 255, 255, 0.25);
      }
      * { box-sizing: border-box; }
      .glass-panel {
        background: white;
        border: 1px solid var(--qa-border);
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        border-radius: 16px;
      }
      .fixed { position: fixed !important; }
      .bottom-6 { bottom: 1.5rem !important; }
      .right-6 { right: 1.5rem !important; }
      .flex { display: flex !important; }
      .flex-col { flex-direction: column !important; }
      .items-end { align-items: flex-end !important; }
      .gap-2 { gap: 0.5rem !important; }
      .pointer-events-auto { pointer-events: auto !important; }
      .bg-red-600 { background-color: #dc2626 !important; }
      .text-white { color: #ffffff !important; }
      .rounded-full { border-radius: 9999px !important; }
      .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
      .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
      .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important; }
      .font-semibold { font-weight: 600 !important; }
      .text-sm { font-size: 0.875rem !important; }
    `;
  }
}
