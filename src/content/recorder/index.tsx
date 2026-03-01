import { EventLogger } from './event-logger';
import { MessageType } from '@/types/messages';

const IFRAME_ID = 'qa-recorder-iframe';
let iframe: HTMLIFrameElement | null = null;
let logger: EventLogger | null = null;
let isRecording = false;

function setIframeStyles(state: 'hidden' | 'overlay' | 'recording') {
  if (!iframe) return;

  if (state === 'hidden') {
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.pointerEvents = 'none';
  } else if (state === 'overlay') {
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.bottom = 'auto';
    iframe.style.right = 'auto';
    iframe.style.pointerEvents = 'auto'; // Block clicks, show modal
  } else if (state === 'recording') {
    iframe.style.width = '340px';
    iframe.style.height = '430px';
    iframe.style.top = 'auto';
    iframe.style.left = 'auto';
    iframe.style.bottom = '0';
    iframe.style.right = '0';
    iframe.style.pointerEvents = 'auto';
  }
}

async function initializeRecorder() {
  if ((window as any).__QA_RECORDER_INITIALIZED__) return;
  (window as any).__QA_RECORDER_INITIALIZED__ = true;

  try {
    if (window === window.top) {
      // Create iframe
      iframe = document.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.src = chrome.runtime.getURL('recorder-iframe.html');
      iframe.style.position = 'fixed';
      iframe.style.border = 'none';
      iframe.style.zIndex = '2147483647';
      iframe.style.background = 'transparent';
      iframe.allow = 'display-capture'; // Essential for screen recording!
      document.body.appendChild(iframe);

      setIframeStyles('hidden');

      logger = new EventLogger(IFRAME_ID, event => {
        try {
          chrome.runtime
            .sendMessage({ type: 'IFRAME_LOG_EVENT', data: event })
            .catch(() => {});
        } catch (e) {}
      });

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'OPEN_RECORDING_OVERLAY') {
          // Instead of starting direct, we tell iframe to show the start button
          setIframeStyles('overlay');
          chrome.runtime
            .sendMessage({
              type: 'IFRAME_PREPARE_RECORDING',
              data: message.data,
            })
            .catch(() => {});
          sendResponse({ success: true });
        } else if (message.type === 'IFRAME_STARTED_RECORDING') {
          // The user actually clicked Start inside the iframe
          if (!isRecording) {
            isRecording = true;
            logger?.start();
            setIframeStyles('recording');
          }
        } else if (message.type === 'IFRAME_CLOSED_OVERLAY') {
          // The user cancelled or finished
          if (isRecording) {
            isRecording = false;
            logger?.stop();
          }
          setIframeStyles('hidden');
        } else if (message.type === MessageType.STOP_RECORDING) {
          if (isRecording) {
            isRecording = false;
            logger?.stop();
          }
          setIframeStyles('hidden');
          chrome.runtime
            .sendMessage({ type: 'IFRAME_STOP_RECORDING' })
            .catch(() => {});
          sendResponse({ success: true });
        } else if (message.type === 'RESIZE_IFRAME') {
          if (iframe && isRecording) {
            iframe.style.width = `${message.data.width}px`;
            iframe.style.height = `${message.data.height}px`;
          }
        }
        return true;
      });

      // Check initial state
      chrome.storage.local.get(['isRecording'], result => {
        if (result.isRecording) {
          isRecording = true;
          logger?.start();
          setIframeStyles('recording');
        }
      });

      chrome.storage.onChanged.addListener(changes => {
        if (changes.isRecording) {
          if (changes.isRecording.newValue) {
            if (!isRecording) {
              isRecording = true;
              logger?.start();
              setIframeStyles('recording');
            }
          } else {
            if (isRecording) {
              isRecording = false;
              logger?.stop();
              setIframeStyles('hidden');
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Failed to initialize recorder:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRecorder);
} else {
  initializeRecorder();
}
