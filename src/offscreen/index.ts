import { MessageType, ExtensionMessage } from '../types/messages';
import { videoStorage } from '../services/video-storage';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isStarting = false;

function relayLog(message: string, ...args: any[]) {
  const processedArgs = args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (arg instanceof Error || (typeof arg === 'object' && ('message' in arg || 'name' in arg))) {
      return {
        name: arg.name || 'Error',
        message: arg.message || 'No message',
        code: arg.code,
        stack: arg.stack,
        __isError: true
      };
    }
    if (typeof arg === 'object') {
      try {
        const dump: any = {};
        for (const key in arg) dump[key] = (arg as any)[key];
        ['name', 'message', 'code', 'stack'].forEach(p => { if (p in arg) dump[p] = (arg as any)[p]; });
        return dump;
      } catch (e) { return String(arg); }
    }
    return arg;
  });
  console.log(`[Offscreen] ${message}`, ...processedArgs);
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_LOG', data: { message, args: processedArgs } }).catch(() => {});
}

async function startRecording(streamId: string) {
  try {
    relayLog('Initializing MediaStream with ID:', streamId);
    
    // Use modern constraints where possible, but chromeMediaSourceId is still required for extension streams
    const constraints: any = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    relayLog('Stream obtained successfully');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const id = (window as any).__CURRENT_RECORDING_ID__;
      
      if (id && blob.size > 0) {
        try {
          await videoStorage.saveVideo(id, blob);
          relayLog(`Video saved successfully for ID: ${id}`);
        } catch (e) {
          relayLog('Error saving video to IndexedDB:', e);
        }
      }

      if (id) {
        chrome.runtime.sendMessage({ type: 'VIDEO_SAVED', data: { id, success: blob.size > 0 } }).catch(() => {});
      }

      // Cleanup
      stream.getTracks().forEach(t => t.stop());
      mediaRecorder = null;
    };

    mediaRecorder.start(1000);
    relayLog('MediaRecorder started');
  } catch (error: any) {
    relayLog('CRITICAL: getUserMedia failed:', error);
    throw error;
  }
}

function stopRecording(id?: string) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    relayLog('stopRecording ignored: No active recorder');
    const currentId = id || (window as any).__CURRENT_RECORDING_ID__;
    if (currentId) {
      chrome.runtime.sendMessage({ type: 'VIDEO_SAVED', data: { id: currentId, success: false, error: 'No active recorder' } }).catch(() => {});
    }
    return;
  }

  relayLog('Stopping recording for ID:', id);
  mediaRecorder.requestData();
  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }, 200);
}

// SINGLETON Listener
const messageListener = (message: ExtensionMessage, sender: any, sendResponse: any) => {
  if (message.type === 'START_OFFSCREEN_RECORDING' as any) {
    const { streamId, id } = message.data;
    if (id) (window as any).__CURRENT_RECORDING_ID__ = id;

    if (isStarting || (mediaRecorder && mediaRecorder.state !== 'inactive')) {
      relayLog('START ignored: already in progress');
      sendResponse({ success: true });
      return false;
    }

    isStarting = true;
    relayLog('Starting recording with received streamId...');
    
    startRecording(streamId)
      .then(() => {
        isStarting = false;
        sendResponse({ success: true });
      })
      .catch((err) => {
        isStarting = false;
        sendResponse({ success: false, error: err.message || 'Initialization failed' });
      });
    return true;
  } 
  
  if (message.type === 'STOP_OFFSCREEN_RECORDING' as any) {
    stopRecording(message.data?.id);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === MessageType.PING) {
    sendResponse({ success: true, data: 'PONG_OFFSCREEN' });
    return false;
  }
};

// Remove any potentially existing listeners before adding the new one
chrome.runtime.onMessage.removeListener((window as any).__QA_MSG_LISTENER__);
chrome.runtime.onMessage.addListener(messageListener);
(window as any).__QA_MSG_LISTENER__ = messageListener;

relayLog('Offscreen document script loaded and listener registered');
