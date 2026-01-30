import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  List,
  Pin,
  PlusCircle,
  X,
  SquareKanban,
} from 'lucide-react';
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

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarRail,
} from '@/components/ui/sidebar';

type MenuView =
  | 'dashboard'
  | 'issues'
  | 'boards'
  | 'pinned'
  | 'create'
  | 'profile';

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
  const [internalIssue, setInternalIssue] = useState<any>(null);

  // Switch to issues view if initialIssue is provided
  React.useEffect(() => {
    if (isOpen && initialIssue) {
      setActiveView('issues');
    }
  }, [isOpen, initialIssue]);

  const handleNavigateToIssue = (issue: any) => {
    setInternalIssue(issue);
    setActiveView('issues');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardPage portalContainer={container} />;
      case 'issues':
        return (
          <IssuesPage
            initialIssue={internalIssue || initialIssue}
            portalContainer={container}
          />
        );
      case 'boards':
        return (
          <BoardsPage
            portalContainer={container}
            onNavigateToIssue={handleNavigateToIssue}
          />
        );
      case 'pinned':
        return <PinnedPage portalContainer={container} />;
      case 'create':
        return <CreateIssuePage portalContainer={container} />;
      case 'profile':
        return <ProfilePage portalContainer={container} />;
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
              className="relative bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200 pointer-events-auto"
              style={{
                width: '1000px',
                maxWidth: '95vw',
                height: '700px',
                maxHeight: '90vh',
                transformOrigin: 'center center',
              }}
              {...keyboardIsolation}
            >
              <SidebarProvider
                style={{ minHeight: '100%' }}
                className="h-full w-full !min-h-0"
              >
                <div className="flex h-full w-full">
                  <Sidebar
                    collapsible="icon"
                    className="!absolute !h-full border-r border-gray-200/60"
                  >
                    <SidebarHeader>
                      <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                          <h2 className="text-sm font-semibold text-gray-900 truncate">
                            Gitlab Companion
                          </h2>
                          <p className="text-xs text-gray-500 truncate">
                            Workspace
                          </p>
                        </div>
                        <SidebarTrigger className="ml-auto" />
                      </div>
                    </SidebarHeader>
                    <SidebarContent>
                      <SidebarGroup>
                        <SidebarGroupContent>
                          <SidebarMenu className="space-y-1">
                            {MENU_ITEMS.map(item => {
                              const Icon = item.icon;
                              const isActive = activeView === item.id;

                              return (
                                <SidebarMenuItem key={item.id}>
                                  <SidebarMenuButton
                                    isActive={isActive}
                                    onClick={() => setActiveView(item.id)}
                                    tooltip={item.label}
                                  >
                                    <Icon />
                                    <span>{item.label}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter>
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={activeView === 'profile'}
                            onClick={() => setActiveView('profile')}
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                          >
                            {/* Avatar placeholder */}
                            {user?.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={user.name || user.username}
                                className="h-8 w-8 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <span className="text-xs font-medium">
                                  {(user?.name || user?.username || 'U')
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="grid flex-1 text-left text-sm leading-tight">
                              <span className="truncate font-semibold">
                                {user?.name || user?.username || 'Guest User'}
                              </span>
                              <span className="truncate text-xs">
                                {user ? `@${user.username}` : 'Not logged in'}
                              </span>
                            </div>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                      <div className="px-4 py-2 group-data-[collapsible=icon]:hidden">
                        <p className="text-[10px] text-gray-400">v1.0.0</p>
                      </div>
                    </SidebarFooter>
                    <SidebarRail />
                  </Sidebar>

                  {/* Content Area */}
                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
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
              </SidebarProvider>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MainMenuModal;
