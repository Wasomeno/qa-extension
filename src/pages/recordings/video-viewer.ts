async function initializePlayer() {
  const player = document.getElementById('player') as HTMLVideoElement;
  const errorMsg = document.getElementById('error-message') as HTMLDivElement;
  
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showError('No recording ID provided');
    return;
  }

  const publicDomain = process.env.R2_PUBLIC_DOMAIN || 'https://pub-03dd816d26684f7fba942512f600ddf5.r2.dev';
  const videoUrl = `${publicDomain}/${id}.webm`;

  console.log(`[VideoViewer] Loading video from R2: ${videoUrl}`);
  
  try {
    player.src = videoUrl;
    if (errorMsg) errorMsg.style.display = 'none';
    if (player) player.style.display = 'block';
    
    player.oncanplay = () => {
      console.log('[VideoViewer] Video can play');
    };

    player.onerror = () => {
      // If R2 fails, it might not be uploaded yet or failed
      showError('Recording video not found on R2. It might still be uploading or failed to save.');
    };

  } catch (error: any) {
    console.error('[VideoViewer] Load error:', error);
    showError(`Failed to load video: ${error.message}`);
  }

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
