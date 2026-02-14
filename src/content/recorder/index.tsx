import React from 'react';
import { createRoot } from 'react-dom/client';
import { shadowDOMManager } from '@/utils/shadow-dom';
import RecorderUI from './RecorderUI';

const SHADOW_HOST_ID = 'qa-recorder-root';

async function initializeRecorder() {
  console.log('🚀 Recorder: Initializing...');

  try {
    // 1. Create Shadow DOM instance
    // Note: In a real build, we'd need to load the shadow-dom.css content here
    // For now, we'll assume the manager handles basic tokens or we'll inject minimal styles
    const instance = shadowDOMManager.create({
      hostId: SHADOW_HOST_ID,
      shadowMode: 'open',
      css: `
        :host {
          all: initial;
        }
        .fixed { position: fixed; }
        .bottom-24 { bottom: 6rem; }
        .right-6 { right: 1.5rem; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .items-end { align-items: flex-end; }
        .gap-2 { gap: 0.5rem; }
        .bg-white { background-color: white; }
        .bg-white\/90 { background-color: rgba(255, 255, 255, 0.9); }
        .backdrop-blur-md { backdrop-filter: blur(12px); }
        .border { border-width: 1px; }
        .border-red-200 { border-color: #fecaca; }
        .border-gray-200 { border-color: #e5e7eb; }
        .border-gray-100 { border-color: #f3f4f6; }
        .rounded-lg { border-radius: 0.5rem; }
        .rounded-full { border-radius: 9999px; }
        .rounded-sm { border-radius: 0.125rem; }
        .p-3 { padding: 0.75rem; }
        .px-4 { padding-left: 1rem; padding-right: 1rem; }
        .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
        .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
        .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); }
        .mb-2 { margin-bottom: 0.5rem; }
        .mt-2 { margin-top: 0.5rem; }
        .min-w-\[200px\] { min-width: 200px; }
        .flex-row { flex-direction: row; }
        .items-center { align-items: center; }
        .w-2 { width: 0.5rem; }
        .h-2 { height: 0.5rem; }
        .w-3 { width: 0.75rem; }
        .h-3 { height: 0.75rem; }
        .bg-red-500 { background-color: #ef4444; }
        .bg-red-600 { background-color: #dc2626; }
        .bg-gray-900 { background-color: #111827; }
        .bg-gray-50 { background-color: #f9fafb; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        .text-xs { font-size: 0.75rem; }
        .text-sm { font-size: 0.875rem; }
        .text-\[10px\] { font-size: 10px; }
        .text-\[9px\] { font-size: 9px; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .text-red-600 { color: #dc2626; }
        .text-gray-900 { color: #111827; }
        .text-gray-700 { color: #374151; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-400 { color: #9ca3af; }
        .text-white { color: white; }
        .uppercase { text-transform: uppercase; }
        .tracking-wider { letter-spacing: 0.05em; }
        .max-h-32 { max-height: 8rem; }
        .overflow-y-auto { overflow-y: auto; }
        .space-y-1 > * + * { margin-top: 0.25rem; }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .text-right { text-align: right; }
        .italic { font-style: italic; }
        .transition-all { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
        .transform { transform: translateX(var(--tw-translate-x)) translateY(var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y)); }
        .hover\:scale-105:hover { transform: scale(1.05); }
        .active\:scale-95:active { transform: scale(0.95); }
        .pointer-events-auto { pointer-events: auto; }
        button { cursor: pointer; border: none; font-family: inherit; }
      `
    });

    // 2. Mount React application
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
