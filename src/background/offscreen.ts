async function trimVideo(
  key: string,
  trimStart: number,
  trimEnd: number
): Promise<Blob> {
  const sourceBlob = await getVideoBlob(key);
  if (!sourceBlob) throw new Error('Source video not found');

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(sourceBlob);
    video.muted = true;
    video.preload = 'auto';

    const chunks: BlobPart[] = [];
    let recorder: MediaRecorder;

    video.onloadedmetadata = () => {
      const stream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream();
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(video.src);
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };

      // Seek to start
      video.currentTime = trimStart;
    };

    video.onseeked = () => {
      if (recorder.state === 'inactive') {
        recorder.start();
        video.play();
      }
    };

    video.ontimeupdate = () => {
      if (video.currentTime >= trimEnd) {
        video.pause();
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Video processing error'));
    };

    const timeout = setTimeout(() => {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      reject(new Error('Video trim timed out'));
    }, (trimEnd - trimStart + 10) * 1000);
  });
}
import { MessageType } from '../types/messages';

const MAX_RUNTIME_VIDEO_BYTES = 4 * 1024 * 1024;

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let currentRecordingId: string | null = null;
let activeStream: MediaStream | null = null;

// IndexedDB helper for storing video blobs
const DB_NAME = 'flowg-video-storage';
const DB_VERSION = 1;
const STORE_NAME = 'video-blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function storeVideoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, key);
    
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getVideoBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function deleteVideoBlob(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

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
    

    // 1. Stop MediaRecorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      
      mediaRecorder.stop();
    }

    // 2. IMPORTANT: Stop all tracks in the stream immediately to remove the yellow border
    if (activeStream) {
      
      activeStream.getTracks().forEach(track => {
        track.stop();
        
      });
      activeStream = null;
    }

    sendResponse({ success: true });
    return false;
  } else if (message.type === 'GET_VIDEO_BLOB') {
    // Handler for the video editor to retrieve the blob
    const { key } = message.data;
    getVideoBlob(key)
      .then(blob => {
        if (blob) {
          if (blob.size > MAX_RUNTIME_VIDEO_BYTES) {
            sendResponse({
              success: false,
              error: 'Video is too large to transfer through runtime messaging; read it directly from IndexedDB'
            });
            return;
          }

          // Use a faster way to transfer data: Base64 string or Uint8Array
          // Array.from() is extremely slow for large videos and crashes the browser
          blob.arrayBuffer().then(buffer => {
            const uint8Array = new Uint8Array(buffer);
            
            // We'll use a chunked approach or base64 if needed, 
            // but standard Uint8Array is supported in modern Chrome message passing
            sendResponse({
              success: true,
              data: {
                videoData: uint8Array,
                type: blob.type,
                size: blob.size
              }
            });
          });
        } else {
          sendResponse({ success: false, error: 'Video blob not found' });
        }
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'TRIM_VIDEO') {
    const { key, trimStart, trimEnd, outputKey } = message.data;
    trimVideo(key, trimStart, trimEnd)
      .then(blob => {
        const trimmedKey = outputKey || `${key}-trimmed-${Date.now()}`;
        storeVideoBlob(trimmedKey, blob).then(() => {
          sendResponse({
            success: true,
            data: {
              videoBlobKey: trimmedKey,
              type: blob.type,
              size: blob.size
            }
          });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'DELETE_VIDEO_BLOB') {
    const { key } = message.data;
    deleteVideoBlob(key)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleStartVideoCapture(recordingId: string) {
  currentRecordingId = recordingId;

  try {
    

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
      

      // If the stream is still active, stop it here as well (backup)
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const duration = 0; // Duration will be calculated from video metadata
      

      try {
        // Store blob in IndexedDB for the video editor (Jam.dev style)
        const blobKey = `recording-${currentRecordingId}`;
        await storeVideoBlob(blobKey, blob);
        
        
        
        // Notify background that video is ready for editing
        chrome.runtime.sendMessage({
          type: MessageType.VIDEO_CAPTURE_READY,
          data: {
            recordingId: currentRecordingId,
            videoBlobKey: blobKey,
            duration,
            size: blob.size,
          }
        });
      } catch (e) {
        console.error('[Offscreen] Failed to store video blob:', e);
        chrome.runtime.sendMessage({
          type: MessageType.RECORDING_ERROR,
          data: {
            recordingId: currentRecordingId,
            error: 'Failed to store video: ' + (e as Error).message
          }
        });
      }
    };

    mediaRecorder.start();
    
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
