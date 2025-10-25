import '@/utils/patch-chrome-messaging';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/globals.css';
import {
  FiSettings,
  FiUser,
  FiGitlab,
  FiSlack,
  FiLogOut,
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiCamera,
  FiFileText,
} from 'react-icons/fi';
import { Loader } from 'lucide-react';

import { apiService } from '@/services/api';
import { storageService } from '@/services/storage';
import useOAuth from '@/hooks/useOAuth';
import { UserData, MessageType } from '@/types/messages';

interface PopupState {
  currentView: 'dashboard' | 'login' | 'loading';
  user: UserData | null;
  isAuthenticated: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  recentScreenshots: Array<{
    screenshot: string;
    url?: string;
    title?: string;
    timestamp: number;
  }>;
  error: string | null;
  success: string | null;
}

const PopupApp: React.FC = () => {
  console.log('🎯 PopupApp component mounting...');

  const [state, setState] = useState<PopupState>({
    currentView: 'loading',
    user: null,
    isAuthenticated: false,
    connectionStatus: 'connecting',
    recentScreenshots: [],
    error: null,
    success: null,
  });

  console.log('🎯 Initial state set:', state.currentView);

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const initializationCompleted = useRef(false);
  const { startGitLab, loading: oAuthLoading, error: oAuthError } = useOAuth();
  const keepaliveRef = useRef<chrome.runtime.Port | null>(null);

  // Removed eager keepalive port from popup to avoid MV3 race
  useEffect(() => {
    return () => {
      try {
        keepaliveRef.current?.disconnect();
      } catch {}
      keepaliveRef.current = null;
    };
  }, []);

  // Legacy OAuth helpers removed — background handles OAuth and writes session.

  useEffect(() => {
    // Note: Previously had a debug timeout that forced exit from loading.
    // It has been removed to avoid interrupting normal initialization.

    const handleInitialization = async () => {
      console.log('🚀 Starting popup initialization...');

      // Test storage service immediately
      try {
        console.log('🧪 Testing storage service...');
        const testResult = await storageService.getAll();
        console.log('🧪 Storage service test result:', testResult);

        // Test API service
        try {
          console.log('🧪 Testing API service health check...');
          const healthResult = await apiService.healthCheck();
          console.log('🧪 API health check result:', healthResult);
        } catch (e) {
          console.warn('🧪 Health check failed (non-fatal in popup init):', e);
        }
      } catch (testError) {
        console.error('🧪 Service tests failed:', testError);
      }

      // OAuth session handled by background; proceed with normal initialization
      await initialize();
      initializationCompleted.current = true;
    };

    // Initialize popup normally
    const initialize = async () => {
      try {
        console.log('🚀 Starting initialization...');
        await initializePopup();
        console.log('✅ Initialization completed successfully');
      } catch (error) {
        console.error('❌ Primary initialization failed:', error);
        setState(prev => ({
          ...prev,
          currentView: 'login',
          error: 'Failed to initialize extension',
        }));
      }
    };

    console.log('🚀 STARTING INITIALIZATION - SINGLE CALL');
    handleInitialization();

    // Fallback timeout - if initialization takes too long, show login
    const fallbackTimeout = setTimeout(() => {
      if (!initializationCompleted.current) {
        console.error(
          '⏰ Initialization timed out after 8 seconds, forcing login view'
        );
        setState(prev => {
          if (prev.currentView === 'loading') {
            console.log('⏰ TIMEOUT: Forcing transition from loading to login');
            return {
              ...prev,
              currentView: 'login',
              connectionStatus: 'disconnected',
              error: 'Initialization timed out. Please try again.',
              isAuthenticated: false,
              user: null,
            };
          }
          return prev;
        });
        initializationCompleted.current = true;
      }
    }, 8000); // 8 second timeout

    return () => {
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const initializePopup = async (): Promise<void> => {
    try {
      console.log('🔍 Initializing popup...');

      // First, let's see ALL storage data
      const allStorage = await storageService.getAll();
      console.log('🔍 ALL STORAGE DATA:', allStorage);

      // Check authentication status step by step
      const auth = await storageService.getAuth();
      console.log('🔍 Raw auth data:', auth);

      const isAuthenticated = await storageService.isAuthenticated();
      console.log('🔍 isAuthenticated result:', isAuthenticated);

      const user = await storageService.getUser();
      console.log('🔍 User data:', user);

      // Add timeout safety check
      if (!initializationCompleted.current) {
        console.log('🔍 Setting initializationCompleted flag');
        initializationCompleted.current = true;
      }

      console.log('🔍 Current stored data summary:', {
        isAuthenticated,
        hasUser: !!user,
        hasAuth: !!auth,
        userEmail: user?.email,
        tokenExists: !!auth?.jwtToken,
        refreshTokenExists: !!auth?.refreshToken,
        expiresAt: auth?.expiresAt,
        tokenExpired: auth?.expiresAt
          ? Date.now() > auth.expiresAt
          : 'no expiry',
        currentTime: Date.now(),
      });

      console.log('🔍 Auth check results:', {
        isAuthenticated,
        hasUser: !!user,
        hasAuth: !!auth,
        hasJwtToken: !!auth?.jwtToken,
        hasRefreshToken: !!auth?.refreshToken,
        tokenExpiry: auth?.expiresAt
          ? new Date(auth.expiresAt).toISOString()
          : 'none',
        currentTime: new Date().toISOString(),
      });

      if (isAuthenticated && user) {
        console.log('🟢 AUTHENTICATED PATH: User found and authenticated');
        console.log('🟢 Setting currentView to dashboard...');

        setState(prev => {
          console.log('🟢 setState: dashboard - prev state:', prev.currentView);
          const newState = {
            ...prev,
            isAuthenticated: true,
            user,
            currentView: 'dashboard' as const,
            connectionStatus: 'connected' as const,
            error: null, // Clear any previous errors
          };
          console.log('🟢 New state set:', newState.currentView);
          console.log('🟢 STATE UPDATE: Loading -> Dashboard SUCCESSFUL');
          return newState;
        });

        console.log('🟢 Dashboard state set, loading additional data...');
      } else {
        console.log(
          '🔴 NOT AUTHENTICATED PATH: isAuthenticated=',
          isAuthenticated,
          'user=',
          !!user
        );
        console.log('🔴 Setting currentView to login...');

        setState(prev => {
          console.log('🔴 setState: login - prev state:', prev.currentView);
          const newState = {
            ...prev,
            currentView: 'login' as const,
            connectionStatus: 'disconnected' as const,
            isAuthenticated: false,
            user: null,
            error: null, // Clear any previous errors
          };
          console.log('🔴 New state set:', newState.currentView);
          console.log('🔴 STATE UPDATE: Loading -> Login SUCCESSFUL');
          return newState;
        });
      }
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      setState(prev => ({
        ...prev,
        error:
          'Failed to initialize extension: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
        connectionStatus: 'disconnected',
        currentView: 'login',
        isAuthenticated: false,
        user: null,
      }));
    }
  };

  const checkConnection = async (): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        connectionStatus: 'connecting',
      }));

      const response = await apiService.healthCheck();
      setState(prev => ({
        ...prev,
        connectionStatus: response.success ? 'connected' : 'disconnected',
      }));
    } catch (error) {
      console.warn('Connection check failed:', error);
      setState(prev => ({
        ...prev,
        connectionStatus: 'disconnected',
      }));
    }
  };

  const setFloatingTriggerVisibility = async (
    tabId: number,
    visible: boolean,
    reason: 'auto' | 'manual' = 'auto'
  ): Promise<boolean> => {
    return await new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(
          tabId,
          {
            type: MessageType.SET_FLOATING_TRIGGER_VISIBILITY,
            data: { visible, reason },
          },
          response => {
            const err = chrome.runtime.lastError;
            if (err) {
              resolve(false);
              return;
            }
            if (response && response.success === false) {
              resolve(false);
              return;
            }
            resolve(true);
          }
        );
      } catch (error) {
        console.warn(
          'Popup: Failed to toggle floating trigger visibility',
          error
        );
        resolve(false);
      }
    });
  };

  const withFloatingTriggerHidden = async <T,>(
    tab: chrome.tabs.Tab | undefined,
    action: () => Promise<T>
  ): Promise<T> => {
    let hid = false;
    if (tab?.id) {
      try {
        hid = await setFloatingTriggerVisibility(tab.id, false, 'auto');
      } catch (error) {
        console.warn('Popup: Failed to hide floating trigger', error);
      }
    }

    try {
      return await action();
    } finally {
      if (tab?.id && hid) {
        try {
          await setFloatingTriggerVisibility(tab.id, true, 'auto');
        } catch (error) {
          console.warn('Popup: Failed to restore floating trigger', error);
        }
      }
    }
  };

  // Removed recent screenshots loader

  const handleLogout = async (): Promise<void> => {
    try {
      await apiService.logout();

      // Clear all stored data
      await storageService.remove('auth');
      await storageService.remove('user');
      await storageService.remove('settings');

      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        currentView: 'login',
        connectionStatus: 'disconnected',
        success: 'Logged out successfully',
        error: null,
      }));
    } catch (error) {
      console.error('Logout failed:', error);

      // Force clear storage even if API call fails
      await storageService.remove('auth');
      await storageService.remove('user');
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        currentView: 'login',
        connectionStatus: 'disconnected',
        success: 'Logged out successfully',
        error: null,
      }));
    }
  };

  const handleQuickCapture = async (): Promise<void> => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        setState(prev => ({
          ...prev,
          error: 'No active tab found',
        }));
        return;
      }

      if (
        tab.url?.startsWith('chrome://') ||
        tab.url?.startsWith('chrome-extension://') ||
        tab.url?.startsWith('edge://') ||
        tab.url?.startsWith('moz-extension://')
      ) {
        setState(prev => ({
          ...prev,
          error: 'Cannot capture screenshots on browser internal pages',
        }));
        return;
      }

      const isTabEligible = (t?: chrome.tabs.Tab) => {
        if (!t || !t.url) return false;
        const url = t.url;
        const disallowed = [
          'chrome://',
          'chrome-extension://',
          'edge://',
          'moz-extension://',
          'about:',
          'devtools://',
          'view-source:',
          'brave://',
          'opera://',
        ];
        if (disallowed.some(p => url.startsWith(p))) return false;
        if (
          url.startsWith('https://chrome.google.com/webstore') ||
          url.startsWith('https://chromewebstore.google.com')
        ) {
          return false;
        }
        return true;
      };

      if (!isTabEligible(tab)) {
        setState(prev => ({
          ...prev,
          error: 'This page does not allow content scripts',
        }));
        return;
      }

      let contentScriptAvailable = false;
      try {
        const response = await new Promise<any>(resolve => {
          chrome.tabs.sendMessage(tab.id!, { type: 'PING' }, reply => {
            const _ = chrome.runtime.lastError;
            resolve(reply);
          });
        });
        contentScriptAvailable = !!response;
      } catch (error) {
        console.log('Content script not available, injecting...');
      }

      if (!contentScriptAvailable) {
        try {
          if (chrome.scripting && chrome.scripting.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
          } else {
            await new Promise<void>((resolve, reject) => {
              try {
                chrome.tabs.executeScript(
                  tab.id!,
                  { file: 'content.js' },
                  () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                      reject(
                        new Error(
                          err.message || 'Legacy executeScript injection failed'
                        )
                      );
                      return;
                    }
                    resolve();
                  }
                );
              } catch (err) {
                reject(
                  err instanceof Error
                    ? err
                    : new Error('Failed to call tabs.executeScript')
                );
              }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (injectionError) {
          console.log('Content script injection failed:', injectionError);
          setState(prev => ({
            ...prev,
            error: 'Unable to inject content script on this page',
          }));
          return;
        }
      }

      await withFloatingTriggerHidden(tab, async () => {
        try {
          const response = await new Promise<any>(resolve => {
            chrome.tabs.sendMessage(
              tab.id!,
              { type: MessageType.CAPTURE_ELEMENT, data: {} },
              reply => {
                const _ = chrome.runtime.lastError;
                resolve(reply);
              }
            );
          });

          if (response && response.success) {
            setState(prev => ({
              ...prev,
              success: 'Screenshot captured and saved as draft!',
            }));
          } else {
            setState(prev => ({
              ...prev,
              error: response?.error || 'Failed to capture screenshot',
            }));
          }
        } catch (messageError) {
          console.error(
            'Message sending failed, trying fallback:',
            messageError
          );
          await handleSimpleScreenshotCapture(tab);
        }
      });
    } catch (error) {
      console.error('Quick capture error:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to capture screenshot',
      }));
    }
  };

  const handleSimpleScreenshotCapture = async (
    tab: chrome.tabs.Tab
  ): Promise<void> => {
    await withFloatingTriggerHidden(tab, async () => {
      try {
        console.log('Attempting simple screenshot capture...');

        const response = await new Promise<any>(resolve => {
          chrome.runtime.sendMessage(
            { type: MessageType.CAPTURE_SCREENSHOT },
            reply => {
              const _ = chrome.runtime.lastError;
              resolve(reply);
            }
          );
        });

        if (response && response.success) {
          console.log('Simple screenshot captured, saving manually...');

          setState(prev => ({
            ...prev,
            success: 'Screenshot captured and saved as draft!',
          }));
        } else {
          console.log(
            'Simple capture returned no success, trying direct capture...'
          );
          await handleDirectCapture(tab);
        }
      } catch (error) {
        console.error('Simple screenshot capture failed:', error);
        console.log(
          'Simple capture failed with exception, trying direct capture...'
        );
        await handleDirectCapture(tab);
      }
    });
  };

  const handleDirectCapture = async (tab: chrome.tabs.Tab): Promise<void> => {
    await withFloatingTriggerHidden(tab, async () => {
      try {
        console.log('Attempting direct capture without background script...');

        await chrome.tabs.captureVisibleTab();
        console.log('Direct screenshot captured successfully');

        setState(prev => ({
          ...prev,
          success: 'Screenshot captured and saved as draft!',
        }));
      } catch (error) {
        console.error('Direct capture failed:', error);
        setState(prev => ({
          ...prev,
          error: `Screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }));
      }
    });
  };

  const handleFallbackCapture = async (tab: chrome.tabs.Tab): Promise<void> => {
    await withFloatingTriggerHidden(tab, async () => {
      try {
        console.log('Attempting fallback capture for tab:', tab.id, tab.url);

        const response = await new Promise<any>(resolve => {
          chrome.runtime.sendMessage(
            {
              type: MessageType.FALLBACK_QUICK_CAPTURE,
              data: { tabId: tab.id, url: tab.url, title: tab.title },
            },
            reply => {
              const _ = chrome.runtime.lastError;
              resolve(reply);
            }
          );
        });

        console.log('Fallback capture response:', response);

        if (response && response.success) {
          setState(prev => ({
            ...prev,
            success: 'Screenshot captured and saved as draft!',
          }));
        } else {
          const errorMsg =
            response?.error ||
            'Failed to capture screenshot using fallback method';
          console.error('Fallback capture failed with error:', errorMsg);
          setState(prev => ({
            ...prev,
            error: errorMsg,
          }));
        }
      } catch (error) {
        console.error('Fallback capture exception:', error);
        console.log('Trying direct capture as last resort...');
        await handleDirectCapture(tab);
      }
    });
  };

  const openOptionsPage = (): void => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  // Removed screenshot timestamp formatting

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

  // React to background-auth completion via session changes
  useEffect(() => {
    const unsub = storageService.onChanged('session' as any, async s => {
      const token = (s as any)?.accessToken;
      if (token) {
        const user = await storageService.getUser();
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: user || (s as any)?.user || null,
          currentView: 'dashboard',
          error: null,
        }));
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

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

  if (state.currentView === 'login') {
    return (
      <div className="flex flex-col flex-1 w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
        <div className="absolute inset-0 glass-bg-dots opacity-30"></div>
        <div className="relative z-10 flex flex-1 flex-col justify-center p-6">
          <div className="glass-card p-8 space-y-6">
            <div className="space-y-2 text-center mb-6">
              <h1 className="font-bold text-xl text-gray-900">
                Gitlab Companion
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
                  onClick={async () => {
                    setIsLoading(true);
                    const r = await startGitLab();
                    if (!r.success) {
                      setState(prev => ({
                        ...prev,
                        error: oAuthError || 'Failed to initiate GitLab OAuth',
                      }));
                    } else {
                      setState(prev => ({
                        ...prev,
                        success:
                          'OAuth window opened. Please complete authentication...',
                      }));
                    }
                    setIsLoading(false);
                  }}
                  disabled={isLoading || oAuthLoading}
                  className="w-full glass-button glass-glow-blue p-4 flex items-center justify-center gap-3 font-medium"
                >
                  {isLoading || oAuthLoading ? (
                    <FiRefreshCw className="animate-spin text-lg" />
                  ) : (
                    <FiGitlab className="text-lg text-orange-400" />
                  )}
                  {isLoading || oAuthLoading
                    ? 'Connecting...'
                    : 'Sign in with GitLab'}
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

  return (
    <div className="flex flex-col h-full w-full max-w-sm mx-auto glass-bg-pattern relative overflow-hidden">
      <div className="absolute inset-0 glass-bg-grid opacity-20"></div>
      {/* Header */}
      <div className="relative z-10 glass-nav p-4">
        <div className="flex justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Gitlab Companion
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  state.connectionStatus === 'connected'
                    ? 'bg-green-500'
                    : state.connectionStatus === 'connecting'
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-red-500'
                }`}
              />
              <span className="text-xs text-gray-600">
                {state.connectionStatus === 'connected'
                  ? 'Connected'
                  : state.connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Offline'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkConnection}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <FiRefreshCw />
            </button>
            <button
              type="button"
              onClick={openOptionsPage}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <FiSettings />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Logout"
            >
              <FiLogOut />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {state.error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative z-10 flex items-center gap-2 p-3 mx-4 mb-4 glass-glow-red text-sm font-medium text-red-800"
          >
            <FiAlertTriangle />
            {state.error}
          </motion.div>
        )}

        {state.success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative z-10 flex items-center gap-2 p-3 mx-4 mb-4 glass-glow-green text-sm font-medium text-green-800"
          >
            <FiCheckCircle />
            {state.success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Info */}
      {state.user && (
        <div className="relative z-10 glass-panel flex items-center gap-3 p-4 mx-4 mt-4 rounded-2xl">
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 overflow-hidden">
            {state.user.avatarUrl ? (
              <img
                src={state.user.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <FiUser />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900">
              {state.user.fullName}
            </div>
            <div className="text-sm text-gray-600">{state.user.email}</div>
          </div>
          <div className="flex items-center gap-2">
            {state.user.gitlabConnected && (
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                <FiGitlab />
                GitLab
              </div>
            )}
            {state.user.slackConnected && (
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                <FiSlack />
                Slack
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Screenshots removed */}
      {false && state.recentScreenshots.length > 0 && (
        <div className="relative z-10 p-4">
          <h3 className="font-medium text-gray-900 mb-3">Recent Screenshots</h3>
          <div className="space-y-2">
            {state.recentScreenshots.map((screenshot, index) => (
              <div
                key={index}
                className="glass-card flex items-center justify-between p-3 hover:glass-shimmer transition-all duration-300"
              >
                <div className="flex items-center gap-3 flex-1">
                  <img
                    src={screenshot.screenshot}
                    alt="Screenshot preview"
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {screenshot.title || 'Untitled Page'}
                    </div>
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                      <span>
                        {new Date(screenshot.timestamp).toLocaleString()}
                      </span>
                      {screenshot.url && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-32">
                            {new URL(screenshot.url).hostname}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      // Open screenshot in new tab
                      const newTab = window.open();
                      if (newTab) {
                        newTab.document.write(`
                          <html>
                            <head><title>Screenshot - ${screenshot.title}</title></head>
                            <body style="margin:0;padding:20px;background:#f5f5f5;">
                              <img src="${screenshot.screenshot}" style="max-width:100%;height:auto;border:1px solid #ddd;background:white;" />
                            </body>
                          </html>
                        `);
                      }
                    }}
                    className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                    title="View full screenshot"
                  >
                    <FiCamera />
                  </button>
                  <button
                    onClick={() => {
                      // Issue creation removed
                    }}
                    className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                    title="Create issue from screenshot"
                  >
                    <FiFileText />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 glass-nav flex items-center justify-between p-4 mt-auto">
        <span className="text-xs text-gray-500">v1.0.0</span>
      </div>
    </div>
  );
};

// Initialize the popup
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('popup-root');
  if (container) {
    try {
      // Force light theme background (no adaptive detection)
      document.body.classList.add('qa-theme-light');
      document.body.classList.remove('qa-theme-dark');

      // Show React root and hide the loading content
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
      console.log('Popup React app initialized successfully');
    } catch (error) {
      console.error('Failed to initialize popup React app:', error);
      // Show error message
      container.innerHTML =
        '<div class="error">Failed to load extension. Please refresh.</div>';
    }
  } else {
    console.error('Popup root element not found');
  }
});

// Also try immediate initialization in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
} else {
  // DOM is already loaded
  const container = document.getElementById('popup-root');
  if (container && !container.hasChildNodes()) {
    try {
      // Apply theme immediately if possible
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
      console.log('Popup React app initialized immediately');
    } catch (error) {
      console.error('Failed to initialize popup React app immediately:', error);
    }
  }
}

export default PopupApp;
