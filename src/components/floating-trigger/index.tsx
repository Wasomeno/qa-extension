import React, { useState, useEffect, useCallback } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import PopupWrapper from './components/popup-wrapper';
import LoginPopup from './components/login-popup';

// Updated imports from new page structure
import CompactIssueCreator from '@/pages/issues/create/components/compact-creator';
import CompactIssueList from '@/pages/issues/components/compact-list';
import CompactPinnedIssues from '@/pages/pinned/components/compact-list';
import { CompactRecordingsList } from '@/pages/recordings/components/compact-list';
import { MessageType } from '@/types/messages';
import { useSessionUser } from '@/hooks/use-session-user';
import { SessionProvider, useSession } from '@/contexts/session-context';
import { SelectedProjectProvider } from '@/contexts/selected-project-context';

interface FloatingTriggerProps {
  onClose?: () => void;
  initialIsRecording?: boolean;
  initialRecordingId?: string;
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

const FloatingTriggerInner: React.FC<FloatingTriggerProps> = ({
  onClose,
  initialIsRecording = false,
  initialRecordingId = null,
}) => {
  const sessionUser = useSession();
  const hookUser = useSessionUser();
  const { user, clearUser, syncUser } = sessionUser || hookUser;
  const isLoading = sessionUser?.loading || hookUser?.loading || false;

  const [activeFeature, setActiveFeature] = useState<
    'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record' | 'start-recording' | null
  >(null);
  const [isHovered, setIsHovered] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [isRecording, setIsRecording] = useState(initialIsRecording);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    () => {
      if (initialIsRecording && initialRecordingId) {
        const idParts = initialRecordingId.split('_') || [];
        const timestamp = parseInt(idParts[idParts.length - 1]);
        return isNaN(timestamp) ? Date.now() : timestamp;
      }
      return null;
    }
  );

  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    // Initial check (backup for the prop)
    if (!initialIsRecording) {
      chrome.storage.local.get(['isRecording', 'currentRecordingId'], result => {
        if (result.isRecording) {
          setIsRecording(true);
          const idParts = result.currentRecordingId?.split('_') || [];
          const timestamp = parseInt(idParts[idParts.length - 1]);
          setRecordingStartTime(isNaN(timestamp) ? Date.now() : timestamp);
        }
      });
    }

    // Listen for changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local') {
        if (changes.isRecording) {
          const isRecordingNow = changes.isRecording.newValue;
          setIsRecording(isRecordingNow);
          if (isRecordingNow) {
            setRecordingStartTime(Date.now());
            setIsStopping(false);
          } else {
            setRecordingStartTime(null);
            // Lock expansion for 3 seconds to prevent immediate hover expand
            setIsStopping(true);
            setIsHovered(false);
            setTimeout(() => setIsStopping(false), 3000);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [buttonContainer, setButtonContainer] = useState<HTMLDivElement | null>(
    null
  );

  const opacity = 1;

  const isSessionExists = !isLoading && !!user;

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const handleMessage = (message: any) => {
        if (
          message.type === MessageType.AUTH_LOGOUT ||
          message.type === MessageType.AUTH_SESSION_UPDATED
        ) {
          syncUser?.();
          if (message.type === MessageType.AUTH_LOGOUT) {
            clearUser?.();
            handleClose();
          }
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [syncUser, clearUser]);

  // Sync user state when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      syncUser?.();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncUser]);

  // Calculate fixed bottom-center position for capsule
  const getCapsulePosition = useCallback(() => {
    const bottomGap = 24; // 24px from bottom
    return {
      y: window.innerHeight - bottomGap,
    };
  }, []);

  const restingWidth = isRecording ? 220 : isLoading ? 40 : isSessionExists ? 100 : 40;

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
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record' | 'start-recording',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => {
    // If clicking the same feature that's already open, don't re-trigger
    if (activeFeature === action && action !== 'start-recording') {
      return;
    }

    if (action === 'menu') {
      chrome.runtime.sendMessage({
        type: MessageType.OPEN_MAIN_MENU_PAGE,
      });
      return;
    }

    if (action === 'start-recording') {
      chrome.runtime.sendMessage({ type: MessageType.CLOSE_MAIN_MENU });
      setTimeout(() => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.START_RECORDING,
            data: {},
          }
        );
      }, 100);
      handleClose();
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
    // Re-sync user state after login to ensure we have fresh data
    syncUser?.();
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

  const handleStopRecording = () => {
    // Prevent immediate hover expansion after stopping
    setIsHovered(false);
    chrome.runtime.sendMessage({ type: MessageType.STOP_RECORDING });
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
        onHoverChange={setIsHovered}
        isHovered={isHovered}
        hasActivePopup={!!activeFeature}
        isLoggedIn={isSessionExists}
        isLoading={isLoading}
        containerRef={setButtonContainer}
        tooltipContainer={buttonContainer}
        isRecording={isRecording}
        recordingStartTime={recordingStartTime}
        onStopRecording={handleStopRecording}
        isStopping={isStopping}
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
