import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FloatingTriggerButton from './components/floating-trigger-button';
import FloatingTriggerPopup from './components/floating-trigger-popup';

type ViewState = 'closed' | 'features' | 'feature-detail';

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
  }, [mouseDownTime, isDragging, dragOffset, mouseDownPosition, hasMoved, ownerDoc]);

  const toggleView = () => {
    setViewState(viewState === 'closed' ? 'features' : 'closed');
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

  const handleBack = () => {
    if (viewState === 'feature-detail') {
      // If viewing issue detail, go back to issue list
      if (selectedFeature === 'issue-detail') {
        setSelectedIssue(null);
        setSelectedFeature('issues');
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
      containerRef={(el) => {
        try {
          setOwnerDoc(el?.ownerDocument || null);
        } catch {}
      }}
    >
      <FloatingTriggerPopup
        viewState={viewState}
        selectedFeature={selectedFeature}
        selectedIssue={selectedIssue}
        onFeatureSelect={handleFeatureSelect}
        onBack={handleBack}
        onClose={handleClose}
        onQuickAction={handleQuickAction}
        onMouseDown={handleMouseDown}
        onIssueSelect={handleIssueSelect}
      />
    </FloatingTriggerButton>
  );
};

// Main FloatingTrigger component with QueryClient provider
const FloatingTrigger: React.FC<FloatingTriggerProps> = (props) => {
  return (
    <QueryClientProvider client={queryClient}>
      <FloatingTriggerInner {...props} />
    </QueryClientProvider>
  );
};

export default FloatingTrigger;
