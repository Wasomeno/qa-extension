import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, List, Pin, PlusCircle, X, SquareKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import { useSessionUser } from '@/hooks/use-session-user';

// Updated imports from new page structure
import { DashboardPage } from '@/pages/dashboard';
import { IssuesPage } from '@/pages/issues';
import { BoardsPage } from '@/pages/boards';
import { PinnedPage } from '@/pages/pinned';
import { CreateIssuePage } from '@/pages/issues/create';
import { ProfilePage } from '@/pages/profile';

type MenuView = 'dashboard' | 'issues' | 'boards' | 'pinned' | 'create' | 'profile';

interface MenuItem {
  id: MenuView;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'issues', label: 'Issues', icon: List },
  { id: 'boards', label: 'Issue Boards', icon: SquareKanban },
  { id: 'pinned', label: 'Pinned Issues', icon: Pin },
  { id: 'create', label: 'Create Issue', icon: PlusCircle },
];

interface MainMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialIssue?: any;
}

const MainMenuModal: React.FC<MainMenuModalProps> = ({
  isOpen,
  onClose,
  initialIssue,
}) => {
  const [activeView, setActiveView] = useState<MenuView>('dashboard');
  const keyboardIsolation = useKeyboardIsolation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { user } = useSessionUser();

  // Switch to issues view if initialIssue is provided
  React.useEffect(() => {
    if (isOpen && initialIssue) {
      setActiveView('issues');
    }
  }, [isOpen, initialIssue]);

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardPage />;
      case 'issues':
        return <IssuesPage initialIssue={initialIssue} />;
      case 'boards':
        return <BoardsPage />;
      case 'pinned':
        return <PinnedPage />;
      case 'create':
        return <CreateIssuePage portalContainer={container} />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{
              zIndex: 999998,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal Container - Flexbox centering */}
          <div
            ref={setContainer}
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 999999 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200 pointer-events-auto"
              style={{
                width: '1000px',
                maxWidth: '95vw',
                height: '700px',
                maxHeight: '90vh',
                transformOrigin: 'center center',
              }}
              {...keyboardIsolation}
            >
              <div className="flex h-full">
                {/* Sidebar */}
                <div className="w-[220px] bg-gray-50/80 border-r border-gray-200/60 flex flex-col">
                  {/* Logo / Header */}
                  <div className="px-5 py-5 border-b border-gray-200/60">
                    <h2 className="text-base font-semibold text-gray-900">
                      Gitlab Companion
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">Workspace</p>
                  </div>

                  {/* Menu Items */}
                  <nav className="flex-1 px-3 py-4 space-y-1">
                    {MENU_ITEMS.map(item => {
                      const Icon = item.icon;
                      const isActive = activeView === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveView(item.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                            isActive
                              ? 'bg-gray-200/80 text-gray-900'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          )}
                        >
                          <Icon
                            className={cn(
                              'w-5 h-5 flex-shrink-0',
                              isActive ? 'text-gray-700' : 'text-gray-400'
                            )}
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>

                  {/* User Card */}
                  <div className="px-3 py-3 border-t border-gray-200/60">
                    <button
                      onClick={() => setActiveView('profile')}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all duration-150',
                        activeView === 'profile'
                          ? 'bg-gray-200/80'
                          : 'hover:bg-gray-100'
                      )}
                    >
                      {/* Avatar placeholder */}
                      {user?.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.name || user.username}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-white">
                            {(user?.name || user?.username || 'U')
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user?.name || user?.username || 'Guest User'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user ? `@${user.username}` : 'Not logged in'}
                        </p>
                      </div>
                    </button>
                    <p className="text-[10px] text-gray-400 mt-2 px-2">
                      v1.0.0
                    </p>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <motion.div
                    key={activeView}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 flex flex-col relative w-full h-full"
                  >
                    {renderContent()}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MainMenuModal;
