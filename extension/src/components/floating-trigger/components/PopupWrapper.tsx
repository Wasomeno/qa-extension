import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';

interface PopupWrapperProps {
  position: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement>;
  width?: number;
}

const PopupWrapper: React.FC<PopupWrapperProps> = ({
  position,
  onClose,
  children,
  containerRef,
  width = 420,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const portalRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside the popup
  React.useEffect(() => {
    let targetEl: Document | ShadowRoot | null = null;

    const handleClickOutside = (event: Event) => {
      // Use composedPath to handle shadow DOM event retargeting
      const path = event.composedPath();
      const clickedInsidePopup = path.some(el => el === popupRef.current);

      // Debug: log when clicking inside but it's not detected
      if (!clickedInsidePopup) {
        console.log(
          'Click outside - path:',
          path.map((el: any) => el.nodeName || el.constructor.name).slice(0, 10)
        );
        onClose();
      } else {
        console.log('Click inside - NOT closing');
      }
    };

    // Add event listener with a small delay to prevent immediate closure
    // Listen on the shadow root's container/document to catch events properly
    const timeoutId = setTimeout(() => {
      // Try to get the root element (could be shadow root or document)
      const rootEl = popupRef.current?.getRootNode() as Document | ShadowRoot;
      targetEl = rootEl && 'addEventListener' in rootEl ? rootEl : document;

      targetEl.addEventListener('mousedown', handleClickOutside);
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      if (targetEl) {
        targetEl.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [onClose]);

  return (
    <>
      <motion.div
        ref={el => {
          // @ts-ignore
          popupRef.current = el;
          if (containerRef) {
            // @ts-ignore
            containerRef.current = el;
          }
        }}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200"
        style={{
          left: position.x,
          bottom: window.innerHeight - position.y,
          width: width,
          zIndex: 1000000,
        }}
        {...keyboardIsolation}
      >
        {children}

        {/* Tooltip arrow pointing down */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            bottom: -8,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid white',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            bottom: -9,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: '9px solid #e5e7eb',
          }}
        />
      </motion.div>
      <div ref={portalRef} className="pointer-events-none" />
    </>
  );
};

export default PopupWrapper;
