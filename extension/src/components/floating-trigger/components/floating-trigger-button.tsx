import React from 'react';
import { motion } from 'framer-motion';

import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/src/components/ui/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import type { ViewState } from './floating-trigger-popup';

interface FloatingTriggerButtonProps {
  onMouseDown: (e: React.MouseEvent) => void;
  viewState: ViewState;
  position: { x: number; y: number };
  selectedFeature?: string | null;
  children?: React.ReactNode;
  containerRef?: (el: HTMLDivElement | null) => void;
}

const FloatingTriggerButton: React.FC<FloatingTriggerButtonProps> = ({
  onMouseDown,
  viewState,
  position,
  selectedFeature,
  children,
  containerRef,
}) => {
  const keyboardIsolation = useKeyboardIsolation();

  const open = viewState !== 'closed';
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Keep light background, but adapt text color for contrast
  const [onDarkBackdrop, setOnDarkBackdrop] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStartPosition, setDragStartPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  // Provide root element to parent if requested
  React.useEffect(() => {
    if (containerRef) containerRef(rootRef.current);
  }, [containerRef]);

  // Lightweight backdrop luminance detection to choose text tone only
  React.useEffect(() => {
    const getSizeForState = (state: ViewState) => {
      if (state === 'closed') return { w: 45, h: 45 };
      if (state === 'features') return { w: 340, h: 320 };
      return { w: 560, h: 640 };
    };

    const parseRGBA = (bg: string) => {
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return { r: 255, g: 255, b: 255, a: 1 };
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      const [r, g, b, a] = [
        parts[0] || 255,
        parts[1] || 255,
        parts[2] || 255,
        parts[3] ?? 1,
      ];
      return { r, g, b, a };
    };

    const luminance = (r: number, g: number, b: number) => {
      const srgb = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    };

    const detect = () => {
      try {
        const el = rootRef.current;
        if (!el) return;
        const { w, h } = getSizeForState(viewState);
        const clamp = (val: number, min: number, max: number) =>
          Math.min(Math.max(val, min), max);
        const points = [
          [position.x + w / 2, position.y + h / 2],
          [position.x + w * 0.25, position.y + h * 0.25],
          [position.x + w * 0.75, position.y + h * 0.25],
          [position.x + w * 0.25, position.y + h * 0.75],
          [position.x + w * 0.75, position.y + h * 0.75],
        ].map(([x, y]) => [
          clamp(x, 0, window.innerWidth - 1),
          clamp(y, 0, window.innerHeight - 1),
        ]);

        const sampleAt = (x: number, y: number) => {
          try {
            const prevPointer = el.style.pointerEvents;
            el.style.pointerEvents = 'none';
            let under = document.elementFromPoint(x, y) as HTMLElement | null;
            el.style.pointerEvents = prevPointer;

            let depth = 0;
            while (under && depth < 12) {
              const cs = getComputedStyle(under);
              const rgba = parseRGBA(
                cs.backgroundColor || 'rgba(255,255,255,1)'
              );
              if (rgba.a && rgba.a > 0) return rgba;
              under = under.parentElement;
              depth += 1;
            }
            const bodyBG = getComputedStyle(document.body).backgroundColor;
            const htmlBG = getComputedStyle(
              document.documentElement
            ).backgroundColor;
            const rb = parseRGBA(bodyBG || 'rgba(255,255,255,1)');
            const rh = parseRGBA(htmlBG || 'rgba(255,255,255,1)');
            return rb.a > 0 ? rb : rh;
          } catch (error) {
            // If backdrop detection fails, return default light background
            return { r: 255, g: 255, b: 255, a: 1 };
          }
        };

        const samples = points.map(([x, y]) => sampleAt(x, y));
        const luminances = samples.map(s => luminance(s.r, s.g, s.b));
        const avgL = luminances.reduce((a, b) => a + b, 0) / luminances.length;
        // If backdrop is dark, switch text to light for contrast
        setOnDarkBackdrop(avgL < 0.6);
      } catch (error) {
        // If detection fails, default to light text on dark backdrop assumption
        console.warn('Backdrop detection failed, using default:', error);
        setOnDarkBackdrop(false);
      }
    };

    detect();
    const ownerWin: Window =
      rootRef.current?.ownerDocument?.defaultView || window;
    const t = ownerWin.setTimeout(detect, 220);
    const onScroll = () => detect();
    const onResize = () => detect();
    ownerWin.addEventListener('scroll', onScroll, true);
    ownerWin.addEventListener('resize', onResize);
    return () => {
      ownerWin.removeEventListener('scroll', onScroll, true);
      ownerWin.removeEventListener('resize', onResize);
      ownerWin.clearTimeout(t);
    };
  }, [position.x, position.y, viewState]);

  // Track when we're transitioning to closed state
  React.useEffect(() => {
    if (viewState === 'closed' && open) {
      // Just transitioned from open to closed - start animation period
      setShowTooltip(false);
    } else if (viewState !== 'closed') {
      setShowTooltip(false);
    }
  }, [viewState, open]);

  // Control tooltip visibility
  React.useEffect(() => {
    if (viewState === 'closed' && isHovered && !isAnimating && !isDragging) {
      setShowTooltip(true);
    } else {
      setShowTooltip(false);
    }
  }, [viewState, isHovered, isAnimating, isDragging]);

  // Handle drag detection
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      setDragStartPosition({ x: e.clientX, y: e.clientY });
      setIsDragging(false);
      onMouseDown(e);
    },
    [onMouseDown]
  );

  React.useEffect(() => {
    if (!dragStartPosition) return;

    const ownerDoc: Document = rootRef.current?.ownerDocument || document;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartPosition) return;

      const dx = e.clientX - dragStartPosition.x;
      const dy = e.clientY - dragStartPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Consider it a drag if moved more than 3 pixels
      if (distance > 3 && !isDragging) {
        setIsDragging(true);
        setShowTooltip(false);
      }
    };

    const handleMouseUp = () => {
      setDragStartPosition(null);
      // Keep isDragging true for a brief moment to prevent tooltip flicker
      setTimeout(() => setIsDragging(false), 100);
    };

    ownerDoc.addEventListener('mousemove', handleMouseMove);
    ownerDoc.addEventListener('mouseup', handleMouseUp);

    return () => {
      ownerDoc.removeEventListener('mousemove', handleMouseMove);
      ownerDoc.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragStartPosition, isDragging]);

  return (
    <motion.div
      ref={rootRef}
      initial={false}
      onAnimationStart={() => setIsAnimating(true)}
      onAnimationComplete={() => setIsAnimating(false)}
      className={`floating-trigger ${open ? 'ft-glass' : ''} qa-theme-light ${onDarkBackdrop ? 'qa-text-dark' : 'qa-text-light'} ${viewState === 'closed' && !isHovered ? '' : ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 999999,
        pointerEvents: 'auto',
        backdropFilter: viewState === 'closed' ? 'blur(12px)' : 'blur(16px)',
        background:
          viewState === 'closed' && !isHovered
            ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
            : 'var(--qa-glass)',
        border:
          viewState === 'closed' && !isHovered
            ? 'none'
            : viewState === 'closed'
              ? '1px solid var(--qa-border)'
              : undefined,
        boxShadow:
          viewState === 'closed'
            ? '0 4px 12px rgba(0,0,0,0.15)'
            : '0 20px 40px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.08)',
      }}
      animate={{
        width:
          viewState === 'closed'
            ? isHovered
              ? 50
              : 36
            : viewState === 'features'
              ? 260
              : 500,
        height:
          viewState === 'closed'
            ? isHovered
              ? 50
              : 36
            : viewState === 'features'
              ? 300
              : selectedFeature === 'pinned'
                ? 440
                : 580,
        borderRadius: viewState === 'closed' ? (isHovered ? 100 : 100) : 16,
        scale: 1,
        opacity: 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 15,
        mass: 0.6,
        ease: 'easeInOut',
      }}
      {...keyboardIsolation}
    >
      {viewState === 'closed' ? (
        <TooltipProvider>
          <Tooltip open={showTooltip}>
            <TooltipTrigger asChild>
              <motion.div
                key="button"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex items-center justify-center cursor-pointer"
                onMouseDown={handleMouseDown}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <motion.div
                  animate={{
                    scale: isHovered ? 1 : 0,
                    opacity: isHovered ? 1 : 0,
                    rotate: isHovered && !isDragging ? 5 : 0,
                  }}
                  whileTap={!isDragging ? { scale: 0.8, rotate: -5 } : {}}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                    mass: 0.4,
                  }}
                  style={{ pointerEvents: 'none' }}
                >
                  <img
                    src="https://harlequin-unemployed-donkey-752.mypinata.cloud/ipfs/bafkreifqjkrounrfbhp6uabalj645txqku46o7w4j5loge4esludxnt2k4"
                    aria-label="logo"
                    className="w-9 h-9"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  />
                </motion.div>
              </motion.div>
            </TooltipTrigger>
            <TooltipPortal container={rootRef.current ?? undefined}>
              <TooltipContent
                side="top"
                sideOffset={12}
                className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
              >
                <motion.div
                  initial={{ y: 5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                    duration: 0.2,
                  }}
                >
                  Let's manage some issue!
                </motion.div>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full h-full relative"
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
};

export default FloatingTriggerButton;
