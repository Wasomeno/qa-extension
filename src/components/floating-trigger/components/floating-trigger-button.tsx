import React from 'react';
import { motion, AnimatePresence, useAnimationFrame } from 'framer-motion';
import {
  PlusCircle,
  Menu,
  LogIn,
  FileText,
  Square,
  CircleDot,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
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
    action: 'issue' | 'menu' | 'login' | 'record' | 'start-recording',
    iconRect: DOMRect,
    capsuleRect: DOMRect
  ) => void;
  hasActivePopup?: boolean;
  isLoggedIn?: boolean;
  isLoading?: boolean;
  tooltipContainer?: HTMLElement | null;
  isRecording?: boolean;
  recordingStartTime?: number | null;
  onStopRecording?: () => void;
  isHovered?: boolean;
  isStopping?: boolean;
  isVideoSubmitProcessing?: boolean;
  videoSubmitTitle?: string;
  videoEditStatus?: 'success' | 'error';
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
  isRecording = false,
  recordingStartTime = null,
  onStopRecording,
  isHovered = false,
  isStopping = false,
  isVideoSubmitProcessing = false,
  videoSubmitTitle,
  videoEditStatus,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [hoveredAction, setHoveredAction] = React.useState<string | null>(null);
  const isPopoverOpen = false;
  const createIconRef = React.useRef<HTMLButtonElement>(null);
  const recordIconRef = React.useRef<HTMLButtonElement>(null);
  const startRecordIconRef = React.useRef<HTMLButtonElement>(null);
  const menuIconRef = React.useRef<HTMLButtonElement>(null);
  const loginIconRef = React.useRef<HTMLButtonElement>(null);
  const starRef = React.useRef<HTMLDivElement>(null);

  const [duration, setDuration] = React.useState('00:00');

  React.useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setDuration('00:00');
      return;
    }

    const updateDuration = () => {
      const elapsedMs = Date.now() - recordingStartTime;
      const seconds = Math.floor((elapsedMs / 1000) % 60);
      const minutes = Math.floor((elapsedMs / 1000 / 60) % 60);
      setDuration(
        `${minutes.toString().padStart(2, '0')}:${seconds
          .toString()
          .padStart(2, '0')}`
      );
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  // Provide root element to parent if requested
  React.useEffect(() => {
    if (containerRef) containerRef(rootRef.current);
  }, [containerRef]);

  // Notify parent of hover state changes
  React.useEffect(() => {
    // This is now handled via onMouseEnter/onMouseLeave calling onHoverChange directly
  }, [isHovered, onHoverChange]);

  // Drive the comet's offsetDistance manually for reliable cross-browser animation.
  const COMET_ORBIT_MS = 5000;
  useAnimationFrame((time) => {
    if (!starRef.current) return;
    const t = (time % COMET_ORBIT_MS) / COMET_ORBIT_MS;
    // EaseInOutQuad: slow -> fast -> slow (seamless loop at the seam).
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    starRef.current.style.offsetDistance = `${eased * 100}%`;
  });

  const handleActionClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    action: 'issue' | 'menu' | 'login' | 'record' | 'start-recording',
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

  // During auth loading, hide content and show pulsing animation.
  // Video submit processing owns its own expanded loader state.
  // Success/error states also use the processing slot.
  const hasVideoStatus = !!(videoEditStatus || isVideoSubmitProcessing);
  const isVideoProcessingState = isVideoSubmitProcessing || !!videoEditStatus;
  const isLoadingState = isLoading && !isVideoProcessingState;
  // Inner breathing highlight is reserved for auth loading only.
  // Video processing uses its own outer halo + star-on-border effects.
  const isBreathing = isLoadingState;

  // Show expanded state if hovered OR if there's an active popup OR if popover is open.
  // Never expand while recording, processing a video edit, loading, or just after stopping.
  const isExpanded =
    (isHovered || hasActivePopup || isPopoverOpen) &&
    !isRecording &&
    !isVideoProcessingState &&
    !isLoadingState &&
    !isStopping;

  // Calculate position adjustment to keep capsule centered horizontally
  // and grow from bottom to top vertically
  // PRIORITY: isRecording > isVideoProcessingState > isLoadingState > isLoggedIn
  const processingWidth = 240;
  const restingWidth = isRecording
    ? 220
    : isVideoProcessingState
      ? processingWidth
      : isLoadingState
        ? 44
        : isLoggedIn
          ? 100
          : 40;
  const expandedWidth = isRecording
    ? 220
    : isVideoProcessingState
      ? processingWidth
      : isLoggedIn
        ? 240
        : 60; // Width for the focused action set
  const restingHeight = isRecording || isVideoProcessingState ? 48 : 24;
  const expandedHeight = isRecording || isVideoProcessingState ? 48 : 52;

  // During loading, recording, or video submit processing, hide standard content
  const showContent = !isLoadingState && !isRecording && !isVideoProcessingState;

  return (
    <>
      {/* Comet + pulsing halo layer — rendered behind the capsule */}
      {isVideoProcessingState && !videoEditStatus && (
        <motion.div
          style={{
            position: 'fixed',
            zIndex: 999998,
            left: '50%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
          initial={false}
          animate={{
            top: position.y - 48,
            width: processingWidth,
            height: 48,
            borderRadius: 24,
            x: '-50%',
          }}
          transition={{ type: 'spring', stiffness: 260, damping: 25, mass: 0.8 }}
        >
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(59, 130, 246, 0)',
                '0 0 16px 4px rgba(59, 130, 246, 0.18)',
              ],
            }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          />
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div
              ref={starRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 0,
                height: 0,
                boxShadow:
                  '0 0 14px 10px rgba(59, 130, 246, 0.28), 0 0 32px 20px rgba(147, 197, 253, 0.1)',
                offsetPath:
                  "path('M 24,0 H 216 A 24,24 0 0 1 240,24 A 24,24 0 0 1 216,48 H 24 A 24,24 0 0 1 0,24 A 24,24 0 0 1 24,0')",
                offsetRotate: '0deg',
                offsetDistance: '0%',
              }}
            />
          </div>
        </motion.div>
      )}
      {/* Capsule at bottom center */}
      <motion.div
        ref={rootRef}
        initial={false}
        onMouseEnter={() => !isRecording && !isVideoProcessingState && !isLoadingState && !isStopping && onHoverChange?.(true)}
        onMouseLeave={() => {
          onHoverChange?.(false);
          setHoveredAction(null);
        }}
        className="fixed bg-white/95 backdrop-blur-xs border border-black/5 shadow-sm"
        style={{
          display: hidden ? 'none' : undefined,
          zIndex: 999999,
          pointerEvents: hidden ? 'none' : 'auto',
          overflow: isExpanded ? 'visible' : 'hidden',
          transformOrigin: 'center bottom',
          left: '50%',
          x: '-50%',
        }}
        animate={
          isRecording
            ? {
                top: position.y - 48,
                width: 220,
                height: 48,
                borderRadius: 24,
                opacity: opacity,
                scale: 1,
                backgroundColor: 'rgb(220 38 38)', // bg-red-600
                boxShadow: '0 8px 24px rgba(220, 38, 38, 0.4)',
              }
            : isVideoProcessingState
            ? videoEditStatus === 'success'
              ? {
                  top: position.y - 48,
                  width: processingWidth,
                  height: 48,
                  borderRadius: 24,
                  opacity: opacity,
                  scale: 1,
                  backgroundColor: 'rgb(240 253 244)', // emerald-50
                  boxShadow: '0 8px 24px rgba(74, 222, 128, 0.25)',
                }
              : videoEditStatus === 'error'
              ? {
                  top: position.y - 48,
                  width: processingWidth,
                  height: 48,
                  borderRadius: 24,
                  opacity: opacity,
                  scale: 1,
                  backgroundColor: 'rgb(254 242 242)', // red-50
                  boxShadow: '0 8px 24px rgba(248, 113, 113, 0.2)',
                }
              : {
                  top: position.y - 48,
                  width: processingWidth,
                  height: 48,
                  borderRadius: 24,
                  opacity: opacity,
                  scale: 1,
                  backgroundColor: 'rgb(255 255 255)',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.18)',
                }
            : isLoadingState
            ? {
                top: position.y - 28,
                width: 90,
                height: 28,
                borderRadius: 14,
                opacity: opacity,
                overflow: 'visible',
                scale: [1, 1.04, 1],
                backgroundColor: ['rgb(255 255 255)', 'rgb(243 248 255)', 'rgb(255 255 255)'],
                boxShadow: [
                  '0 2px 8px rgba(59, 130, 246, 0.12)',
                  '0 0 18px rgba(59, 130, 246, 0.28), 0 4px 14px rgba(59, 130, 246, 0.16)',
                  '0 2px 8px rgba(59, 130, 246, 0.12)',
                ],
              }
            : {
                top: isExpanded ? position.y - expandedHeight : position.y - restingHeight,
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
        {isBreathing && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            style={{ zIndex: 0 }}
            animate={{
              scale: [1, 1.02],
              boxShadow: [
                'inset 0 0 0 0 rgba(59, 130, 246, 0)',
                'inset 0 0 16px rgba(59, 130, 246, 0.18)',
              ],
            }}
            transition={{ duration: 0.9, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          />
        )}
        <TooltipProvider delayDuration={200}>
          <div className="relative z-10 flex items-center justify-center h-full w-full">
            <AnimatePresence mode="wait">
              {isLoadingState ? (
                <motion.div
                  key="loading-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center w-full"
                />
              ) : isRecording ? (
                <motion.div
                  key="recording-container"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center justify-between w-full px-4 text-white"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                    <span className="text-sm font-mono font-bold tracking-widest">{duration}</span>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onStopRecording?.();
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors border border-white/20"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span className="text-[11px] font-bold uppercase tracking-wide">Stop</span>
                  </motion.button>
                </motion.div>
              ) : isVideoProcessingState ? (
                <AnimatePresence mode="wait">
                  {videoEditStatus === 'success' ? (
                    <motion.div
                      key="video-success-container"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="flex items-center gap-3 w-full px-4"
                      aria-live="polite"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/70">
                          Test generated
                        </div>
                        <div className="text-sm font-medium text-emerald-800 truncate">
                          {videoSubmitTitle || 'Ready to review'}
                        </div>
                      </div>
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 20 }}
                        className="flex-shrink-0"
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-200/60 flex items-center justify-center">
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      </motion.div>
                    </motion.div>
                  ) : videoEditStatus === 'error' ? (
                    <motion.div
                      key="video-error-container"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="flex items-center gap-3 w-full px-4"
                      aria-live="polite"
                    >
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shadow-sm">
                        <XCircle className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-600/70">
                          Generation failed
                        </div>
                        <div className="text-sm font-medium text-red-700 truncate">
                          {videoSubmitTitle || 'Please try again'}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="video-processing-container"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center justify-center w-full px-4"
                      aria-live="polite"
                    >
                      <div className="min-w-0 text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                          Processing video
                        </div>
                        <div className="text-sm font-medium text-gray-700 truncate">
                          {videoSubmitTitle || 'Generating test'}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              ) : showContent && isExpanded && !isLoggedIn && (
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
                        <LogIn className="relative z-10 w-5 h-5 text-gray-700" />
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
                        <PlusCircle className="relative z-10 w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Create Issue</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Start Recording */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        ref={startRecordIconRef}
                        variants={iconVariants}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onMouseEnter={() => setHoveredAction('start-recording')}
                        onMouseLeave={() => setHoveredAction(null)}
                        onClick={e =>
                          handleActionClick(e, 'start-recording', startRecordIconRef)
                        }
                        className="relative flex items-center justify-center p-2 rounded-full pointer-events-auto"
                        aria-label="Start Recording"
                      >
                        {hoveredAction === 'start-recording' && (
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
                        <CircleDot className="relative z-10 w-5 h-5 text-red-600 drop-shadow-sm" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Start Recording</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Record Test List */}
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
                        aria-label="Recordings"
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
                        <FileText className="relative z-10 w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Recordings</p>
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
                        aria-label="Open QA Webapp"
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
                        <Menu className="relative z-10 w-5 h-5 text-gray-700" />
                      </motion.button>
                    </TooltipTrigger>
                    {!hasActivePopup && (
                      <TooltipContent side="top" className="mb-2" container={tooltipContainer}>
                        <p>Open QA Webapp</p>
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
