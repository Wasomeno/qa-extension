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
  FiSearch,
} from 'react-icons/fi';
import { Loader } from 'lucide-react';

import { UserData, MessageType } from '@/types/messages';
import { useSessionUser } from '@/hooks/use-session-user';
import { gitlabLogin, logout } from '@/api/auth';
import { isValidDomain, normalizeDomainInput } from '@/utils/domain-matcher';

// Avatar component with error handling
const Avatar: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  console.log('[Avatar] Render - src:', src, 'imgError:', imgError, 'imgLoaded:', imgLoaded);

  return (
    <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
      {src && !imgError && (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className={`w-full h-full object-cover ${imgLoaded ? '' : 'hidden'}`}
          onLoad={() => {
            setImgLoaded(true);
            console.log('[Avatar] Image loaded successfully:', src);
          }}
          onError={() => {
            setImgError(true);
            console.log('[Avatar] Image failed to load:', src);
          }}
        />
      )}
      <FiUser className={`w-6 h-6 ${imgLoaded && !imgError ? 'hidden' : 'text-gray-500'}`} />
    </div>
  );
};

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
  const [searchQuery, setSearchQuery] = useState('');

  // Initialization effect
  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    const mapUserToUserData = (u: any): UserData => {
      console.log('[mapUserToUserData] Input user object:', u);
      console.log('[mapUserToUserData] avatar_url value:', u?.avatar_url);
      return {
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
      };
    };

    const init = async () => {
      try {
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
      } catch (err) {
        console.error('[Popup] init error:', err);
        // Fallback to login on error
        setState(prev => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          currentView: 'login',
          whitelist: [],
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

  // Filtered whitelist based on search query
  const filteredWhitelist = state.whitelist.filter(domain =>
    domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      <div className="flex w-full h-[500px] bg-white items-center justify-center extension-popup font-sans">
        <Loader className="h-10 w-10 animate-spin text-gray-400" />
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
    const logoUrl =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('assets/flowg-logo.png')
        : '/assets/flowg-logo.png';

    return (
      <div className="flex flex-col w-full h-[500px] bg-white relative overflow-hidden extension-popup font-sans">
        <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 space-y-4">
          <div className="flex flex-col items-center">
            <div className="relative group">
              <img
                src={logoUrl}
                alt="FlowG"
                className="relative h-7 object-contain"
                onError={(e) => {
                  // Fallback if logo doesn't load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<span class="font-bold text-xl text-gray-900">Flowg</span>';
                }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1 text-center">
              Authenticate to access your dashboard
            </p>
          </div>

          <div className="w-full space-y-6 pt-4">
            <AnimatePresence>
              {state.error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-2 border border-red-100"
                >
                  <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{state.error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full h-12 bg-[#FC6D26] hover:bg-[#E24329] text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-200 flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-80"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Waiting for GitLab...</span>
                  </>
                ) : (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5 fill-current transition-transform group-hover:scale-110"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="m22 13.29-3.33-10a.42.42 0 0 0-.8 0L15 10.94h-6L6.13 3.29a.42.42 0 0 0-.8 0L2 13.29a.91.91 0 0 0 .2.85L12 22l9.8-7.86a.91.91 0 0 0 .2-.85Z" />
                    </svg>
                    <span>Continue with GitLab</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-gray-400 px-4">
                By logging in, you agree to our Terms of Service and Privacy Policy.
              </p>
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

  const logoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('assets/flowg-logo.png')
      : '/assets/flowg-logo.png';

  return (
    <div className="flex flex-col w-full h-[500px] bg-white text-slate-900 overflow-hidden extension-popup font-sans">
      {/* Header matching main menu modal */}
      <header className="px-4 py-3 border-b border-gray-200/60 flex items-center justify-between bg-white z-10 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src={logoUrl}
            alt="FlowG"
            className="h-5 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = '<span class="font-bold text-lg text-gray-900">Flowg</span>';
            }}
          />
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
          title="Sign Out"
        >
          <FiLogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">
        {/* Alerts */}
        <AnimatePresence>
          {state.error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 border border-red-100 mb-4">
                <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{state.error}</p>
              </div>
            </motion.div>
          )}
          {state.success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-start gap-2 border border-green-100 mb-4">
                <div className="w-4 h-4 shrink-0 mt-0.5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px]">✓</div>
                <p>{state.success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Card */}
        {state.user && (
          <div className="bg-white rounded-xl p-4 border border-gray-200/60 shadow-sm flex items-center gap-3 group hover:border-gray-300 transition-colors">
            <span className="hidden">DEBUG: avatarUrl={state.user.avatarUrl}</span>
            {state.user.avatarUrl ? (
              <img src={state.user.avatarUrl} alt={state.user.fullName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FC6D26] text-white">
                <span className="text-sm font-medium">
                  {(state.user.fullName || state.user.username || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 truncate text-sm">{state.user.fullName}</h2>
              <p className="text-xs text-gray-500 truncate mt-0.5">{state.user.email}</p>
            </div>
          </div>
        )}

        {/* Domains Section */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <FiGlobe className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">Target Domains</h3>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
            <div className="p-3 border-b border-gray-100 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. gitlab.com"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:bg-white focus:border-[#FC6D26] focus:ring-1 focus:ring-[#FC6D26] transition-all placeholder:text-gray-400"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                />
                <button
                  onClick={handleAddDomain}
                  className="bg-white border border-gray-200 text-gray-700 p-2 px-3 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
                >
                  <FiPlus className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter domains..."
                  className="w-full bg-transparent border-none text-sm outline-none pl-9 pr-3 py-1 text-gray-600 placeholder:text-gray-400"
                />
              </div>
            </div>

            <div className="flex flex-col max-h-[220px] overflow-y-auto bg-white custom-scrollbar">
              {filteredWhitelist.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">
                  {searchQuery ? 'No matching domains' : 'No domains whitelisted'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredWhitelist.map((domain) => (
                    <div key={domain} className="flex items-center justify-between px-4 py-3 group hover:bg-gray-50 transition-colors">
                      <span className="text-sm text-gray-700 font-medium truncate pr-4">{domain}</span>
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        className="text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all p-1.5 rounded-md hover:bg-red-50"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <div className="py-3 text-center bg-white border-t border-gray-200/60 shrink-0">
        <span className="text-[10px] text-gray-400 font-medium tracking-wide">
          Flowg v1.0.0
        </span>
      </div>
    </div>
  );
};

// Shared root reference to prevent double initialization
let popupRoot: ReturnType<typeof createRoot> | null = null;

function initPopup() {
  const container = document.getElementById('popup-root');
  if (!container || popupRoot) {
    return; // Already initialized or container not found
  }

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

    popupRoot = createRoot(container);
    popupRoot.render(<PopupApp />);
  } catch (error) {
    container.innerHTML =
      '<div class="error">Failed to load extension. Please refresh.</div>';
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  // DOM already loaded
  initPopup();
}

export default PopupApp;
