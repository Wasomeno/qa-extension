import { createRoot } from 'react-dom/client';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import RecorderUI from './RecorderUI';

const SHADOW_HOST_ID = 'qa-recorder-root';

async function initializeRecorder() {
  if ((window as any).__QA_RECORDER_INITIALIZED__) return;
  (window as any).__QA_RECORDER_INITIALIZED__ = true;

  try {
    // Only render the UI in the top frame to avoid duplicates
    if (window === window.top) {
      // 1. Create Shadow DOM instance immediately
      const instance = shadowDOMManager.create({
        hostId: SHADOW_HOST_ID,
        shadowMode: 'open',
        applyTokensFromDocument: false,
      });

      if (!instance) return;

      // 2. Mount React application immediately
      const container = instance.container;
      const root = createRoot(container);
      root.render(<RecorderUI shadowHostId={SHADOW_HOST_ID} />);

      // 3. Load CSS in the background
      loadShadowDOMCSS()
        .then(css => {
          if (instance.root) {
            const style = document.createElement('style');
            style.textContent = css;
            instance.root.appendChild(style);
          }
        })
        .catch(() => {});
    }
  } catch (error) {
  }
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRecorder);
} else {
  initializeRecorder();
}
