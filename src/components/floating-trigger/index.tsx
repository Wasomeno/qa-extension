import React, { useState, useEffect, useCallback } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import PopupWrapper from './components/popup-wrapper';
import LoginPopup from './components/login-popup';

// Updated imports from new page structure
import CompactIssueCreator from '@/pages/issues/create/components/compact-creator';
import CompactIssueList from '@/pages/issues/components/compact-list';
import CompactPinnedIssues from '@/pages/pinned/components/compact-list';
import { CompactRecordingsList } from '@/pages/recordings/components/compact-list';
import { getGitlabLoginSession } from '@/api/auth';
import { MessageType } from '@/types/messages';
import { useSessionUser } from '@/hooks/use-session-user';
import { SessionProvider, useSession } from '@/contexts/session-context';
import { SelectedProjectProvider } from '@/contexts/selected-project-context';

interface FloatingTriggerProps {
  onClose?: () => void;
}

// Create a single QueryClient instance for the floating trigger
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 300_000, // 5 minutes
      gcTime: 300_000, // 5 minutes
    },
  },
});

const FloatingTriggerInner: React.FC<FloatingTriggerProps> = ({ onClose }) => {
  const sessionUser = useSession();
  // Fallback to hook if provider is missing (though it shouldn't be here)
  const hookUser = useSessionUser();
  const { user, clearUser } = sessionUser || hookUser;
  const isLoading = sessionUser?.loading || hookUser?.loading || false;

  const [activeFeature, setActiveFeature] = useState<
    'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record' | null
  >(null);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [buttonContainer, setButtonContainer] = useState<HTMLDivElement | null>(
    null
  );

  const opacity = 1;

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => getGitlabLoginSession(),
    retry: 1,
    staleTime: Infinity, // Keep session data until browser closes or explicit logout
  });

  const isSessionExists = !isLoading && !!user;

  // Sync state on logout
  useEffect(() => {
    if (!session.isLoading && session.data && !session.data.success && user) {
      clearUser();
      handleClose();
    }
  }, [session.data, session.isLoading, user, clearUser]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const handleMessage = (message: any) => {
        if (
          message.type === MessageType.AUTH_LOGOUT ||
          message.type === MessageType.AUTH_SESSION_UPDATED
        ) {
          session.refetch();
          if (message.type === MessageType.AUTH_LOGOUT) {
            handleClose();
          }
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [session]);

  // Sync user state when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      session.refetch();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [session]);

  // Calculate fixed bottom-center position for capsule
  const getCapsulePosition = useCallback(() => {
    const capsuleWidth = 100; // Resting size
    const capsuleHeight = 24;
    const bottomGap = 24; // 24px from bottom

    return {
      x: (window.innerWidth - capsuleWidth) / 2,
      y: window.innerHeight - capsuleHeight - bottomGap,
    };
  }, []);

  useEffect(() => {
    const handleVisibilityEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          visible: boolean;
          reason?: 'auto' | 'manual';
        }>
      ).detail;
      if (!detail) return;

      const reason = detail.reason ?? 'auto';
      if (!detail.visible) {
        setHiddenReason(reason);
        setActiveFeature(null);
      } else {
        if (hiddenReason && reason === 'auto' && hiddenReason !== 'auto') {
          return;
        }
        setHiddenReason(null);
      }
    };

    window.addEventListener(
      'qa-floating-trigger-visibility',
      handleVisibilityEvent as EventListener
    );
    return () =>
      window.removeEventListener(
        'qa-floating-trigger-visibility',
        handleVisibilityEvent as EventListener
      );
  }, [hiddenReason]);

  // Handle action click - calculate popup position above the capsule
  const handleActionClick = (
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => {
    // If clicking the same feature that's already open, don't re-trigger
    if (activeFeature === action) {
      return;
    }

    if (action === 'menu') {
      chrome.runtime.sendMessage({
        type: MessageType.OPEN_MAIN_MENU_PAGE,
      });
      return;
    }

    const popupWidth = 360;
    const arrowHeight = 8;
    const gap = 8;

    const popupX = iconRect.left + iconRect.width / 2 - popupWidth / 2;
    const popupY = capsuleRect.top - arrowHeight - gap;

    setPopupPosition({ x: popupX, y: popupY });
    setActiveFeature(action);
  };

  const handleClose = () => {
    setActiveFeature(null);
    setPopupPosition(null);
  };

  const handleLoginSuccess = () => {
    // Don't await syncUser here to allow immediate UI update
    // The LoginPopup already calls syncUser which updates the shared context
    session.refetch();
    handleClose();
  };

  const handleOpenMainMenu = (data?: { initialView?: string; initialIssue?: any }) => {
    chrome.runtime.sendMessage({
      type: MessageType.OPEN_MAIN_MENU_PAGE,
      data,
    });
  };

  const handleIssueSelect = (issue: any) => {
    handleOpenMainMenu({ initialView: 'issues', initialIssue: issue });
  };

  const handleGoToCreateIssue = () => {
    handleOpenMainMenu({ initialView: 'create-issue' });
  };

  const handleGoToIssues = () => {
    handleOpenMainMenu({ initialView: 'issues' });
  };

  const handleGoToPinned = () => {
    handleOpenMainMenu({ initialView: 'pinned' });
  };

  const handleGoToRecordings = () => {
    handleOpenMainMenu({ initialView: 'recordings' });
  };

  const handleViewAllRecordings = () => {
    handleOpenMainMenu({ initialView: 'recordings' });
  };

  const renderPopupContent = () => {
    switch (activeFeature) {
      case 'issue':
        return (
          <CompactIssueCreator
            onClose={handleClose}
            onGoToMain={handleGoToCreateIssue}
            portalContainer={popupContainer}
          />
        );
      case 'issues':
        return (
          <CompactIssueList
            onClose={handleClose}
            onGoToMain={handleGoToIssues}
            onSelect={handleIssueSelect}
            portalContainer={popupContainer}
          />
        );
      case 'pinned':
        return (
          <CompactPinnedIssues
            onClose={handleClose}
            onGoToMain={handleGoToPinned}
            onSelect={handleIssueSelect}
            portalContainer={popupContainer}
          />
        );
      case 'login':
        return (
          <LoginPopup
            onClose={handleClose}
            onLoginSuccess={handleLoginSuccess}
          />
        );
      case 'record':
        return (
          <CompactRecordingsList
            onClose={handleClose}
            onGoToMain={handleGoToRecordings}
            onViewAll={handleViewAllRecordings}
            portalContainer={popupContainer}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <FloatingTriggerButton
        position={getCapsulePosition()}
        hidden={!!hiddenReason}
        opacity={opacity}
        onActionClick={handleActionClick}
        hasActivePopup={!!activeFeature}
        isLoggedIn={isSessionExists}
        isLoading={isLoading}
        containerRef={setButtonContainer}
        tooltipContainer={buttonContainer}
      />

      {activeFeature && activeFeature !== 'menu' && popupPosition && (
        <PopupWrapper
          position={popupPosition}
          onClose={handleClose}
          containerRef={{ current: popupContainer } as any}
          onContainerRef={el => setPopupContainer(el)}
          width={360}
        >
          {renderPopupContent()}
        </PopupWrapper>
      )}

    </>
  );
};

// Main FloatingTrigger component with QueryClient provider
const FloatingTrigger: React.FC<FloatingTriggerProps> = props => {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SelectedProjectProvider>
          <FloatingTriggerInner {...props} />
        </SelectedProjectProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
};

export default FloatingTrigger;
