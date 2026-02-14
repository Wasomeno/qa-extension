import { MessageType, ExtensionMessage } from '../types/messages';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

chrome.runtime.onMessage.addListener(async (message: ExtensionMessage) => {
  if (message.type === MessageType.START_RECORDING) {
    const { streamId } = message.data;
    await startRecording(streamId);
  } else if (message.type === MessageType.STOP_RECORDING) {
    stopRecording();
  }
});

async function startRecording(streamId: string) {
  if (mediaRecorder) {
    console.warn('Recording already in progress');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as any,
    });

    // Check supported types
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
    });

    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, {
        type: 'video/webm',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `test-recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      // Stop all tracks
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    console.log('Recording started in offscreen document');
  } catch (error) {
    console.error('Failed to start recording in offscreen document:', error);
  }
}

function stopRecording() {
  if (!mediaRecorder) {
    console.warn('No recording in progress');
    return;
  }
  mediaRecorder.stop();
  mediaRecorder = null;
  console.log('Recording stopped in offscreen document');
}
