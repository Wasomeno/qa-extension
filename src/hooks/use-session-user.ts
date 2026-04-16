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
      console.log('[useSessionUser] API response:', response);
      if (response.success && response.data) {
        console.log('[useSessionUser] User data:', response.data);
        console.log('[useSessionUser] avatar_url:', response.data.avatar_url);
        setLoading(false);
        await setUser(response.data);
        return response.data;
      } else {
        setLoading(false);
        await clearUser();
      }
    } catch (err) {
      console.log('[useSessionUser] Error:', err);
      setLoading(false);
      // Keep existing state on network error, but we could clear it here too if desired
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

  return { user, setUser, syncUser, clearUser, loading };
};
