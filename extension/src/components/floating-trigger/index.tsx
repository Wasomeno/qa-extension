import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import FloatingTriggerPopup from './components/floating-trigger-popup';
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
    'issue' | 'issues' | 'pinned' | null
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

  // Calculate fixed bottom-center position for capsule
  const getCapsulePosition = useCallback(() => {
    const capsuleWidth = 100; // Resting size
    const capsuleHeight = 40;
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

  // Handle action click - calculate popup position above the clicked icon
  const handleActionClick = (
    action: 'issue' | 'issues' | 'pinned',
    iconRect: DOMRect
  ) => {
    const popupWidth = 360;
    const popupHeight =
      action === 'issue' ? 480 : action === 'pinned' ? 400 : 500;
    const arrowHeight = 8; // Height of the tooltip arrow

    // Center popup horizontally relative to icon
    const popupX = iconRect.left + iconRect.width / 2 - popupWidth / 2;
    // Position popup right above the capsule (accounting for arrow)
    const capsulePos = getCapsulePosition();
    const popupY = capsulePos.y - popupHeight - arrowHeight;

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

      {/* Tooltip-style popup */}
      {activeFeature && popupPosition && (
        <FloatingTriggerPopup
          feature={activeFeature}
          position={popupPosition}
          selectedIssue={selectedIssue}
          onClose={handleClose}
          onIssueSelect={handleIssueSelect}
        />
      )}
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
