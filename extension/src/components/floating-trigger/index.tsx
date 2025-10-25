import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import FloatingTriggerPopup, {
  type ViewState,
} from './components/floating-trigger-popup';
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
  const [viewState, setViewState] = useState<ViewState>('closed');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [selectedMR, setSelectedMR] = useState<any | null>(null);
  const [position, setPosition] = useState({
    x: window.innerWidth - 80,
    y: window.innerHeight / 2,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mouseDownTime, setMouseDownTime] = useState(0);
  const [mouseDownPosition, setMouseDownPosition] = useState({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  const [clickedElement, setClickedElement] = useState<HTMLElement | null>(
    null
  );
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [hiddenReason, setHiddenReason] = useState<'auto' | 'manual' | null>(
    null
  );
  const [opacity, setOpacity] = useState<number>(1);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const lastExpandedStateRef = useRef<{
    viewState: ViewState;
    selectedFeature: string | null;
    selectedIssue: any | null;
    selectedMR: any | null;
  } | null>(null);
  const manualHideTimeoutRef = useRef<number | null>(null);
  const autoHideTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 60),
        y: Math.min(prev.y, window.innerHeight - 60),
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // Ensure popup stays within viewport bounds when view size changes
  useEffect(() => {
    const getSizeForState = (state: ViewState, feature?: string | null) => {
      if (state === 'closed') return { w: 45, h: 45 };
      if (state === 'features') return { w: 260, h: 300 };
      // feature-detail
      if (feature === 'pinned') return { w: 500, h: 440 };
      return { w: 500, h: 580 };
    };

    const { w, h } = getSizeForState(viewState, selectedFeature);
    const margin = 10; // small margin from edges
    setPosition(prev => {
      const maxX = Math.max(0, window.innerWidth - w - margin);
      const maxY = Math.max(0, window.innerHeight - h - margin);
      const newX = Math.min(Math.max(0, prev.x), maxX);
      const newY = Math.min(Math.max(0, prev.y), maxY);
      if (newX !== prev.x || newY !== prev.y) {
        return { x: newX, y: newY };
      }
      return prev;
    });
  }, [viewState, selectedFeature]);

  useEffect(() => {
    if (viewState !== 'closed') {
      lastExpandedStateRef.current = {
        viewState,
        selectedFeature,
        selectedIssue,
        selectedMR,
      };
    }
  }, [viewState, selectedFeature, selectedIssue, selectedMR]);

  const restoreLastExpandedState = useCallback(() => {
    const last = lastExpandedStateRef.current;
    if (last && last.viewState !== 'closed') {
      setSelectedFeature(last.selectedFeature);
      setSelectedIssue(last.selectedIssue);
      setSelectedMR(last.selectedMR);
      setViewState(last.viewState);
    } else if (viewState !== 'closed') {
      // No stored expanded state; keep current closed state
      setViewState('closed');
    }
    if (!last) {
      setSelectedFeature(null);
      setSelectedIssue(null);
      setSelectedMR(null);
    }
  }, [viewState]);

  // Listen for opacity change event from content script
  useEffect(() => {
    const handleOpacityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ opacity: number }>).detail;
      if (detail && typeof detail.opacity === 'number') {
        console.log(
          `QA Extension (React): Setting popup opacity to ${detail.opacity}`
        );
        setOpacity(detail.opacity);
      }
    };

    window.addEventListener(
      'qa-floating-trigger-opacity',
      handleOpacityChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'qa-floating-trigger-opacity',
        handleOpacityChange as EventListener
      );
    };
  }, []);

  // Restore opacity when hovered
  useEffect(() => {
    if (isHovered && opacity < 1) {
      setOpacity(1);
    }
  }, [isHovered, opacity]);

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
        setViewState('closed');
      } else {
        if (!hiddenReason) return;
        if (reason === 'auto' && hiddenReason !== 'auto') {
          // Respect manual hides until explicitly restored
          return;
        }
        setHiddenReason(null);
        restoreLastExpandedState();
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
  }, [hiddenReason, restoreLastExpandedState]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Allow dragging from anywhere on the popup, but track what was clicked
    const target = e.target as HTMLElement;

    // Store the clicked element to check later in mouseUp
    setClickedElement(target);

    // Treat typical interactive controls and Radix select popper/trigger as non-draggable
    const isInteractiveElement = !!target.closest(
      'button, input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="option"], [data-radix-select-content], [data-radix-select-item], [data-radix-popper-content-wrapper]'
    );

    if (isInteractiveElement) {
      // Don’t start drag/toggle when interacting with controls
      return;
    }

    // Record initial mouse position and time
    setMouseDownTime(Date.now());
    setMouseDownPosition({ x: e.clientX, y: e.clientY });
    setHasMoved(false);

    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const [ownerDoc, setOwnerDoc] = useState<Document | null>(null);

  const handleMouseMove = (e: MouseEvent) => {
    if (mouseDownTime === 0) return;

    // Calculate distance moved
    const distanceMoved = Math.sqrt(
      Math.pow(e.clientX - mouseDownPosition.x, 2) +
        Math.pow(e.clientY - mouseDownPosition.y, 2)
    );

    // If moved more than 5 pixels, consider it a drag
    if (distanceMoved > 5 && !isDragging) {
      setIsDragging(true);
      setHasMoved(true);
    }

    if (isDragging) {
      const newX = Math.max(
        0,
        Math.min(e.clientX - dragOffset.x, window.innerWidth - 60)
      );
      const newY = Math.max(
        0,
        Math.min(e.clientY - dragOffset.y, window.innerHeight - 60)
      );

      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    const mouseUpTime = Date.now();
    const timeDiff = mouseUpTime - mouseDownTime;

    setIsDragging(false);
    setMouseDownTime(0);

    if (timeDiff < 200 && !hasMoved && clickedElement) {
      const isInteractiveElement = !!clickedElement.closest(
        'button, input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="option"], [data-radix-select-content], [data-radix-select-item], [data-radix-popper-content-wrapper]'
      );

      if (!isInteractiveElement && viewState === 'closed') {
        toggleView();
      }
    }

    setClickedElement(null);
  };

  useEffect(() => {
    const targetDoc: Document = ownerDoc || document;
    if (mouseDownTime > 0) {
      targetDoc.addEventListener('mousemove', handleMouseMove);
      targetDoc.addEventListener('mouseup', handleMouseUp);

      return () => {
        targetDoc.removeEventListener('mousemove', handleMouseMove);
        targetDoc.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [
    mouseDownTime,
    isDragging,
    dragOffset,
    mouseDownPosition,
    hasMoved,
    ownerDoc,
  ]);

  const toggleView = () => {
    if (viewState === 'closed') {
      // Restore the last expanded state if it exists
      const last = lastExpandedStateRef.current;
      if (last && last.viewState !== 'closed') {
        setSelectedFeature(last.selectedFeature);
        setSelectedIssue(last.selectedIssue);
        setSelectedMR(last.selectedMR);
        setViewState(last.viewState);
      } else {
        // No previous state, open to features list
        setViewState('features');
      }
    } else {
      // Close the popup
      setViewState('closed');
    }
  };

  const handleFeatureSelect = (feature: string) => {
    setSelectedFeature(feature);
    setViewState('feature-detail');
  };

  const handleIssueSelect = (issue: any) => {
    setSelectedIssue(issue);
    setSelectedFeature('issue-detail');
    setViewState('feature-detail');
  };

  const handleMRSelect = (mr: any) => {
    setSelectedMR(mr);
    setSelectedFeature('mr-detail');
    setViewState('feature-detail');
  };

  const handleBack = () => {
    if (viewState === 'feature-detail') {
      // If viewing issue detail, go back to issue list
      if (selectedFeature === 'issue-detail') {
        setSelectedIssue(null);
        setSelectedFeature('issues');
        setViewState('feature-detail');
      }
      // If viewing MR detail, go back to MR list
      else if (selectedFeature === 'mr-detail') {
        setSelectedMR(null);
        setSelectedFeature('merge-requests');
        setViewState('feature-detail');
      } else {
        setViewState('features');
        setSelectedFeature(null);
      }
    } else {
      setViewState('closed');
    }
  };

  const handleClose = () => {
    setViewState('closed');
    setSelectedFeature(null);
    setSelectedIssue(null);
    setSelectedMR(null);
  };

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        default:
          // No quick actions currently
          break;
      }
    } catch (error) {
      console.error('Quick action failed:', error);
    }
  };

  return (
    <FloatingTriggerButton
      onMouseDown={handleMouseDown}
      viewState={viewState}
      position={position}
      selectedFeature={selectedFeature}
      hidden={!!hiddenReason}
      opacity={opacity}
      onHoverChange={setIsHovered}
      containerRef={el => {
        try {
          setOwnerDoc(el?.ownerDocument || null);
        } catch {}
      }}
    >
      <FloatingTriggerPopup
        viewState={viewState}
        selectedFeature={selectedFeature}
        selectedIssue={selectedIssue}
        selectedMR={selectedMR}
        onFeatureSelect={handleFeatureSelect}
        onBack={handleBack}
        onClose={handleClose}
        onQuickAction={handleQuickAction}
        onMouseDown={handleMouseDown}
        onIssueSelect={handleIssueSelect}
        onMRSelect={handleMRSelect}
      />
    </FloatingTriggerButton>
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
