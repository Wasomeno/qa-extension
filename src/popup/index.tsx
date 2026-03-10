import '@/utils/patch-chrome-messaging';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/globals.css';
import {
  FiUser,
  FiGitlab,
  FiLogOut,
  FiAlertTriangle,
  FiGlobe,
  FiPlus,
  FiTrash2,
} from 'react-icons/fi';
import { Loader } from 'lucide-react';

import { UserData, MessageType } from '@/types/messages';
import { useSessionUser } from '@/hooks/use-session-user';
import { gitlabLogin, logout } from '@/api/auth';
import { isValidDomain, normalizeDomainInput } from '@/utils/domain-matcher';

interface PopupState {
  currentView: 'dashboard' | 'login' | 'loading';
  user: UserData | null;
  isAuthenticated: boolean;
  error: string | null;
  success: string | null;
  whitelist: string[];
}

const PopupApp: React.FC = () => {
  const { user: sessionUser, loading: sessionLoading } = useSessionUser();
  const [state, setState] = useState<PopupState>({
    currentView: 'loading',
    user: null,
    isAuthenticated: false,
    error: null,
    success: null,
    whitelist: [],
  });

  const [newDomain, setNewDomain] = useState('');

  // Initialization effect
  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    const mapUserToUserData = (u: any): UserData => ({
      id: String(u.id),
      email: u.email || '',
      username: u.username || '',
      fullName: u.name || '',
      avatarUrl: u.avatar_url,
      gitlabConnected: true,
      slackConnected: false,
      preferences: {
        notificationSettings: { desktop: true, sound: true },
      },
    });

    const init = async () => {
      const result = await chrome.storage.local.get(['url_whitelist']);
      const whitelist = result.url_whitelist || [];

      if (sessionUser) {
        setState(prev => ({
          ...prev,
          user: mapUserToUserData(sessionUser),
          isAuthenticated: true,
          currentView: 'dashboard',
          whitelist,
        }));
      } else {
        setState(prev => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          currentView: 'login',
          whitelist,
        }));
      }
    };

    void init();
  }, [sessionUser, sessionLoading]);

  const [isLoading, setIsLoading] = useState(false);

  const clearMessage = (): void => {
    setState(prev => ({
      ...prev,
      error: null,
      success: null,
    }));
  };

  // Auto-clear messages after 3 seconds
  useEffect(() => {
    if (state.error || state.success) {
      const timer = setTimeout(clearMessage, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.error, state.success]);

  const handleAddDomain = async () => {
    const normalized = normalizeDomainInput(newDomain);
    if (!isValidDomain(normalized)) {
      setState(prev => ({ ...prev, error: 'Invalid domain format' }));
      return;
    }

    if (state.whitelist.includes(normalized)) {
      setState(prev => ({ ...prev, error: 'Domain already in whitelist' }));
      return;
    }

    const updatedWhitelist = [...state.whitelist, normalized];
    await chrome.storage.local.set({ url_whitelist: updatedWhitelist });
    setState(prev => ({
      ...prev,
      whitelist: updatedWhitelist,
      success: 'Domain added'
    }));
    setNewDomain('');
  };

  const handleRemoveDomain = async (domain: string) => {
    const updatedWhitelist = state.whitelist.filter(d => d !== domain);
    await chrome.storage.local.set({ url_whitelist: updatedWhitelist });
    setState(prev => ({
      ...prev,
      whitelist: updatedWhitelist,
      success: 'Domain removed'
    }));
  };

  if (state.currentView === 'loading') {
    return (
      <div className="flex flex-col h-full w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
        <div className="absolute inset-0 glass-bg-dots opacity-30"></div>
        <div className="relative z-10 flex flex-1 flex-col justify-center items-center p-6">
          <div className="glass-card p-8 space-y-6 text-center">
            <Loader className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900">Loading...</h2>
            <p className="text-sm text-gray-600">
              Checking authentication status
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const response = await gitlabLogin();
      if (response.success && response.data?.url) {
        chrome.tabs.create({ url: response.data.url });
        window.close();
      } else {
        setState(prev => ({
          ...prev,
          error: response.error || 'Failed to initiate login',
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Login failed. Please check your connection.',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  if (state.currentView === 'login') {
    return (
      <div className="flex flex-col flex-1 w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
        <div className="absolute inset-0 glass-bg-dots opacity-30"></div>
        <div className="relative z-10 flex flex-1 flex-col justify-center p-6">
          <div className="glass-card p-8 space-y-6">
            <div className="space-y-2 text-center mb-6">
              <h1 className="font-bold text-xl text-gray-900">
                Flowg
              </h1>
              <p className="text-sm text-gray-600">Sign in with GitLab</p>
            </div>
            <div className="flex justify-center w-full">
              <AnimatePresence>
                {state.error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm font-medium glass-glow-red text-red-800"
                  >
                    <FiAlertTriangle />
                    {state.error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-6">
              <div className="text-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="w-full glass-button glass-glow-blue p-4 flex items-center justify-center gap-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <FiGitlab className="w-5 h-5" />
                      Sign in with GitLab
                    </>
                  )}
                </motion.button>
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Secure authentication via GitLab OAuth
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await logout();
      setState(prev => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        currentView: 'login',
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Logout failed',
      }));
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
      <div className="absolute inset-0 glass-bg-grid opacity-20"></div>
      <div className="relative z-10 p-6 flex flex-col gap-6">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-gray-900">Flowg</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Authenticated</p>
        </div>

        {state.error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg text-sm font-medium glass-glow-red text-red-800"
          >
            <FiAlertTriangle />
            {state.error}
          </motion.div>
        )}

        {state.success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg text-sm font-medium glass-glow-blue text-blue-800"
          >
            {state.success}
          </motion.div>
        )}

        {state.user && (
          <div className="glass-panel flex items-center gap-3 p-4 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
              {state.user.avatarUrl ? (
                <img
                  src={state.user.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <FiUser className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {state.user.fullName}
              </div>
              <div className="text-sm text-gray-600 truncate">{state.user.email}</div>
            </div>
          </div>
        )}

        <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FiGlobe className="w-4 h-4" />
            Target Domains
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g. gitlab.com"
              className="flex-1 bg-white/50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            />
            <button
              onClick={handleAddDomain}
              className="glass-button p-2 text-blue-600"
            >
              <FiPlus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
            {state.whitelist.length === 0 ? (
              <div className="text-xs text-gray-500 italic text-center py-2">
                No domains whitelisted. The trigger will not appear on any site.
              </div>
            ) : (
              state.whitelist.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between bg-white/40 rounded-lg px-3 py-2 text-xs text-gray-700"
                >
                  <span className="truncate">{domain}</span>
                  <button
                    onClick={() => handleRemoveDomain(domain)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full glass-button glass-glow-red p-4 flex items-center justify-center gap-3 font-medium"
          >
            <FiLogOut className="w-5 h-5" />
            Sign Out
          </motion.button>
        </div>

        <div className="mt-auto pt-6 text-center">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
            Flowg v1.0.0
          </span>
        </div>
      </div>
    </div>
  );
};

// Initialize the popup
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('popup-root');
  if (container) {
    try {
      document.body.classList.add('qa-theme-light');
      document.body.classList.remove('qa-theme-dark');

      const loadingContent = document.querySelector('.loading');
      const contentContainer = document.querySelector('.content');

      if (loadingContent) {
        (loadingContent as HTMLElement).style.display = 'none';
      }
      if (contentContainer) {
        (contentContainer as HTMLElement).style.display = 'none';
      }

      const root = createRoot(container);
      root.render(<PopupApp />);
    } catch (error) {
      container.innerHTML =
        '<div class="error">Failed to load extension. Please refresh.</div>';
    }
  }
});

if (document.readyState !== 'loading') {
  const container = document.getElementById('popup-root');
  if (container && !container.hasChildNodes()) {
    try {
      try {
        document.body.classList.add('qa-theme-light');
      } catch {}
      const loadingContent = document.querySelector('.loading');
      const contentContainer = document.querySelector('.content');

      if (loadingContent) {
        (loadingContent as HTMLElement).style.display = 'none';
      }
      if (contentContainer) {
        (contentContainer as HTMLElement).style.display = 'none';
      }

      const root = createRoot(container);
      root.render(<PopupApp />);
    } catch (error) {}
  }
}

export default PopupApp;
