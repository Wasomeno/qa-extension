import { videoStorage } from '@/services/video-storage';

async function initializePlayer() {
  const player = document.getElementById('player') as HTMLVideoElement;
  const errorMsg = document.getElementById('error-message') as HTMLDivElement;
  
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showError('No recording ID provided');
    return;
  }

  let attempts = 0;
  const maxAttempts = 5;
  const retryInterval = 2000;

  async function tryLoadVideo() {
    attempts++;
    console.log(`[VideoViewer] Loading attempt ${attempts} for ID: ${id}`);
    
    try {
      const blob = await videoStorage.getVideo(id!);
      if (!blob) {
        if (attempts < maxAttempts) {
          showError(`Recording video not found. Retrying... (${attempts}/${maxAttempts})`);
          setTimeout(tryLoadVideo, retryInterval);
        } else {
          showError('Recording video not found after multiple attempts. It might still be saving or failed to save.');
        }
        return;
      }

      console.log(`[VideoViewer] Video blob found: ${blob.size} bytes`);
      const url = URL.createObjectURL(blob);
      player.src = url;
      if (errorMsg) errorMsg.style.display = 'none';
      if (player) player.style.display = 'block';
      
      player.oncanplay = () => {
        console.log('[VideoViewer] Video can play');
      };

      player.onerror = (e) => {
        showError(`Player error: ${player.error?.message || 'Unknown video error'}`);
      };
      
      // Auto-revoke URL when page is unloaded
      window.addEventListener('unload', () => {
        URL.revokeObjectURL(url);
      });

    } catch (error: any) {
      console.error('[VideoViewer] Load error:', error);
      showError(`Failed to load video: ${error.message}`);
    }
  }

  await tryLoadVideo();

  function showError(text: string) {
    console.error(`[VideoViewer] Error: ${text} (ID: ${id})`);
    if (player) player.style.display = 'none';
    if (errorMsg) {
      errorMsg.innerHTML = `
        <div class="flex flex-col items-center gap-2 text-red-500">
          <p>${text}</p>
          <p class="text-xs text-gray-400">ID: ${id}</p>
          <button onclick="location.reload()" class="mt-2 px-3 py-1 bg-gray-800 text-white rounded text-xs hover:bg-gray-700">
            Retry Now
          </button>
        </div>
      `;
      errorMsg.style.display = 'block';
    }
  }
}

document.addEventListener('DOMContentLoaded', initializePlayer);
