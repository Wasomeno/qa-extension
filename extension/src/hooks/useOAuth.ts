import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageType } from '@/types/messages';
import { storageService } from '@/services/storage';

async function sendMessageRetry<T = any>(
  payload: any,
  attempts = 6,
  delayMs = 250
): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    const res = await new Promise<T | null>((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (reply) => {
          const err = chrome.runtime.lastError;
          if (err) {
            lastErr = err;
            resolve(null);
            return;
          }
          resolve(reply as T);
        });
      } catch (e) {
        lastErr = e;
        resolve(null);
      }
    });
    if (res) return res;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const msg = lastErr?.message || String(lastErr || 'Background not reachable');
  throw new Error(msg);
}

export function useOAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<() => void>();

  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  const startGitLab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await sendMessageRetry<any>({ type: MessageType.AUTH_START }, 8, 200);
      if (!payload?.success || !payload?.data?.authUrl) {
        throw new Error(payload?.error || 'Failed to start OAuth');
      }
      // Open OAuth page
      try { window.open(payload.data.authUrl, '_blank'); } catch {}
      // Subscribe to session changes to detect completion
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = storageService.onChanged('session' as any, (s) => {
        const hasToken = !!(s && (s as any).accessToken);
        if (hasToken) {
          // stop listening
          if (unsubRef.current) { unsubRef.current(); unsubRef.current = undefined; }
          setLoading(false);
        }
      });
      return { success: true };
    } catch (e: any) {
      setError(e?.message || 'OAuth failed');
      setLoading(false);
      return { success: false, error: e?.message || 'OAuth failed' };
    }
  }, []);

  return { startGitLab, loading, error };
}

export default useOAuth;
