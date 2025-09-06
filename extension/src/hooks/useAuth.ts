import { useEffect, useMemo, useState } from 'react';
import { storageService, Session } from '@/services/storage';
import { UserData, MessageType } from '@/types/messages';
import { apiService } from '@/services/api';

/**
 * Simpler auth hook: tracks only `session` and recomputes auth state,
 * listens for storage updates and AUTH_SESSION_UPDATED broadcasts.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    let unsubSession: (() => void) | null = null;
    let unsubRuntime: (() => void) | null = null;
    (async () => {
      try {
        const s = await storageService.getSession();
        setSession(s);
        setIsAuthenticated(Boolean(s?.accessToken) && (!s?.expiresAt || Date.now() < (s.expiresAt || 0)));
      } catch {}
      // Storage changes: session only
      unsubSession = storageService.onChanged('session' as any, v => {
        const s = v as Session | undefined;
        setSession(s);
        setIsAuthenticated(Boolean(s?.accessToken) && (!s?.expiresAt || Date.now() < (s?.expiresAt || 0)));
      });
      // Background broadcasts after OAuth completion
      const runtimeListener = (msg: any) => {
        if (msg?.type === MessageType.AUTH_SESSION_UPDATED) {
          // Pull fresh session snapshot
          storageService.getSession().then(s => {
            setSession(s);
            setIsAuthenticated(Boolean(s?.accessToken) && (!s?.expiresAt || Date.now() < (s?.expiresAt || 0)));
          }).catch(() => {});
        }
      };
      chrome.runtime.onMessage.addListener(runtimeListener);
      unsubRuntime = () => chrome.runtime.onMessage.removeListener(runtimeListener);
    })();
    return () => {
      if (unsubSession) unsubSession();
      if (unsubRuntime) unsubRuntime();
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user: (session?.user || null) as UserData | null,
    isAuthenticated,
    logout: async () => {
      await apiService.logout();
      // storageService will broadcast changes; state updates via subscriptions
    },
  }), [session, isAuthenticated]);

  return value;
}

export default useAuth;
