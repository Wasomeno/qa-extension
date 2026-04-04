import { EventLogger } from './event-logger';
import { MessageType } from '@/types/messages';

const IFRAME_ID = 'qa-recorder-iframe';
let iframe: HTMLIFrameElement | null = null;
let logger: EventLogger | null = null;
let isRecording = false;
let initializationPromise: Promise<void> | null = null;

function setIframeStyles(state: 'hidden' | 'overlay' | 'recording') {
  if (!iframe) {
    console.log('[Recorder] Iframe not found, cannot set styles');
    return;
  }

  console.log(`[Recorder] Setting iframe styles to: ${state}`);

  if (state === 'hidden') {
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.pointerEvents = 'none';
    iframe.style.opacity = '0';
  } else if (state === 'overlay') {
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.bottom = 'auto';
    iframe.style.right = 'auto';
    iframe.style.pointerEvents = 'auto';
    iframe.style.opacity = '1';
  } else if (state === 'recording') {
    iframe.style.width = '340px';
    iframe.style.height = '430px';
    iframe.style.top = 'auto';
    iframe.style.left = 'auto';
    iframe.style.bottom = '0';
    iframe.style.right = '0';
    iframe.style.pointerEvents = 'auto';
    iframe.style.opacity = '1';
  }
  
  console.log(`[Recorder] Iframe styles set. pointerEvents: ${iframe.style.pointerEvents}`);
}

async function initializeRecorder() {
  if ((window as any).__QA_RECORDER_INITIALIZED__) {
    console.log('[Recorder] Already initialized');
    return;
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize() {
  console.log('[Recorder] Initializing recorder...');
  
  // Only run in main frame
  if (window !== window.top) {
    console.log('[Recorder] Not in main frame, skipping initialization');
    return;
  }

  try {
    // Create iframe
    iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('recorder-iframe.html');
    iframe.style.position = 'fixed';
    iframe.style.border = 'none';
    iframe.style.zIndex = '2147483647';
    iframe.style.background = 'transparent';
    iframe.allow = 'camera; microphone; display-capture';
    iframe.style.pointerEvents = 'none';
    iframe.style.opacity = '0';
    iframe.style.transition = 'opacity 0.2s';
    
    document.body.appendChild(iframe);
    console.log('[Recorder] Iframe created and appended');

    // Wait for iframe to load
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn('[Recorder] Iframe load timeout');
        resolve(); // Don't block on iframe load
      }, 5000);
      
      iframe!.onload = () => {
        clearTimeout(timeout);
        console.log('[Recorder] Iframe loaded successfully');
        resolve();
      };
      
      iframe!.onerror = () => {
        clearTimeout(timeout);
        console.error('[Recorder] Iframe failed to load');
        resolve(); // Don't block on iframe error
      };
    });

    // Initialize EventLogger with callback
    logger = new EventLogger(IFRAME_ID, event => {
      console.log('[Recorder] Local callback: event captured', event.type);
      try {
        chrome.runtime.sendMessage({ 
          type: MessageType.IFRAME_LOG_EVENT, 
          data: event 
        }).catch(e => console.error('[Recorder] Failed to send event:', e));
      } catch (e) {
        console.error('[Recorder] Local callback error:', e);
      }
    });
    
    console.log('[Recorder] EventLogger initialized');

    // Set up message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Recorder] Message received:', message.type, 'from:', sender.url?.substring(0, 50));
      
      switch (message.type) {
        case MessageType.OPEN_RECORDING_OVERLAY:
          console.log('[Recorder] OPEN_RECORDING_OVERLAY received');
          setIframeStyles('overlay');
          chrome.runtime
            .sendMessage({
              type: MessageType.IFRAME_PREPARE_RECORDING,
              data: message.data,
            })
            .catch(e => console.error('[Recorder] Failed to prepare:', e));
          sendResponse({ success: true });
          break;

        case MessageType.IFRAME_STARTED_RECORDING:
          console.log('[Recorder] IFRAME_STARTED_RECORDING received');
          if (!isRecording) {
            console.log('[Recorder] Starting recording...');
            isRecording = true;
            logger?.start();
            setIframeStyles('recording');
            console.log('[Recorder] Recording started, logger active:', logger?.isActive());
          } else {
            console.log('[Recorder] Already recording');
          }
          break;

        case MessageType.IFRAME_CLOSED_OVERLAY:
          console.log('[Recorder] IFRAME_CLOSED_OVERLAY received');
          if (isRecording) {
            isRecording = false;
            logger?.stop();
            console.log('[Recorder] Recording stopped');
          }
          setIframeStyles('hidden');
          break;

        case MessageType.STOP_RECORDING:
          console.log('[Recorder] STOP_RECORDING received');
          if (isRecording) {
            isRecording = false;
            const eventCount = logger?.getEventCount() || 0;
            logger?.stop();
            console.log(`[Recorder] Recording stopped. Total events captured: ${eventCount}`);
          }
          setIframeStyles('hidden');
          chrome.runtime
            .sendMessage({ type: MessageType.IFRAME_STOP_RECORDING })
            .catch(() => {});
          sendResponse({ success: true });
          break;

        case MessageType.RESIZE_IFRAME:
          if (iframe && isRecording) {
            iframe.style.width = `${message.data.width}px`;
            iframe.style.height = `${message.data.height}px`;
          }
          break;
          
        case MessageType.PING:
          sendResponse({ success: true, data: 'PONG_RECORDER' });
          break;
      }
      return true;
    });

    // Check initial state from storage
    const result = await chrome.storage.local.get(['isRecording', 'currentRecordingId']);
    console.log('[Recorder] Initial state:', { 
      isRecording: result.isRecording,
      recordingId: result.currentRecordingId 
    });
    
    if (result.isRecording) {
      console.log('[Recorder] Restoring recording state from storage');
      isRecording = true;
      logger?.start();
      setIframeStyles('recording');
    }

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      console.log('[Recorder] Storage changed:', Object.keys(changes));
      
      if ('isRecording' in changes) {
        const newValue = changes.isRecording.newValue;
        console.log('[Recorder] isRecording changed to:', newValue);
        
        if (newValue && !isRecording) {
          console.log('[Recorder] Starting recording from storage change');
          isRecording = true;
          logger?.start();
          setIframeStyles('recording');
        } else if (!newValue && isRecording) {
          console.log('[Recorder] Stopping recording from storage change');
          const eventCount = logger?.getEventCount() || 0;
          isRecording = false;
          logger?.stop();
          console.log(`[Recorder] Recording stopped. Total events: ${eventCount}`);
          setIframeStyles('hidden');
        }
      }
    });

    (window as any).__QA_RECORDER_INITIALIZED__ = true;
    console.log('[Recorder] Initialization complete');
    
  } catch (error) {
    console.error('[Recorder] Initialization failed:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initializeRecorder());
} else {
  initializeRecorder();
}
