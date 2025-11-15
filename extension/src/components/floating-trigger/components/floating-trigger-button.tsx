import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, List, Pin } from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';

interface FloatingTriggerButtonProps {
  position: { x: number; y: number };
  children?: React.ReactNode;
  containerRef?: (el: HTMLDivElement | null) => void;
  hidden?: boolean;
  opacity?: number;
  onHoverChange?: (isHovered: boolean) => void;
  onActionClick?: (
    action: 'issue' | 'issues' | 'pinned',
    iconRect: DOMRect
  ) => void;
  hasActivePopup?: boolean;
}

const FloatingTriggerButton: React.FC<FloatingTriggerButtonProps> = ({
  position,
  children,
  containerRef,
  hidden = false,
  opacity = 1,
  onHoverChange,
  onActionClick,
  hasActivePopup = false,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const createIconRef = React.useRef<HTMLButtonElement>(null);
  const listIconRef = React.useRef<HTMLButtonElement>(null);
  const pinnedIconRef = React.useRef<HTMLButtonElement>(null);

  // Provide root element to parent if requested
  React.useEffect(() => {
    if (containerRef) containerRef(rootRef.current);
  }, [containerRef]);

  // Notify parent of hover state changes
  React.useEffect(() => {
    onHoverChange?.(isHovered);
  }, [isHovered, onHoverChange]);

  const handleActionClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    action: 'issue' | 'issues' | 'pinned',
    iconRef: React.RefObject<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (iconRef.current && onActionClick) {
      const rect = iconRef.current.getBoundingClientRect();
      onActionClick(action, rect);
    }
  };

  // Show expanded state if hovered OR if there's an active popup
  const isExpanded = isHovered || hasActivePopup;

  // Calculate position adjustment to keep capsule centered
  const restingWidth = 100;
  const expandedWidth = 180;
  const widthDiff = expandedWidth - restingWidth;
  const offsetX = isExpanded ? -widthDiff / 2 : 0;

  return (
    <>
      {/* Capsule at bottom center */}
      <motion.div
        ref={rootRef}
        initial={false}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed bg-white border border-gray-300 shadow-lg"
        style={{
          display: hidden ? 'none' : undefined,
          zIndex: 999999,
          pointerEvents: hidden ? 'none' : 'auto',
        }}
        animate={{
          left: position.x + offsetX,
          top: position.y,
          width: isExpanded ? expandedWidth : restingWidth,
          height: isExpanded ? 48 : 40,
          borderRadius: isExpanded ? 24 : 20,
          opacity: opacity,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 20,
          mass: 0.5,
        }}
        {...keyboardIsolation}
      >
        <div className="flex items-center justify-center h-full gap-3 px-3">
          <AnimatePresence>
            {isExpanded && (
              <>
                {/* Create Issue */}
                <motion.button
                  ref={createIconRef}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15, delay: 0.05 }}
                  onClick={e => handleActionClick(e, 'issue', createIconRef)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                  aria-label="Create Issue"
                >
                  <PlusCircle className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                </motion.button>

                {/* List Issues */}
                <motion.button
                  ref={listIconRef}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15, delay: 0.1 }}
                  onClick={e => handleActionClick(e, 'issues', listIconRef)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                  aria-label="Issue List"
                >
                  <List className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                </motion.button>

                {/* Pinned Issues */}
                <motion.button
                  ref={pinnedIconRef}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15, delay: 0.15 }}
                  onClick={e => handleActionClick(e, 'pinned', pinnedIconRef)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                  aria-label="Pinned Issues"
                >
                  <Pin className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                </motion.button>
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Tooltip-style popups rendered separately */}
      {children}
    </>
  );
};

export default FloatingTriggerButton;
