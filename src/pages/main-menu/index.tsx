import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  List,
  Pin,
  PlusCircle,
  SquareKanban,
  Home,
  FileText as FileIcon,
  RefreshCw,
  Wrench,
  X,
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
import { ViewType } from '@/types/navigation';
import { useSession } from '@/contexts/session-context';

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
  TooltipProvider,
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

const MainMenuPageInner: React.FC = () => {
  const { current, reset, push, pop } = useNavigation();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const keyboardIsolation = useKeyboardIsolation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const session = useSession();
  const hookUser = useSessionUser();
  const { user } = session || hookUser;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
  };

  useEffect(() => {
    if (isFetching === 0 && isRefreshing) {
      setIsRefreshing(false);
    }
  }, [isFetching, isRefreshing]);

  const handleNavigateToIssue = (issue: any) => {
    push('issue-detail', issue);
  };

  const handleClose = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.getCurrent(tab => {
        if (tab?.id) {
          chrome.tabs.remove(tab.id);
        }
      });
    }
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
        return <TestScenariosPage portalContainer={container} />;
      case 'test-scenario-detail':
        return (
          <ScenarioDetail
            scenario={current.params}
            onClose={() => pop()}
            onGenerate={(sheets) => {
              console.log('Generate for sheets:', sheets);
            }}
            onDelete={() => {
              pop();
            }}
            onViewGeneratedId={(id) => {
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
    <div
      ref={setContainer}
      className="fixed inset-0 flex flex-col bg-white"
      {...keyboardIsolation}
    >
      {/* Top bar */}
      <div className="h-14 border-b border-gray-200/60 flex items-center justify-between px-6 bg-white/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={
              typeof chrome !== 'undefined' && chrome.runtime?.getURL
                ? chrome.runtime.getURL('assets/flowg-logo.png')
                : ''
            }
            alt="FlowG"
            className="h-7 object-cover"
          />
          <span className="text-sm font-semibold text-gray-700 tracking-tight">QA Command Center</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            title="Refresh"
          >
            <RefreshCw
              className={cn(
                'w-4 h-4',
                isRefreshing && 'animate-spin'
              )}
            />
          </button>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <SidebarProvider
          style={{ minHeight: '100%' }}
          className="h-full w-full !min-h-0"
          portalContainer={container}
        >
          <Sidebar
            collapsible="icon"
            className="!absolute !h-full border-r border-gray-200/60"
          >
            <SidebarHeader>
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
                  <img
                    src={
                      typeof chrome !== 'undefined' && chrome.runtime?.getURL
                        ? chrome.runtime.getURL('assets/flowg-logo.png')
                        : ''
                    }
                    alt="FlowG"
                    className="h-6 object-cover"
                  />
                </div>
                <div className="flex items-center gap-1">
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
            <TooltipProvider delayDuration={500}>
              <motion.div
                key={current.view}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col relative w-full h-full"
              >
                {renderContent()}
              </motion.div>
            </TooltipProvider>
          </div>
        </SidebarProvider>
      </div>
    </div>
  );
};

const MainMenuPage: React.FC = () => {
  const [initialView, setInitialView] = useState<ViewType>('agent');
  const [initialIssue, setInitialIssue] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('initialView') as ViewType | null;
    const issueParam = params.get('initialIssue');

    if (viewParam) {
      setInitialView(viewParam);
    }

    if (issueParam) {
      try {
        setInitialIssue(JSON.parse(issueParam));
      } catch (e) {
        console.error('Failed to parse initialIssue:', e);
      }
    }
  }, []);

  return (
    <NavigationProvider initialView={initialView} initialParams={initialIssue}>
      <MainMenuPageInner />
      <Toaster position="bottom-right" />
    </NavigationProvider>
  );
};

export default MainMenuPage;
