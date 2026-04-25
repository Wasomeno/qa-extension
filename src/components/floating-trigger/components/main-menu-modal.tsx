import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  List,
  Pin,
  PlusCircle,
  SquareKanban,
  Home,
  FileText as FileIcon,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import { useSessionUser } from '@/hooks/use-session-user';
import { MessageType } from '@/types/messages';
import {
  NavigationProvider,
  useNavigation,
} from '@/contexts/navigation-context';
import {
  SelectedProjectProvider,
} from '@/contexts/selected-project-context';
import { ViewType } from '@/types/navigation';
import { useSession } from '@/contexts/session-context';

// Updated imports from new page structure
import { IssuesPage } from '@/pages/issues';
import { BoardsPage } from '@/pages/boards';
import { PinnedPage } from '@/pages/pinned';
import { CreateIssuePage } from '@/pages/issues/create';
import { ProfilePage } from '@/pages/profile';
import { AgentPage } from '@/pages/agent';
import { SessionsListPage } from '@/pages/agent/sessions-list';
import { FixSessionsListPage } from '@/pages/agent/fix-sessions-list';
import { ChatViewPage } from '@/pages/agent/chat-view-page';
import { RecordingsPage } from '@/pages/recordings';
import { TestScenariosPage } from '@/pages/test-scenarios';
import { ScenarioDetail } from '@/pages/test-scenarios/components/scenario-detail';


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

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

interface MenuItem {
  id: ViewType;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'agent', label: 'Homepage', icon: Home },
  { id: 'issues', label: 'Issues', icon: List },
  { id: 'boards', label: 'Issue Boards', icon: SquareKanban },
  { id: 'pinned', label: 'Pinned Issues', icon: Pin },
  { id: 'fix-sessions', label: 'Fix Sessions', icon: Wrench },
  { id: 'recordings', label: 'Recordings', icon: FileIcon },
  { id: 'test-scenarios', label: 'Test Scenarios', icon: FileIcon },
  { id: 'create-issue', label: 'Create Issue', icon: PlusCircle },
];

const MODAL_WIDTH = '1100px';
const MODAL_HEIGHT = '700px';
const MODAL_MAX_WIDTH = '85.5vw';
const MODAL_MAX_HEIGHT = '81vh';

interface MainMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialIssue?: any;
  initialView?: ViewType;
}

const MainMenuInner: React.FC<MainMenuModalProps> = ({
  isOpen,
  onClose,
  initialIssue,
  initialView,
}) => {
  const { current, reset, push, pop } = useNavigation();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const keyboardIsolation = useKeyboardIsolation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [modalContainer, setModalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const session = useSession();
  const hookUser = useSessionUser();
  const { user } = session || hookUser;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
  };

  // Reset isRefreshing when data finishes fetching
  React.useEffect(() => {
    if (isFetching === 0 && isRefreshing) {
      setIsRefreshing(false);
    }
  }, [isFetching, isRefreshing]);

  // Close modal on logout or external trigger
  React.useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const handleMessage = (message: any) => {
        if (
          message.type === MessageType.AUTH_LOGOUT ||
          (message.type === MessageType.AUTH_SESSION_UPDATED &&
            !message.data) ||
          message.type === MessageType.CLOSE_MAIN_MENU
        ) {
          onClose();
        }
      };
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [onClose]);

  // Handle initial state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialIssue) {
        reset('issues', initialIssue);
      } else if (initialView) {
        reset(initialView);
      }
    }
  }, [isOpen, initialIssue, initialView]);

  const handleNavigateToIssue = (issue: any) => {
    push('issue-detail', issue);
  };

  const renderContent = () => {
    switch (current.view) {
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
        return <AgentPage portalContainer={container} />;
      case 'chat-sessions':
        return <SessionsListPage />;
      case 'chat-view':
        return <ChatViewPage sessionId={current.params?.sessionId} />;
      case 'fix-sessions':
        return <FixSessionsListPage portalContainer={container} />;
      case 'recordings':
        return <RecordingsPage portalContainer={container} />;
      case 'test-scenarios':
        return (
          <TestScenariosPage
            portalContainer={container}
          />
        );
      case 'test-scenario-detail':
        return (
          <ScenarioDetail
            scenario={current.params}
            onClose={() => pop()}
            onGenerate={(sheets) => {
              // Handle generate - this would need to be connected to the test scenario API
              console.log('Generate for sheets:', sheets);
            }}
            onDelete={() => {
              // Handle delete
              pop();
            }}
            onViewGeneratedId={(id) => {
              // Navigate to the generated test detail (same as test recording detail)
              const url = chrome.runtime.getURL(`recording-detail.html?id=${id}`);
              chrome.runtime.sendMessage({
                type: MessageType.OPEN_URL,
                data: { url },
              });
            }}
          />
        );
      default:
        return <AgentPage portalContainer={container} />;
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
          pointerEvents: 'auto',
        }}
      />

      {/* Modal Container - Flexbox centering */}
      <div
        ref={setContainer}
        className="fixed inset-0 flex items-center justify-center pointer-events-none"
        style={{ zIndex: 999999 }}
      >
        <motion.div
          ref={setModalContainer}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200 pointer-events-auto"
          style={{
            width: MODAL_WIDTH,
            maxWidth: MODAL_MAX_WIDTH,
            height: MODAL_HEIGHT,
            maxHeight: MODAL_MAX_HEIGHT,
            transformOrigin: 'center center',
          }}
          {...keyboardIsolation}
        >
          <SidebarProvider
            style={{ minHeight: '100%' }}
            className="h-full w-full !min-h-0"
            portalContainer={container}
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
                            ? chrome.runtime.getURL('assets/flowg-logo.png')
                            : ''
                        }
                        alt="FlowG"
                        className="h-6 object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          chrome.runtime.sendMessage({
                            type: MessageType.OPEN_MAIN_MENU_PAGE,
                            data: {
                              initialView: current.view !== 'agent' ? current.view : undefined,
                              initialIssue: current.params || undefined,
                            },
                          });
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500"
                        title="Open in new tab"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </button>
                      <SidebarTrigger className="ml-0" />
                    </div>
                  </div>
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupContent>
                      <SidebarMenu className="space-y-1">
                        {MENU_ITEMS.map(item => {
                          const Icon = item.icon;
                          const isActive =
                            current.view === item.id ||
                            (item.id === 'issues' &&
                              current.view === 'issue-detail');

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
                    <p className="text-xs text-gray-400">v1.0.0</p>
                  </div>
                </SidebarFooter>
                <SidebarRail />
              </Sidebar>

              {/* Content Area */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background relative">
                {/* Global Refresh Icon */}
                <div className="absolute bottom-4 right-4 z-[60]">
                  <button
                    onClick={handleRefresh}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-900"
                  >
                    <RefreshCw
                      className={cn(
                        'w-4 h-4',
                        isRefreshing && 'animate-spin'
                      )}
                    />
                  </button>
                </div>
                <TooltipProvider delayDuration={500}>
                  <div className="flex-1 flex flex-col relative w-full h-full">
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
                </TooltipProvider>
              </div>
            </div>
          </SidebarProvider>
        </motion.div>
      </div>
    </>
  );
};

const MainMenuModal: React.FC<MainMenuModalProps> = props => {
  return (
    <NavigationProvider initialView={props.initialView || 'agent'}>
      <SelectedProjectProvider>
        <AnimatePresence>
          {props.isOpen && <MainMenuInner {...props} />}
        </AnimatePresence>
        <Toaster position="bottom-right" />
      </SelectedProjectProvider>
    </NavigationProvider>
  );
};

export default MainMenuModal;
