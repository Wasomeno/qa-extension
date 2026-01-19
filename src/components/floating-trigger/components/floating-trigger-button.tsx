import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, List, Pin, Menu, LogIn } from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FloatingTriggerButtonProps {
  position: { x: number; y: number };
  children?: React.ReactNode;
  containerRef?: (el: HTMLDivElement | null) => void;
  hidden?: boolean;
  opacity?: number;
  onHoverChange?: (isHovered: boolean) => void;
  onActionClick?: (
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => void;
  hasActivePopup?: boolean;
  isLoggedIn?: boolean;
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
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const createIconRef = React.useRef<HTMLButtonElement>(null);
  const listIconRef = React.useRef<HTMLButtonElement>(null);
  const pinnedIconRef = React.useRef<HTMLButtonElement>(null);
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
    action: 'issue' | 'issues' | 'pinned' | 'menu' | 'login',
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
  const restingWidth = isLoggedIn ? 100 : 40;
  const expandedWidth = isLoggedIn ? 200 : 60; // Wider for 3 buttons
  const restingHeight = 24;
  const expandedHeight = 52; // Slightly taller for elegance
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
        className="fixed bg-white/95 backdrop-blur-xs border border-black/5 shadow-sm"
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
          borderRadius: isExpanded ? 26 : 20,
          opacity: opacity,
        }}
        transition={{
          type: 'spring',
          stiffness: 230,
          damping: 25,
          mass: 0.8,
        }}
        {...keyboardIsolation}
      >
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center h-full w-full">
            <AnimatePresence>
              {isExpanded && !isLoggedIn && (
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
                        onClick={e =>
                          handleActionClick(e, 'login', loginIconRef)
                        }
                        className="p-2 rounded-full hover:bg-black/5 transition-colors pointer-events-auto active:scale-95"
                        aria-label="Login"
                      >
                        <LogIn className="w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="mb-2">
                      <p>Login</p>
                    </TooltipContent>
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
                        onClick={e =>
                          handleActionClick(e, 'issue', createIconRef)
                        }
                        className="p-2 rounded-full hover:bg-black/5 transition-colors pointer-events-auto active:scale-95"
                        aria-label="Create Issue"
                      >
                        <PlusCircle className="w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="mb-2">
                      <p>Create Issue</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Pinned Issues */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={pinnedIconRef}
                        variants={iconVariants}
                        onClick={e =>
                          handleActionClick(e, 'pinned', pinnedIconRef)
                        }
                        className="p-2 rounded-full hover:bg-black/5 transition-colors pointer-events-auto active:scale-95"
                        aria-label="Pinned Issues"
                      >
                        <Pin className="w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="mb-2">
                      <p>Pinned Issues</p>
                    </TooltipContent>
                  </Tooltip>
                  {/* Main Menu */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={menuIconRef}
                        variants={iconVariants}
                        onClick={e => handleActionClick(e, 'menu', menuIconRef)}
                        className="p-2 rounded-full hover:bg-black/5 transition-colors pointer-events-auto active:scale-95"
                        aria-label="Main Menu"
                      >
                        <Menu className="w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="mb-2">
                      <p>Main Menu</p>
                    </TooltipContent>
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
