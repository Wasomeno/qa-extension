import { videoStorage } from '../services/video-storage';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDER_PROXY') {
    const { id } = message.data;
    startRecordingFlow(id).then(res => {
      sendResponse(res);
    });
    return true;
  }

  if (message.type === 'STOP_RECORDER_PROXY') {
    const { id } = message.data;
    stopRecordingFlow(id).then(res => {
      sendResponse(res);
    });
    return true;
  }
});

async function startRecordingFlow(recordingId: string) {
  try {
    // 1. Get the streamId using the native picker
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.desktopCapture.chooseDesktopMedia(
        ['tab', 'window', 'screen'],
        undefined as unknown as chrome.tabs.Tab, // Valid for this extension page
        id => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else if (!id) reject(new Error('Picker cancelled'));
          else resolve(id);
        }
      );
    });

    // 2. Start capturing the stream using the ID
    // We use getUserMedia here because we are in a visible window (bridge)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      } as any,
    });

    // 3. Minimize the bridge window AFTER stream is acquired
    // This reduces the "Double Window" feeling since it hides immediately
    try {
      const window = await chrome.windows.getCurrent();
      if (window.id) {
        await chrome.windows.update(window.id, { state: 'minimized' });
      }
    } catch (e) {
      console.warn('Failed to minimize picker window', e);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    recordedChunks = [];

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start(1000);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function stopRecordingFlow(recordingId: string) {
  if (!mediaRecorder) return { success: false, error: 'No recorder' };

  return new Promise(resolve => {
    mediaRecorder!.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      if (blob.size > 0) {
        await videoStorage.saveVideo(recordingId, blob);

        // Notify background
        chrome.runtime.sendMessage({
          type: 'VIDEO_SAVED',
          data: { id: recordingId, success: true },
        });
      }

      // Cleanup
      mediaRecorder = null;
      recordedChunks = [];
      window.close(); // Close self when done
      resolve({ success: true });
    };

    mediaRecorder!.stop();
    mediaRecorder!.stream.getTracks().forEach(t => t.stop());
  });
}
