import { useState, useEffect, useCallback } from 'react';
import { User, getCurrentUser } from '../api/user';

const STORAGE_KEY = 'session_user';

/**
 * Hook to manage ephemeral global user state
 * Synchronizes across all extension contexts (Popup, Sidepanel, etc.)
 */
export const useSessionUser = () => {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      console.warn('chrome.storage.session is not available in this context');
      setLoading(false);
    }
  }, []);

  // Listen for changes
  useEffect(() => {
    if (!chrome.storage || !chrome.storage.onChanged) return;

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session' && changes[STORAGE_KEY]) {
        setUserState(changes[STORAGE_KEY].newValue || null);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const setUser = useCallback(async (newUser: User) => {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [STORAGE_KEY]: newUser });
    }
  }, []);

  const syncUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCurrentUser();
      if (response.success && response.data) {
        await setUser(response.data);
        return response.data;
      }
    } catch (err) {
      console.error('Failed to sync user session:', err);
    } finally {
      setLoading(false);
    }
    return null;
  }, [setUser]);

  const clearUser = useCallback(async () => {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(STORAGE_KEY);
    }
  }, []);

  return { user, setUser, syncUser, clearUser, loading };
};
