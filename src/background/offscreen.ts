import { MessageType } from '../types/messages';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let currentRecordingId: string | null = null;
let activeStream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_THUMBNAIL_INTERNAL') {
    const { url, timeInSeconds } = message.data;

    generateThumbnail(url, timeInSeconds)
      .then(dataUrl => sendResponse({ success: true, data: dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  } else if (message.type === MessageType.START_VIDEO_CAPTURE) {
    const { recordingId } = message.data || {};
    handleStartVideoCapture(recordingId)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('[Offscreen] START_VIDEO_CAPTURE failed:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (message.type === MessageType.STOP_VIDEO_CAPTURE) {
    console.log('[Offscreen] Stop video capture requested');

    // 1. Stop MediaRecorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('[Offscreen] Stopping MediaRecorder...');
      mediaRecorder.stop();
    }

    // 2. IMPORTANT: Stop all tracks in the stream immediately to remove the yellow border
    if (activeStream) {
      console.log('[Offscreen] Stopping all media tracks...');
      activeStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[Offscreen] Track ${track.kind} stopped`);
      });
      activeStream = null;
    }

    sendResponse({ success: true });
    return false;
  }
});

async function handleStartVideoCapture(recordingId: string) {
  currentRecordingId = recordingId;

  try {
    console.log(
      `[Offscreen] Initiating native getDisplayMedia for ${recordingId}...`
    );

    // Clean up any existing stream first
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
      },
      audio: false,
    });

    activeStream = stream;
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recordedChunks = [];

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      console.log(
        `[Offscreen] MediaRecorder stopped. Chunks: ${recordedChunks.length}`
      );

      // If the stream is still active, stop it here as well (backup)
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log(`[Offscreen] Video blob size: ${blob.size} bytes`);

      try {
        const arrayBuffer = await blob.arrayBuffer();
        const videoData = Array.from(new Uint8Array(arrayBuffer));

        console.log(
          `[Offscreen] Sending VIDEO_CAPTURE_COMPLETE with ${videoData.length} bytes`
        );
        chrome.runtime.sendMessage({
          type: MessageType.VIDEO_CAPTURE_COMPLETE,
          data: {
            recordingId: currentRecordingId,
            videoData,
          },
        });
      } catch (e) {
        console.error('[Offscreen] Failed to process video data:', e);
        chrome.runtime.sendMessage({
          type: MessageType.VIDEO_CAPTURE_COMPLETE,
          data: {
            recordingId: currentRecordingId,
            success: false,
            error: 'Failed to process video data',
          },
        });
      }
    };

    mediaRecorder.start();
    console.log('[Offscreen] Native video recording started successfully.');
  } catch (err) {
    console.error('[Offscreen] Failed to start native video capture:', err);
    throw err;
  }
}

async function generateThumbnail(
  videoUrl: string,
  time: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.preload = 'auto';
    video.muted = true;

    const timeout = setTimeout(() => {
      video.remove();
      reject(new Error('Thumbnail generation timed out'));
    }, 15000);

    // Wait for metadata to load so we know the duration
    video.addEventListener('loadedmetadata', () => {
      // Seek to the requested time, or 3 seconds into the video, whichever is smaller
      const seekTime = Math.min(time, video.duration || time);
      console.log(`[Thumbnail] Seeking to ${seekTime}s (requested: ${time}s, duration: ${video.duration}s)`);
      video.currentTime = seekTime;
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          console.log(`[Thumbnail] Generated at ${video.currentTime}s`);
          resolve(dataUrl);
        } else {
          reject(new Error('Canvas context not available'));
        }
      } catch (e: any) {
        reject(e);
      } finally {
        clearTimeout(timeout);
        video.remove();
      }
    });

    video.addEventListener('error', (e: any) => {
      clearTimeout(timeout);
      video.remove();
      reject(new Error('Video loading failed in offscreen document'));
    });
  });
}
