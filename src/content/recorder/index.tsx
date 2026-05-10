import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { GenerationStatusPanel } from '../../components/generation-status';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import { EventLogger } from './event-logger';
import { TelemetryCapture } from './telemetry-capture';
import { MessageType } from '@/types/messages';

const IFRAME_ID = 'qa-recorder-iframe';
const BRIDGE_MESSAGE_TYPE = '__QA_EXTENSION_MESSAGE__';

interface BridgeMessage {
  type: string;
  message?: {
    type: string;
    data?: any;
  };
  data?: any;
}

let iframe: HTMLIFrameElement | null = null;
let logger: EventLogger | null = null;
let telemetryCapture: TelemetryCapture | null = null;
let isRecording = false;
let initializationPromise: Promise<void> | null = null;
let iframeReady = false;
let toastRoot: any = null;
const pendingMessages: BridgeMessage[] = [];

let generationStatusAPI: {
  setStatus: (status: 'idle' | 'generating' | 'success' | 'error', data?: any) => void;
} | null = null;

function AppRoot() {
  const [genStatus, setGenStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [genData, setGenData] = useState<any>({});

  useEffect(() => {
    generationStatusAPI = {
      setStatus: (status, data) => {
        setGenStatus(status);
        if (data) {
          setGenData(prev => ({ ...prev, ...data }));
        }
      }
    };
  }, []);

  return (
    <>
      <Toaster 
        position="bottom-right" 
        richColors 
        closeButton
        toastOptions={{ style: { zIndex: 2147483647 } }}
      />
      <GenerationStatusPanel
        status={genStatus}
        title={genData.title}
        error={genData.error}
        blueprintId={genData.blueprintId}
        onClose={() => setGenStatus('idle')}
        onView={() => {
          if (genData.blueprintId) {
            window.open(chrome.runtime.getURL(`recording-detail.html?id=${genData.blueprintId}`), '_blank');
          }
          setGenStatus('idle');
        }}
      />
    </>
  );
}

async function setupToaster() {
  if (toastRoot) return;
  try {
    const css = await loadShadowDOMCSS();
    const instance = shadowDOMManager.create({
      hostId: 'qa-recorder-toast-host',
      shadowMode: 'open',
      css: css,
    });
    toastRoot = createRoot(instance.container);
    toastRoot.render(<AppRoot />);
  } catch (e) {
    console.error('[Recorder] Toaster failed:', e);
  }
}

function sendToIframe(message: BridgeMessage) {
  if (!iframe?.contentWindow) return;
  if (!iframeReady) {
    pendingMessages.push(message);
    return;
  }
  iframe.contentWindow.postMessage({ type: BRIDGE_MESSAGE_TYPE, message }, '*');
}

function flushPendingMessages() {
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()!;
    iframe?.contentWindow?.postMessage({ type: BRIDGE_MESSAGE_TYPE, message: msg }, '*');
  }
}

function sendToBackground(message: { type: string; data?: any }) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function setIframeStyles(state: 'hidden' | 'overlay' | 'recording', options?: { background?: string; pointerEvents?: string }) {
  if (!iframe) return;

  

  if (state === 'overlay') {
    iframe.style.display = 'block';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.right = 'auto';
    iframe.style.bottom = 'auto';
    iframe.style.pointerEvents = options?.pointerEvents || 'auto';
    iframe.style.opacity = '1';
    iframe.style.background = options?.background || 'rgba(0, 0, 0, 0.4)';
    iframe.style.zIndex = '2147483647';
  } else if (state === 'recording') {
    // Hide the iframe entirely while recording without using display: none 
    // which can pause iframe execution in some browsers
    iframe.style.display = 'block';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.right = 'auto';
    iframe.style.bottom = 'auto';
    iframe.style.pointerEvents = 'none';
    iframe.style.opacity = '0';
    iframe.style.background = 'transparent';
    iframe.style.zIndex = '-1';
  } else {
    // hidden state
    iframe.style.display = 'block';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.pointerEvents = 'none';
    iframe.style.opacity = '0';
    iframe.style.background = 'transparent';
  }
}

async function initializeRecorder() {
  if ((window as any).__QA_RECORDER_INITIALIZED__) return;
  if (initializationPromise) return initializationPromise;
  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize() {
  if (window !== window.top) return;

  window.addEventListener('message', event => {
    const message = event.data as BridgeMessage;
    if (!message || message.type !== BRIDGE_MESSAGE_TYPE) return;

    const innerMessage = message.message;
    

    if (innerMessage?.type === 'IFRAME_READY') {
      iframeReady = true;
      flushPendingMessages();
    } else if (innerMessage?.type === 'GENERATION_STARTED') {
      const title = innerMessage.data?.title || 'Recording';
      if (generationStatusAPI) {
        generationStatusAPI.setStatus('generating', { title });
      }
      setIframeStyles('hidden');
    } else if (innerMessage?.type === 'ACTUAL_START_RECORDING') {
      // Immediately hide the overlay while the browser's native screen picker is open
      setIframeStyles('hidden');
      chrome.runtime.sendMessage({
        type: MessageType.ACTUAL_START_RECORDING,
        data: innerMessage.data,
      }).catch(e => {
        sendToIframe({ type: MessageType.RECORDING_ERROR, data: { error: e?.message } });
      });
    } else if (innerMessage?.type === MessageType.IFRAME_STARTED_RECORDING) {
      if (!isRecording) {
        isRecording = true;
        logger?.start();
        telemetryCapture?.start();
        setIframeStyles('recording');
        sendToIframe({ type: 'RECORDING_CONFIRMED' });
      }
    } else if (innerMessage?.type === MessageType.STOP_RECORDING) {
      if (isRecording) {
        isRecording = false;
        logger?.stop();
        const telemetry = telemetryCapture?.stop();
        if (telemetry) {
          chrome.runtime.sendMessage({ type: MessageType.GET_TELEMETRY, data: telemetry }).catch(() => {});
        }
      }
      setIframeStyles('hidden');
      sendToBackground({ type: MessageType.STOP_RECORDING });
    } else if (innerMessage?.type === MessageType.IFRAME_CLOSED_OVERLAY) {
      if (isRecording) {
        isRecording = false;
        logger?.stop();
      }
      setIframeStyles('hidden');
      if (iframe) iframe.src = chrome.runtime.getURL('recorder-iframe.html');
      sendToBackground({ type: MessageType.IFRAME_CLOSED_OVERLAY });
    } else if (innerMessage?.type === MessageType.RESIZE_IFRAME) {
      if (iframe) {
        if (innerMessage.data?.pointerEvents) {
          iframe.style.pointerEvents = innerMessage.data.pointerEvents;
        }
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case MessageType.OPEN_RECORDING_OVERLAY:
        setIframeStyles('overlay');
        sendToIframe({ type: MessageType.IFRAME_PREPARE_RECORDING, data: message.data });
        sendResponse({ success: true });
        break;

      case MessageType.OPEN_VIDEO_EDITOR_MODAL:
        if (iframe) {
          const recordingId = message.data?.recordingId;
          iframe.src = chrome.runtime.getURL(`video-editor.html?id=${recordingId}&modal=true`);
          // Show the editor immediately as an overlay
          setIframeStyles('overlay', { background: 'transparent', pointerEvents: 'auto' });
        }
        sendResponse({ success: true });
        break;

      case MessageType.IFRAME_STARTED_RECORDING:
        if (!isRecording) {
          isRecording = true;
          logger?.start();
          const recordingId = message.data?.recordingId;
          if (recordingId) {
            telemetryCapture?.setRecordingId(recordingId);
          }
          telemetryCapture?.start();
          setIframeStyles('recording');
          sendToIframe({ type: 'RECORDING_CONFIRMED' });
        }
        break;

      case MessageType.IFRAME_CLOSED_OVERLAY:
        if (isRecording) {
          isRecording = false;
          logger?.stop();
        }
        setIframeStyles('hidden');
        break;

      case MessageType.STOP_RECORDING:
        if (isRecording) {
          isRecording = false;
          logger?.stop();
          const telemetry = telemetryCapture?.stop();
          const capturedEvents = logger?.getEvents() || [];
          
          setIframeStyles('hidden');
          sendResponse({ success: true, events: capturedEvents, telemetry });
          return true;
        }
        setIframeStyles('hidden');
        sendToIframe({ type: MessageType.IFRAME_STOP_RECORDING });
        sendResponse({ success: true });
        break;

      case MessageType.BLUEPRINT_PROCESSING:
        if (generationStatusAPI) {
          generationStatusAPI.setStatus('generating');
        }
        break;

      case MessageType.BLUEPRINT_GENERATED:
        const blueprint = message.data?.blueprint;
        if (blueprint?.status === 'error') {
          if (generationStatusAPI) {
            generationStatusAPI.setStatus('error', { error: blueprint.error });
          }
        } else {
          if (generationStatusAPI) {
            generationStatusAPI.setStatus('success', { 
              title: blueprint?.name,
              blueprintId: blueprint?.id 
            });
          }
        }
        break;
    }
    return true;
  });

  logger = new EventLogger(IFRAME_ID, event => {
    sendToIframe({ type: MessageType.IFRAME_LOG_EVENT, data: event });
  });

  telemetryCapture = new TelemetryCapture('', telemetry => {
    chrome.runtime.sendMessage({ type: MessageType.TELEMETRY_UPDATE, data: telemetry }).catch(() => {});
  });

  setupToaster();

  if (!document.getElementById(IFRAME_ID)) {
    iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('recorder-iframe.html');
    iframe.style.cssText = 'position:fixed; border:none; z-index:2147483647; background:transparent; pointer-events:none; display:none;';
    iframe.allow = 'camera; microphone; display-capture';
    document.body.appendChild(iframe);
  } else {
    iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement;
  }

  const result = await chrome.storage.local.get(['isRecording', 'currentRecordingId']);
  if (result.isRecording) {
    isRecording = true;
    logger?.start();
    if (result.currentRecordingId) {
      telemetryCapture?.setRecordingId(result.currentRecordingId);
    }
    telemetryCapture?.start();
    setIframeStyles('recording');
  }

  (window as any).__QA_RECORDER_INITIALIZED__ = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initializeRecorder());
} else {
  initializeRecorder();
}
