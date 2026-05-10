import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
} from 'react';
import { User, getCurrentUser } from '../api/user';
import { getGitlabLoginSession } from '../api/auth';

const STORAGE_KEY = 'session_user';
const SESSION_ID_KEY = 'session_id';

/**
 * Hook to manage ephemeral global user state
 * Synchronizes across all extension contexts (Popup, Sidepanel, etc.)
 */
export const useSessionUser = () => {
  const [user, setUserState] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback(async (newUser: User) => {
    // Update local state immediately for instant UI response
    setUserState(newUser);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [STORAGE_KEY]: newUser });
    }
  }, []);

  const storeSessionId = useCallback(async (id: string) => {
    setSessionId(id);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [SESSION_ID_KEY]: id });
    }
  }, []);

  const clearSessionId = useCallback(async () => {
    setSessionId(null);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(SESSION_ID_KEY);
    }
  }, []);

  const clearUser = useCallback(async () => {
    // Update local state immediately
    setUserState(null);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(STORAGE_KEY);
    }
    await clearSessionId();
  }, [clearSessionId]);

  const syncUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCurrentUser();
      
      if (response.success && response.data) {
        
        
        setLoading(false);
        await setUser(response.data);
        // Also fetch and store session_id for background fetch fallback
        try {
          const sessionRes = await getGitlabLoginSession();
          if (sessionRes.success && sessionRes.data?.session_id) {
            await storeSessionId(sessionRes.data.session_id);
          }
        } catch (e) {
          
        }
        return response.data;
      } else {
        setLoading(false);
        await clearUser();
      }
    } catch (err) {
      
      setLoading(false);
      // Keep existing state on network error, but we could clear it here too if desired
    }
    return null;
  }, [setUser, clearUser]);

  // Initial load
  useEffect(() => {
    // Check if chrome.storage.session is available (it might not be in some content script contexts if not configured)
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.get([STORAGE_KEY, SESSION_ID_KEY]).then(result => {
        if (result[STORAGE_KEY]) {
          setUserState(result[STORAGE_KEY]);
        }
        if (result[SESSION_ID_KEY]) {
          setSessionId(result[SESSION_ID_KEY]);
        }
        if (result[STORAGE_KEY]) {
          setLoading(false); // User exists in storage, no need to fetch
        } else {
          // No user in storage - need to check API (syncUser will set loading: false)
          syncUser();
        }
      });
    } else {
      setLoading(false);
    }
  }, [syncUser]);

  // Listen for changes
  useEffect(() => {
    if (!chrome.storage || !chrome.storage.onChanged) return;

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session') {
        if (changes[STORAGE_KEY]) {
          const newValue = changes[STORAGE_KEY].newValue || null;
          // Only update if different to avoid cycles
          setUserState(prev =>
            JSON.stringify(prev) !== JSON.stringify(newValue) ? newValue : prev
          );
        }
        if (changes[SESSION_ID_KEY]) {
          const newValue = changes[SESSION_ID_KEY].newValue || null;
          setSessionId(newValue);
        }
      }
    };

    const handleMessage = (message: any) => {
      if (message.type === 'AUTH_SESSION_UPDATED') {
        syncUser();
      }
    };

    const handleFocus = () => {
      // Don't auto-refetch on focus - we want session to remain stable
      // The user session is stored in chrome.storage.session which persists until browser close
      // Explicit sync only happens when needed (e.g., after login/logout)
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
    }
    window.addEventListener('focus', handleFocus);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncUser]);

  return { user, setUser, syncUser, clearUser, loading, sessionId, storeSessionId, clearSessionId };
};
