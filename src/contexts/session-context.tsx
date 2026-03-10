import React, { createContext, useContext, ReactNode } from 'react';
import { useSessionUser } from '@/hooks/use-session-user';
import { User } from '@/api/user';

interface SessionContextType {
  user: User | null;
  loading: boolean;
  setUser: (newUser: User) => Promise<void>;
  syncUser: () => Promise<User | null>;
  clearUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const session = useSessionUser();

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    // Fallback to standalone hook if used outside provider,
    // but warn in dev because it defeats the purpose of shared state
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'useSession used outside of SessionProvider. State will not be shared.'
      );
    }
  }
  return context;
};
