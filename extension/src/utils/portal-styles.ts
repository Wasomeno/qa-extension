/**
 * Injects the shadow DOM CSS bundle into the page <head>
 * so that any portalled UI (e.g., Radix dropdowns/popovers)
 * rendered outside the shadow root still gets styled.
 *
 * This is a pragmatic fallback to ensure components that
 * portal to document.body have the Tailwind utilities
 * available. It is idempotent and will not re-inject if
 * already present.
 */
export function injectGlobalPortalStyles(cssText: string): void {
  try {
    const STYLE_ID = 'qa-portal-styles';
    const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (existing) return;

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    // Insert as-is: includes Tailwind utilities used by our UI components.
    // This intentionally mirrors what is injected into the shadow root.
    styleEl.textContent = cssText;

    // Prefer head; fallback to documentElement if head is missing.
    (document.head || document.documentElement).appendChild(styleEl);
  } catch (err) {
    // Fail silently to avoid breaking the page.
    // eslint-disable-next-line no-console
    console.warn('QA Extension: Failed to inject global portal styles', err);
  }
}

