import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
} from 'react';
import { User, getCurrentUser } from '../api/user';

const STORAGE_KEY = 'session_user';

/**
 * Hook to manage ephemeral global user state
 * Synchronizes across all extension contexts (Popup, Sidepanel, etc.)
 */
export const useSessionUser = () => {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback(async (newUser: User) => {
    // Update local state immediately for instant UI response
    setUserState(newUser);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [STORAGE_KEY]: newUser });
    }
  }, []);

  const clearUser = useCallback(async () => {
    // Update local state immediately
    setUserState(null);
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(STORAGE_KEY);
    }
  }, []);

  const syncUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCurrentUser();
      if (response.success && response.data) {
        await setUser(response.data);
        return response.data;
      } else if (response.success === false) {
        await clearUser();
      }
    } catch (err) {
      // Keep existing state on network error, but we could clear it here too if desired
    } finally {
      setLoading(false);
    }
    return null;
  }, [setUser, clearUser]);

  // Initial load
  useEffect(() => {
    // Check if chrome.storage.session is available (it might not be in some content script contexts if not configured)
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.get(STORAGE_KEY).then(result => {
        if (result[STORAGE_KEY]) {
          setUserState(result[STORAGE_KEY]);
        } else {
          // Auto-check session on mount
          syncUser();
        }
        setLoading(false);
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
      if (areaName === 'session' && changes[STORAGE_KEY]) {
        const newValue = changes[STORAGE_KEY].newValue || null;
        // Only update if different to avoid cycles
        setUserState(prev =>
          JSON.stringify(prev) !== JSON.stringify(newValue) ? newValue : prev
        );
      }
    };

    const handleMessage = (message: any) => {
      if (message.type === 'AUTH_SESSION_UPDATED') {
        syncUser();
      }
    };

    const handleFocus = () => {
      syncUser();
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

  return { user, setUser, syncUser, clearUser, loading };
};
