import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusCircle,
  Pin,
  Menu,
  LogIn,
  FileText as FileIcon,
  FileText,
} from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CompactRecordingsList } from '@/pages/recordings/components/compact-list';

interface FloatingTriggerButtonProps {
  position: { x: number; y: number };
  children?: React.ReactNode;
  containerRef?: (el: HTMLDivElement | null) => void;
  hidden?: boolean;
  opacity?: number;
  onHoverChange?: (isHovered: boolean) => void;
  onActionClick?: (
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => void;
  hasActivePopup?: boolean;
  isLoggedIn?: boolean;
  isLoading?: boolean;
  tooltipContainer?: HTMLElement | null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.05,
      staggerChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
};

const iconVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 8, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 25,
      mass: 1,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    filter: 'blur(4px)',
    transition: { duration: 0.15 },
  },
};

const FloatingTriggerButton: React.FC<FloatingTriggerButtonProps> = ({
  position,
  children,
  containerRef,
  hidden = false,
  opacity = 1,
  onHoverChange,
  onActionClick,
  hasActivePopup = false,
  isLoggedIn = false,
  isLoading = false,
  tooltipContainer,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [hoveredAction, setHoveredAction] = React.useState<string | null>(null);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const createIconRef = React.useRef<HTMLButtonElement>(null);
  const listIconRef = React.useRef<HTMLButtonElement>(null);
  const pinnedIconRef = React.useRef<HTMLButtonElement>(null);
  const recordIconRef = React.useRef<HTMLButtonElement>(null);
  const menuIconRef = React.useRef<HTMLButtonElement>(null);
  const loginIconRef = React.useRef<HTMLButtonElement>(null);

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
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login' | 'record',
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

  // Show expanded state if hovered OR if there's an active popup OR if popover is open
  const isExpanded = isHovered || hasActivePopup || isPopoverOpen;

  // During loading, hide content and show pulsing animation
  const isLoadingState = isLoading;

  // Calculate position adjustment to keep capsule centered horizontally
  // and grow from bottom to top vertically
  const restingWidth = isLoadingState ? 40 : isLoggedIn ? 100 : 40;
  const expandedWidth = isLoggedIn ? 240 : 60; // Wider for 4 buttons
  const restingHeight = 24;
  const expandedHeight = 52; // Slightly taller for elegance
  const widthDiff = expandedWidth - restingWidth;
  const heightDiff = expandedHeight - restingHeight;
  const offsetX = isExpanded ? -widthDiff / 2 : 0;
  const offsetY = isExpanded ? -heightDiff : 0; // Move up when expanding

  // During loading, hide content
  const showContent = !isLoadingState;

  return (
    <>
      {/* Capsule at bottom center */}
      <motion.div
        ref={rootRef}
        initial={false}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoveredAction(null);
        }}
        className="fixed bg-white/95 backdrop-blur-xs border border-black/5 shadow-sm"
        style={{
          display: hidden ? 'none' : undefined,
          zIndex: 999999,
          pointerEvents: hidden ? 'none' : 'auto',
          overflow: isExpanded ? 'visible' : 'hidden',
          transformOrigin: 'center center',
        }}
        animate={
          isLoadingState
            ? {
                left: position.x + (100 - 100 * 0.9) / 2, // Center the 90% button
                top: position.y + (24 - 24 * 0.9) / 2, // Center the 90% height
                width: 100 * 0.9, // 90% of authenticated button size (100px)
                height: 24 * 0.9, // 90% of authenticated button height (24px)
                borderRadius: 26,
                opacity: opacity,
                scale: [1, 1.08, 1],
                backgroundColor: ['rgb(250 250 252)', 'rgb(248 248 250)', 'rgb(250 250 252)'], // very light gray, almost white
                boxShadow: [
                  '0 2px 8px rgba(0, 0, 0, 0.08)',
                  '0 6px 24px rgba(0, 0, 0, 0.2)',
                  '0 2px 8px rgba(0, 0, 0, 0.08)',
                ],
              }
            : {
                left: isExpanded ? position.x - (expandedWidth - restingWidth) / 2 : position.x, // Center-aligned expansion
                top: isExpanded ? position.y - (expandedHeight - restingHeight) : position.y, // Grow upward from center
                width: isExpanded ? expandedWidth : restingWidth,
                height: isExpanded ? expandedHeight : restingHeight,
                borderRadius: isExpanded ? 26 : isLoggedIn ? 20 : 26,
                opacity: opacity,
                scale: 1,
                backgroundColor: 'rgb(255 255 255)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }
        }
        transition={
          isLoadingState
            ? {
                scale: {
                  duration: 0.8,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                },
                backgroundColor: {
                  duration: 0.8,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                },
                boxShadow: {
                  duration: 0.8,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                },
                left: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
                top: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
                width: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
                height: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
                borderRadius: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
                opacity: { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 },
              }
            : {
                type: 'spring',
                stiffness: 260,
                damping: 25,
                mass: 0.8,
              }
        }
        {...keyboardIsolation}
      >
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center h-full w-full">
            <AnimatePresence mode="wait">
              {showContent && isExpanded && !isLoggedIn && (
                <motion.div
                  key="login-container"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex items-center justify-center w-full"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={loginIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('login')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e =>
                          handleActionClick(e, 'login', loginIconRef)
                        }
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Login"
                      >
                        {hoveredAction === 'login' && (
                          <motion.div
                            layoutId="action-highlight"
                            className="absolute inset-0 bg-black/5 rounded-full"
                            initial={false}
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        <LogIn className="relative z-10 w-5 h-5 text-gray-700\" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Login</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </motion.div>
              )}
              {isExpanded && isLoggedIn && (
                <motion.div
                  key="actions-container"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex items-center justify-evenly w-full px-2"
                >
                  {/* Create Issue */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={createIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('issue')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e =>
                          handleActionClick(e, 'issue', createIconRef)
                        }
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Create Issue"
                      >
                        {hoveredAction === 'issue' && (
                          <motion.div
                            layoutId="action-highlight"
                            className="absolute inset-0 bg-black/5 rounded-full"
                            initial={false}
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        <PlusCircle className="relative z-10 w-5 h-5 text-gray-700\" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Create Issue</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Pinned Issues */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={pinnedIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('pinned')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e =>
                          handleActionClick(e, 'pinned', pinnedIconRef)
                        }
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Pinned Issues"
                      >
                        {hoveredAction === 'pinned' && (
                          <motion.div
                            layoutId="action-highlight"
                            className="absolute inset-0 bg-black/5 rounded-full"
                            initial={false}
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        <Pin className="relative z-10 w-5 h-5 text-gray-700\" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Pinned Issues</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Record Test */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={recordIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('record')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e =>
                          handleActionClick(e, 'record', recordIconRef)
                        }
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Automation Tests"
                      >
                        {hoveredAction === 'record' && (
                          <motion.div
                            layoutId="action-highlight"
                            className="absolute inset-0 bg-black/5 rounded-full"
                            initial={false}
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        <FileText className="relative z-10 w-5 h-5 text-gray-700\" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Automation Tests</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Main Menu */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={menuIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('menu')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e => handleActionClick(e, 'menu', menuIconRef)}
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Main Menu"
                      >
                        {hoveredAction === 'menu' && (
                          <motion.div
                            layoutId="action-highlight"
                            className="absolute inset-0 bg-black/5 rounded-full"
                            initial={false}
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        <Menu className="relative z-10 w-5 h-5 text-gray-700\" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Main Menu</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </motion.div>
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
