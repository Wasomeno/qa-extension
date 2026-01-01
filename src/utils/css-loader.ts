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
    console.warn('Failed to load shadow DOM CSS bundle, using fallback styles:', error);
    
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
        contain: layout style;
        --qa-fg: #0b1220;
        --qa-border: rgba(11, 18, 32, 0.12);
        --qa-glass: rgba(255, 255, 255, 0.15);
        --qa-glass-hover: rgba(255, 255, 255, 0.25);
      }
      * { box-sizing: border-box; }
      .glass-panel {
        background: var(--qa-glass);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--qa-border);
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        border-radius: 16px;
      }
      .fixed { position: fixed !important; }
      .z-50 { z-index: 50 !important; }
      .rounded-full { border-radius: 9999px !important; }
      .bg-blue-500 { background-color: #3b82f6 !important; }
      .text-white { color: #ffffff !important; }
      .p-4 { padding: 1rem !important; }
      .shadow-xl { box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important; }
    `;
  }
}
