import React from 'react';
import { createRoot } from 'react-dom/client';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import RecorderUI from './RecorderUI';

const SHADOW_HOST_ID = 'qa-recorder-root';

async function initializeRecorder() {
  console.log('🚀 Recorder: Initializing...');

  try {
    // 1. Load Shadow DOM CSS
    const css = await loadShadowDOMCSS();

    // 2. Create Shadow DOM instance
    const instance = shadowDOMManager.create({
      hostId: SHADOW_HOST_ID,
      shadowMode: 'open',
      css,
      applyTokensFromDocument: false, // Ensure isolation from page variables
    });

    // 3. Mount React application
    const root = createRoot(instance.container);
    root.render(<RecorderUI shadowHostId={SHADOW_HOST_ID} />);

    console.log('✅ Recorder: Initialized and mounted');
  } catch (error) {
    console.error('❌ Recorder: Failed to initialize:', error);
  }
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRecorder);
} else {
  initializeRecorder();
}
