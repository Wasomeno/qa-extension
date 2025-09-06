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
      * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
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