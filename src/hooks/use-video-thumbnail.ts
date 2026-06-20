import { useEffect, useState } from 'react';
import { MessageType } from '@/types/messages';

export function useVideoThumbnail(videoUrl: string, timeInSeconds = 3) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    let isMounted = true;
    setIsLoading(true);

    chrome.runtime.sendMessage(
      {
        type: MessageType.GET_VIDEO_THUMBNAIL,
        data: { url: videoUrl, timeInSeconds },
      },
      response => {
        if (!isMounted) return;

        if (response?.success && response.data) {
          setThumbnail(response.data);
          setError(null);
        } else {
          setError(new Error(response?.error || 'Failed to generate thumbnail'));
        }
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [videoUrl, timeInSeconds]);

  return { thumbnail, isLoading, error };
}
