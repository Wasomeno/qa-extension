import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ViewType, NavigationState, NavigationContextValue } from '@/types/navigation';

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
  initialView: ViewType;
  initialParams?: any;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ 
  children, 
  initialView,
  initialParams 
}) => {
  const [stack, setStack] = useState<NavigationState[]>([
    { view: initialView, params: initialParams }
  ]);

  const current = stack[stack.length - 1];

  const push = useCallback(<T,>(view: ViewType, params?: T) => {
    setStack(prev => [...prev, { view, params }]);
  }, []);

  const pop = useCallback(() => {
    setStack(prev => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const replace = useCallback(<T,>(view: ViewType, params?: T) => {
    setStack(prev => {
      const newStack = [...prev];
      newStack[newStack.length - 1] = { view, params };
      return newStack;
    });
  }, []);

  const reset = useCallback(<T,>(view: ViewType, params?: T) => {
    setStack([{ view, params }]);
  }, []);

  const value: NavigationContextValue = {
    current,
    stack,
    push,
    pop,
    replace,
    reset,
    canGoBack: stack.length > 1,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
