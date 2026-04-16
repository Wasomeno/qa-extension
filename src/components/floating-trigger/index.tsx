import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import PopupWrapper from './components/popup-wrapper';
import MainMenuModal from './components/main-menu-modal';
import LoginPopup from './components/login-popup';

// Updated imports from new page structure
import CompactIssueCreator from '@/pages/issues/create/components/compact-creator';
import CompactIssueList from '@/pages/issues/components/compact-list';
import CompactPinnedIssues from '@/pages/pinned/components/compact-list';
import { CompactRecordingsList } from '@/pages/recordings/components/compact-list';
import { getGitlabLoginSession } from '@/api/auth';
import { MessageType } from '@/types/messages';
import { useSessionUser } from '@/hooks/use-session-user';
import { ViewType } from '@/types/navigation';
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
  const { user, clearUser, syncUser } = sessionUser || hookUser;
  const isLoading = sessionUser?.loading || hookUser?.loading || false;

  const [activeFeature, setActiveFeature] = useState<
    'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record' | null
  >(null);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [initialView, setInitialView] = useState<ViewType>('agent');
  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [buttonContainer, setButtonContainer] = useState<HTMLDivElement | null>(
    null
  );

  const opacity = activeFeature === 'menu' && !isHovered ? 0.3 : 1;

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

    // Menu modal is wider than other popups
    const popupWidth = action === 'menu' ? 600 : 360;
    const arrowHeight = 8; // Height of the tooltip arrow
    const gap = 8; // Gap between popup and capsule

    // Center popup horizontally relative to the clicked icon
    const popupX = iconRect.left + iconRect.width / 2 - popupWidth / 2;
    // Position popup with bottom edge just above the capsule
    const popupY = capsuleRect.top - arrowHeight - gap;

    setPopupPosition({ x: popupX, y: popupY });
    setActiveFeature(action);
    if (action === 'menu') {
      // When opening the menu via the main menu icon,
      // preserve the last state by not resetting.
      // setInitialView('agent');
    }
  };

  const handleClose = () => {
    setActiveFeature(null);
    setPopupPosition(null);
    setSelectedIssue(null);
  };

  const handleLoginSuccess = () => {
    // Don't await syncUser here to allow immediate UI update
    // The LoginPopup already calls syncUser which updates the shared context
    session.refetch();
    handleClose();
  };

  const handleIssueSelect = (issue: any) => {
    setSelectedIssue(issue);
    setInitialView('issues');
    setActiveFeature('menu');
  };

  const handleGoToCreateIssue = () => {
    setActiveFeature('menu');
    setInitialView('create-issue');
  };

  const handleGoToIssues = () => {
    setActiveFeature('menu');
    setInitialView('issues');
  };

  const handleGoToPinned = () => {
    setActiveFeature('menu');
    setInitialView('pinned');
  };

  const handleGoToRecordings = () => {
    setActiveFeature('menu');
    setInitialView('recordings');
  };

  const handleViewAllRecordings = () => {
    setInitialView('recordings');
    setActiveFeature('menu');
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
        onHoverChange={setIsHovered}
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

      {/* Main Menu Modal - rendered separately with its own backdrop */}
      <MainMenuModal
        isOpen={activeFeature === 'menu'}
        onClose={handleClose}
        initialIssue={selectedIssue}
        initialView={initialView}
      />
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
