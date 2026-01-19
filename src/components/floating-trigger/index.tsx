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
import { getGitlabLoginSession } from '@/api/auth';

interface FloatingTriggerProps {
  onClose?: () => void;
}

// Create a single QueryClient instance for the floating trigger
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 300_000, // 5 minutes
      gcTime: 300_000, // 5 minutes
    },
  },
});

const FloatingTriggerInner: React.FC<FloatingTriggerProps> = ({ onClose }) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [activeFeature, setActiveFeature] = useState<
    'issue' | 'issues' | 'pinned' | 'menu' | 'login' | null
  >(null);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [opacity, setOpacity] = useState<number>(1);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => getGitlabLoginSession(),
  });

  const isSessionExists = session.data?.success;

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
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => {
    // If clicking the same feature that's already open, don't re-trigger
    if (activeFeature === action) {
      return;
    }

    // Menu modal is wider than other popups
    const popupWidth = action === 'menu' ? 600 : 420;
    const arrowHeight = 8; // Height of the tooltip arrow
    const gap = 8; // Gap between popup and capsule

    // Center popup horizontally relative to the clicked icon
    const popupX = iconRect.left + iconRect.width / 2 - popupWidth / 2;
    // Position popup with bottom edge just above the capsule
    const popupY = capsuleRect.top - arrowHeight - gap;

    setPopupPosition({ x: popupX, y: popupY });
    setActiveFeature(action);
  };

  const handleClose = () => {
    setActiveFeature(null);
    setPopupPosition(null);
    setSelectedIssue(null);
  };

  const handleIssueSelect = (issue: any) => {
    setSelectedIssue(issue);
    setActiveFeature('menu');
  };

  const renderPopupContent = () => {
    switch (activeFeature) {
      case 'issue':
        return (
          <CompactIssueCreator
            onClose={handleClose}
            portalContainer={popupContainerRef.current}
          />
        );
      case 'issues':
        return (
          <CompactIssueList
            onClose={handleClose}
            onSelect={handleIssueSelect}
            portalContainer={popupContainerRef.current}
          />
        );
      case 'pinned':
        return (
          <CompactPinnedIssues
            onClose={handleClose}
            onSelect={handleIssueSelect}
            portalContainer={popupContainerRef.current}
          />
        );
      case 'login':
        return (
          <LoginPopup
            onClose={handleClose}
            onLoginSuccess={() => setIsLoggedIn(true)}
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
        isLoggedIn={isSessionExists || isLoggedIn}
      />

      {activeFeature && activeFeature !== 'menu' && popupPosition && (
        <PopupWrapper
          position={popupPosition}
          onClose={handleClose}
          containerRef={popupContainerRef}
          width={420}
        >
          {renderPopupContent()}
        </PopupWrapper>
      )}

      {/* Main Menu Modal - rendered separately with its own backdrop */}
      <MainMenuModal
        isOpen={activeFeature === 'menu'}
        onClose={handleClose}
        initialIssue={selectedIssue}
      />
    </>
  );
};

// Main FloatingTrigger component with QueryClient provider
const FloatingTrigger: React.FC<FloatingTriggerProps> = props => {
  return (
    <QueryClientProvider client={queryClient}>
      <FloatingTriggerInner {...props} />
    </QueryClientProvider>
  );
};

export default FloatingTrigger;
