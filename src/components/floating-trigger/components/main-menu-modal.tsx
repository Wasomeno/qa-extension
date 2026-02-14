import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  List,
  Pin,
  PlusCircle,
  X,
  SquareKanban,
  Bot,
} from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import { useSessionUser } from '@/hooks/use-session-user';
import { MessageType } from '@/types/messages';
import { NavigationProvider, useNavigation } from '@/contexts/navigation-context';
import { ViewType } from '@/types/navigation';

// Updated imports from new page structure
import { DashboardPage } from '@/pages/dashboard';
import { IssuesPage } from '@/pages/issues';
import { BoardsPage } from '@/pages/boards';
import { PinnedPage } from '@/pages/pinned';
import { CreateIssuePage } from '@/pages/issues/create';
import { ProfilePage } from '@/pages/profile';
import { AgentPage } from '@/pages/agent';

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

interface MenuItem {
  id: ViewType;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'issues', label: 'Issues', icon: List },
  { id: 'boards', label: 'Issue Boards', icon: SquareKanban },
  { id: 'pinned', label: 'Pinned Issues', icon: Pin },
  { id: 'create-issue', label: 'Create Issue', icon: PlusCircle },
  { id: 'agent', label: 'QA Agent', icon: Bot },
];

interface MainMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialIssue?: any;
}

const MainMenuInner: React.FC<MainMenuModalProps> = ({
  isOpen,
  onClose,
  initialIssue,
}) => {
  const { current, reset, push } = useNavigation();
  const keyboardIsolation = useKeyboardIsolation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { user } = useSessionUser();

  // Close modal on logout
  React.useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const handleMessage = (message: any) => {
        if (
          message.type === MessageType.AUTH_LOGOUT ||
          (message.type === MessageType.AUTH_SESSION_UPDATED && !message.data)
        ) {
          onClose();
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [onClose]);

  // Switch to issues view if initialIssue is provided
  React.useEffect(() => {
    if (isOpen && initialIssue) {
      reset('issues', initialIssue);
    }
  }, [isOpen, initialIssue, reset]);

  const handleNavigateToIssue = (issue: any) => {
    push('issue-detail', issue);
  };

  const renderContent = () => {
    switch (current.view) {
      case 'dashboard':
        return <DashboardPage portalContainer={container} />;
      case 'issues':
      case 'issue-detail':
        return (
          <IssuesPage
            initialIssue={current.params}
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
      case 'create-issue':
        return <CreateIssuePage portalContainer={container} />;
      case 'profile':
        return <ProfilePage portalContainer={container} />;
      case 'agent':
        return <AgentPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
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
                      <img
                        src={
                          typeof chrome !== 'undefined' &&
                          chrome.runtime?.getURL
                            ? chrome.runtime.getURL(
                                'assets/log-loom-logo.png'
                              )
                            : ''
                        }
                        alt="LogLoom"
                        className="h-16 w-auto object-cover"
                      />
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
                          const isActive = current.view === item.id || 
                            (item.id === 'issues' && current.view === 'issue-detail');

                          return (
                            <SidebarMenuItem key={item.id}>
                              <SidebarMenuButton
                                isActive={isActive}
                                onClick={() => reset(item.id)}
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
                        isActive={current.view === 'profile'}
                        onClick={() => reset('profile')}
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
                  key={current.view}
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
  );
};

const MainMenuModal: React.FC<MainMenuModalProps> = (props) => {
  return (
    <AnimatePresence>
      {props.isOpen && (
        <NavigationProvider initialView="dashboard">
          <MainMenuInner {...props} />
        </NavigationProvider>
      )}
    </AnimatePresence>
  );
};

export default MainMenuModal;


