import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { shadowDOMManager } from '@/utils/shadow-dom';
import { loadShadowDOMCSS } from '@/utils/css-loader';
import { EventLogger } from './event-logger';
import { TelemetryCapture } from './telemetry-capture';
import { MessageType } from '@/types/messages';

const IFRAME_ID = 'qa-recorder-iframe';
const BRIDGE_MESSAGE_TYPE = '__QA_EXTENSION_MESSAGE__';
const VIDEO_EDIT_GENERATION_STATUS_KEY = 'videoEditGenerationStatus';
const VIDEO_EDIT_GENERATION_STATUS_EVENT = 'qa-video-edit-generation-status';

type VideoEditGenerationStatus = 'idle' | 'generating' | 'success' | 'error';

interface VideoEditGenerationPayload {
  status: VideoEditGenerationStatus;
  title?: string;
  error?: string;
  blueprintId?: string;
  recordingId?: string;
  updatedAt: number;
}

type VideoEditGenerationData = Partial<
  Omit<VideoEditGenerationPayload, 'status' | 'updatedAt'>
>;

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
  setStatus: (status: VideoEditGenerationStatus, data?: VideoEditGenerationData) => void;
} | null = null;

function publishVideoEditGenerationStatus(
  status: VideoEditGenerationStatus,
  data: VideoEditGenerationData = {}
) {
  const payload: VideoEditGenerationPayload = {
    ...data,
    status,
    updatedAt: Date.now(),
  };

  try {
    window.dispatchEvent(
      new CustomEvent(VIDEO_EDIT_GENERATION_STATUS_EVENT, { detail: payload })
    );
  } catch {
    // Ignore cross-context notification failures.
  }

  try {
    chrome.storage.local.set({ [VIDEO_EDIT_GENERATION_STATUS_KEY]: payload });
  } catch {
    // Ignore storage failures. The in-page event above is the primary signal.
  }
}

function AppRoot() {
  useEffect(() => {
    generationStatusAPI = {
      setStatus: (status, data) => {
        publishVideoEditGenerationStatus(status, data);
      }
    };
  }, []);

  return null;
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
        generationStatusAPI.setStatus('generating', {
          title,
          recordingId: innerMessage.data?.recordingId,
        });
      } else {
        publishVideoEditGenerationStatus('generating', {
          title,
          recordingId: innerMessage.data?.recordingId,
        });
      }
      setIframeStyles('hidden');
    } else if (innerMessage?.type === 'GENERATION_FAILED') {
      const title = innerMessage.data?.title || 'Recording';
      const error = innerMessage.data?.error || 'Failed to start generation';
      if (generationStatusAPI) {
        generationStatusAPI.setStatus('error', {
          title,
          error,
          recordingId: innerMessage.data?.recordingId,
        });
      } else {
        publishVideoEditGenerationStatus('error', {
          title,
          error,
          recordingId: innerMessage.data?.recordingId,
        });
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
        } else {
          publishVideoEditGenerationStatus('generating');
        }
        break;

      case MessageType.BLUEPRINT_GENERATED: {
        const blueprint = message.data?.blueprint;
        if (blueprint?.status === 'error' || blueprint?.status === 'failed') {
          if (generationStatusAPI) {
            generationStatusAPI.setStatus('error', { error: blueprint.error });
          } else {
            publishVideoEditGenerationStatus('error', { error: blueprint.error });
          }
        } else {
          if (generationStatusAPI) {
            generationStatusAPI.setStatus('success', { 
              title: blueprint?.name,
              blueprintId: blueprint?.id 
            });
          } else {
            publishVideoEditGenerationStatus('success', {
              title: blueprint?.name,
              blueprintId: blueprint?.id,
            });
          }
        }
        break;
      }
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
