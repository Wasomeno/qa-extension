import { MessageType } from '../types/messages';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_THUMBNAIL_INTERNAL') {
    const { url, timeInSeconds } = message.data;
    
    generateThumbnail(url, timeInSeconds)
      .then(dataUrl => sendResponse({ success: true, data: dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true;
  }
});

async function generateThumbnail(videoUrl: string, time: number): Promise<string> {
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

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(time, video.duration || time);
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

    video.addEventListener('error', (e) => {
      clearTimeout(timeout);
      video.remove();
      reject(new Error('Video loading failed in offscreen document'));
    });
  });
}
