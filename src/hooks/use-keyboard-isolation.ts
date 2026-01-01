import { useCallback } from 'react';

/**
 * Custom hook to provide keyboard event isolation for popup components.
 * Prevents keyboard events from propagating to the underlying webpage.
 */
export const useKeyboardIsolation = () => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  // Return an object with all keyboard event handlers
  return {
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    onKeyPress: handleKeyPress,
  };
};