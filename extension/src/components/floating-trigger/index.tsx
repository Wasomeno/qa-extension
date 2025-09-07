import React, { useState, useEffect } from 'react';
import FloatingTriggerButton from './components/floating-trigger-button';
import FloatingTriggerPopup from './components/floating-trigger-popup';
import rrwebRecorder from '@/services/rrweb-recorder';

type ViewState = 'closed' | 'features' | 'feature-detail';

interface FloatingTriggerProps {
  onClose?: () => void;
}

const FloatingTrigger: React.FC<FloatingTriggerProps> = () => {
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
      if (feature === 'pinned') return { w: 400, h: 340 };
      return { w: 400, h: 480 };
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
    if (mouseDownTime > 0) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [mouseDownTime, isDragging, dragOffset, mouseDownPosition, hasMoved]);

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
        case 'record':
          // Start recording directly in content script for reliability
          if (!rrwebRecorder.isRecording) {
            await rrwebRecorder.start();
          }
          setViewState('closed');
          break;
        case 'stop':
          if (rrwebRecorder.isRecording) {
            await rrwebRecorder.stop({ persist: true });
          }
          setViewState('closed');
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

export default FloatingTrigger;
