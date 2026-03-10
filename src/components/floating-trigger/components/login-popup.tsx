import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { gitlabLogin } from '@/api/auth';
import { useSessionUser } from '@/hooks/use-session-user';
import { MessageType } from '@/types/messages';
import { LogIn, Loader2 } from 'lucide-react';
import { useSession } from '@/contexts/session-context';

interface LoginPopupProps {
  onClose: () => void;
  onLoginSuccess: () => void;
}

const LoginPopup: React.FC<LoginPopupProps> = ({ onClose, onLoginSuccess }) => {
  const [isPolling, setIsPolling] = useState(false);
  const session = useSession();
  const hookUser = useSessionUser();
  const { user, syncUser } = session || hookUser;

  // Watch for user session to appear while polling
  useEffect(() => {
    if (user && isPolling) {
      onLoginSuccess();
      onClose();
    }
  }, [user, isPolling, onLoginSuccess, onClose]);

  // Active polling while waiting for authentication
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      syncUser();
    }, 2000);

    // Stop polling after 2 minutes (fail-safe)
    const timeout = setTimeout(() => {
      setIsPolling(false);
    }, 120000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isPolling, syncUser]);

  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPolling) return;

    try {
      const response = await gitlabLogin();

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        setIsPolling(true);
      }

      // We don't call onLoginSuccess/onClose immediately because the user is still authenticating in the new window.
      // The session will be updated via the focus listener or storage change when they return.
      // However, if the API already says success (session exists), we can proceed.
      if (response.success && !response.data?.url) {
        await syncUser();

        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: MessageType.AUTH_SESSION_UPDATED,
          });
        }

        onLoginSuccess();
        onClose();
      }
    } catch (error) {
      setIsPolling(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 24 },
    },
  };

  const logoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('assets/flowg-logo.png')
      : '/assets/flowg-logo.png';

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 sm:p-8 flex flex-col items-center justify-center space-y-4"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Logo Section */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col items-center"
      >
        <div className="relative group">
          <img
            src={logoUrl}
            alt="FlowG"
            className="relative h-7 object-contain"
          />
        </div>
        <p className="text-sm text-gray-500 mt-1 text-center">
          Authenticate to access your dashboard
        </p>
      </motion.div>

      {/* SSO Section - Mimics a form look */}
      <motion.div variants={itemVariants} className="w-full space-y-6">
        <div className="space-y-3">
          <Button
            onClick={handleLogin}
            disabled={isPolling}
            className="w-full h-12 bg-[#FC6D26] hover:bg-[#E24329] text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-200 flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-80"
          >
            {isPolling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
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
                <LogIn className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-gray-400 px-4">
            By logging in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default LoginPopup;
