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
  FiPlay,
  FiSquare,
  FiVideo,
  FiActivity,
} from 'react-icons/fi';
import { Loader } from 'lucide-react';

import { UserData, MessageType } from '@/types/messages';
import SettingsPage from '@/popup/components/SettingsPage';

interface PopupState {
  currentView: 'dashboard' | 'login' | 'loading' | 'settings';
  user: UserData | null;
  isAuthenticated: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  recentScreenshots: Array<{
    screenshot: string;
    url?: string;
    title?: string;
    timestamp: number;
  }>;
  isRecording: boolean;
  lastBlueprint: any | null;
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
    isRecording: false,
    lastBlueprint: null,
    error: null,
    success: null,
  });

  useEffect(() => {
    // Initial sync
    chrome.storage.local.get(['isRecording', 'lastBlueprint'], (result) => {
      setState(prev => ({
        ...prev,
        isRecording: !!result.isRecording,
        lastBlueprint: result.lastBlueprint || null,
      }));
    });

    // Listen for storage changes
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.isRecording) {
        setState(prev => ({ ...prev, isRecording: !!changes.isRecording.newValue }));
      }
      if (changes.lastBlueprint) {
        setState(prev => ({ ...prev, lastBlueprint: changes.lastBlueprint.newValue }));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  console.log('🎯 Initial state set:', state.currentView);

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const initializationCompleted = useRef(false);
  const keepaliveRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    return () => {
      try {
        keepaliveRef.current?.disconnect();
      } catch {}
      keepaliveRef.current = null;
    };
  }, []);

  const checkConnection = async (): Promise<void> => {
    setState(prev => ({
      ...prev,
      connectionStatus: 'connecting',
    }));
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
          error: `Screenshot capture failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        }));
      }
    });
  };

  const handleToggleRecording = async (): Promise<void> => {
    try {
      const type = state.isRecording ? MessageType.STOP_RECORDING : MessageType.START_RECORDING;
      chrome.runtime.sendMessage({ type }, (response) => {
        if (chrome.runtime.lastError) {
          setState(prev => ({ ...prev, error: 'Failed to communicate with background service' }));
          return;
        }
        if (response && !response.success) {
          setState(prev => ({ ...prev, error: response.error || 'Failed to toggle recording' }));
        }
      });
    } catch (error) {
      console.error('Toggle recording error:', error);
    }
  };

  const handleRunTest = async (): Promise<void> => {
    if (!state.lastBlueprint) return;
    try {
      chrome.runtime.sendMessage({
        type: MessageType.START_PLAYBACK,
        data: { blueprint: state.lastBlueprint }
      }, (response) => {
        if (chrome.runtime.lastError) {
          setState(prev => ({ ...prev, error: 'Failed to communicate with background service' }));
          return;
        }
        if (response && !response.success) {
          setState(prev => ({ ...prev, error: response.error || 'Failed to start playback' }));
        } else {
          window.close(); // Close popup to see playback
        }
      });
    } catch (error) {
      console.error('Run test error:', error);
    }
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

  const openSettings = (): void => {
    setState(prev => ({
      ...prev,
      currentView: 'settings',
    }));
  };

  const closeSettings = (): void => {
    setState(prev => ({
      ...prev,
      currentView: 'dashboard',
    }));
  };

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
                  className="w-full glass-button glass-glow-blue p-4 flex items-center justify-center gap-3 font-medium"
                >
                  Sign in with GitLab
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

  if (state.currentView === 'settings') {
    return <SettingsPage onClose={closeSettings} />;
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
              onClick={openSettings}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <FiSettings />
            </button>
            <button
              type="button"
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

      {/* Teach & Run Section */}
      <div className="relative z-10 px-4 mt-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">
          Teach & Run
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleToggleRecording}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl glass-card transition-all ${
              state.isRecording ? 'glass-glow-red border-red-200' : 'hover:glass-shimmer'
            }`}
          >
            {state.isRecording ? (
              <FiSquare className="w-6 h-6 text-red-600 mb-2" />
            ) : (
              <FiVideo className="w-6 h-6 text-blue-600 mb-2" />
            )}
            <span className="text-xs font-semibold text-gray-900">
              {state.isRecording ? 'Stop Recording' : 'Start Recording'}
            </span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRunTest}
            disabled={!state.lastBlueprint || state.isRecording}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl glass-card transition-all ${
              !state.lastBlueprint || state.isRecording
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:glass-shimmer'
            }`}
          >
            <FiPlay className={`w-6 h-6 mb-2 ${!state.lastBlueprint || state.isRecording ? 'text-gray-400' : 'text-green-600'}`} />
            <span className={`text-xs font-semibold ${!state.lastBlueprint || state.isRecording ? 'text-gray-400' : 'text-gray-900'}`}>
              Run Last Test
            </span>
          </motion.button>
        </div>
        
        {state.lastBlueprint && (
          <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <FiActivity className="text-green-600 w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Latest Blueprint</div>
              <div className="text-xs font-medium text-gray-900 truncate">{state.lastBlueprint.name}</div>
            </div>
          </div>
        )}
      </div>

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
