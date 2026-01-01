import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import PopupWrapper from './components/PopupWrapper';
import CompactIssueCreator from './components/CompactIssueCreator';
import CompactIssueList from './components/CompactIssueList';
import CompactPinnedIssues from './components/CompactPinnedIssues';
import MainMenuModal from './components/MainMenuModal';
import { storageService, type ExtensionSettings } from '@/services/storage';

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
  const [activeFeature, setActiveFeature] = useState<
    'issue' | 'issues' | 'pinned' | 'menu' | null
  >(null);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [opacity, setOpacity] = useState<number>(1);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const popupContainerRef = useRef<HTMLDivElement>(null);

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
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const loaded = await storageService.getSettings();
        if (!cancelled) {
          setSettings(loaded);
        }
      } catch (error) {
        console.error('FloatingTrigger: failed to load settings', error);
      }
    };

    loadSettings();

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = storageService.onChanged('settings', () => {
        loadSettings();
      });
    } catch (error) {
      console.warn('FloatingTrigger: failed to subscribe to settings', error);
    }

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Opacity handlers removed - keeping trigger always visible during screenshots

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
    action: 'issue' | 'issues' | 'pinned' | 'menu',
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

    // We need to position the popup so its BOTTOM is above the capsule
    // This means: capsule.top - gap - arrowHeight = popup bottom
    // So popup top = capsule.top - gap - arrowHeight - popup.height
    // BUT we don't know popup height until it renders!
    // Solution: Position at the bottom and let CSS handle it

    // Center popup horizontally relative to the clicked icon
    const popupX = iconRect.left + iconRect.width / 2 - popupWidth / 2;
    // Position popup with bottom edge just above the capsule
    // We'll use bottom positioning instead
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
      <MainMenuModal isOpen={activeFeature === 'menu'} onClose={handleClose} />
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
