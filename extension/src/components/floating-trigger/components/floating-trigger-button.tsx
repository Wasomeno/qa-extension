import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, List, Pin, Menu } from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/src/components/ui/ui/tooltip';

interface FloatingTriggerButtonProps {
  position: { x: number; y: number };
  children?: React.ReactNode;
  containerRef?: (el: HTMLDivElement | null) => void;
  hidden?: boolean;
  opacity?: number;
  onHoverChange?: (isHovered: boolean) => void;
  onActionClick?: (
    action: 'issue' | 'issues' | 'pinned' | 'menu',
    iconRect: DOMRect,
    capsuleRect: DOMRect
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
  const menuIconRef = React.useRef<HTMLButtonElement>(null);

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
    action: 'issue' | 'issues' | 'pinned' | 'menu',
    iconRef: React.RefObject<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (iconRef.current && rootRef.current && onActionClick) {
      const iconRect = iconRef.current.getBoundingClientRect();
      const capsuleRect = rootRef.current.getBoundingClientRect();
      onActionClick(action, iconRect, capsuleRect);
    }
  };

  // Show expanded state if hovered OR if there's an active popup
  const isExpanded = isHovered || hasActivePopup;

  // Calculate position adjustment to keep capsule centered horizontally
  // and grow from bottom to top vertically
  const restingWidth = 100;
  const expandedWidth = 180;
  const restingHeight = 24;
  const expandedHeight = 48;
  const widthDiff = expandedWidth - restingWidth;
  const heightDiff = expandedHeight - restingHeight;
  const offsetX = isExpanded ? -widthDiff / 2 : 0;
  const offsetY = isExpanded ? -heightDiff : 0; // Move up when expanding

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
          top: position.y + offsetY,
          width: isExpanded ? expandedWidth : restingWidth,
          height: isExpanded ? expandedHeight : restingHeight,
          borderRadius: isExpanded ? 24 : 20,
          opacity: opacity,
        }}
        transition={{
          type: 'spring',
          duration: 0.5,
          bounce: 0.3,
        }}
        {...keyboardIsolation}
      >
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center justify-evenly h-full px-2">
            <AnimatePresence>
              {isExpanded && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={createIconRef}
                        initial={{
                          opacity: 0,
                          scale: 0.5,
                          filter: 'blur(5px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
                        exit={{ opacity: 0, scale: 0.5, filter: 'blur(5px)' }}
                        transition={{
                          type: 'spring',
                          duration: 0.2,
                          bounce: 0.3,
                        }}
                        onClick={e =>
                          handleActionClick(e, 'issue', createIconRef)
                        }
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                        aria-label="Create Issue"
                      >
                        <PlusCircle className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Create Issue</p>
                    </TooltipContent>
                  </Tooltip>
                  <hr className="w-px h-5 bg-neutral-200" />
                  {/* List Issues */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={listIconRef}
                        initial={{
                          opacity: 0,
                          scale: 0.5,
                          filter: 'blur(5px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
                        exit={{ opacity: 0, scale: 0.5, filter: 'blur(5px)' }}
                        transition={{
                          type: 'spring',
                          duration: 0.2,
                          bounce: 0.3,
                        }}
                        onClick={e =>
                          handleActionClick(e, 'issues', listIconRef)
                        }
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                        aria-label="Issue List"
                      >
                        <List className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Issue List</p>
                    </TooltipContent>
                  </Tooltip>
                  <hr className="w-px h-5 bg-neutral-200" />
                  {/* Pinned Issues */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={pinnedIconRef}
                        initial={{
                          opacity: 0,
                          scale: 0.5,
                          filter: 'blur(5px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
                        exit={{ opacity: 0, scale: 0.5, filter: 'blur(5px)' }}
                        transition={{
                          type: 'spring',
                          duration: 0.2,
                          bounce: 0.3,
                        }}
                        onClick={e =>
                          handleActionClick(e, 'pinned', pinnedIconRef)
                        }
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                        aria-label="Pinned Issues"
                      >
                        <Pin className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Pinned Issues</p>
                    </TooltipContent>
                  </Tooltip>
                  <hr className="w-px h-5 bg-neutral-200" />
                  {/* Main Menu */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={menuIconRef}
                        initial={{
                          opacity: 0,
                          scale: 0.5,
                          filter: 'blur(5px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0)' }}
                        exit={{ opacity: 0, scale: 0.5, filter: 'blur(5px)' }}
                        transition={{
                          type: 'spring',
                          duration: 0.2,
                          bounce: 0.3,
                        }}
                        onClick={e =>
                          handleActionClick(e, 'menu', menuIconRef)
                        }
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors pointer-events-auto"
                        aria-label="Main Menu"
                      >
                        <Menu className="w-5 h-5 text-gray-700 hover:text-gray-900" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Main Menu</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </AnimatePresence>
          </div>
        </TooltipProvider>
      </motion.div>
      {children}
    </>
  );
};

export default FloatingTriggerButton;
