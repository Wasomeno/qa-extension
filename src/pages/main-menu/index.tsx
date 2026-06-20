import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  List,
  PlusCircle,
  FileText as FileIcon,
} from 'lucide-react';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
import { useSessionUser } from '@/hooks/use-session-user';
import {
  NavigationProvider,
  useNavigation,
} from '@/contexts/navigation-context';
import { ViewType } from '@/types/navigation';
import { useSession } from '@/contexts/session-context';

import { IssuesPage } from '@/pages/issues';
import { CreateIssuePage } from '@/pages/issues/create';
import { ProfilePage } from '@/pages/profile';
import { RecordingsPage } from '@/pages/recordings';

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
  { id: 'recordings', label: 'Recordings', icon: FileIcon },
  { id: 'create-issue', label: 'Create Issue', icon: PlusCircle },
  { id: 'issues', label: 'Find Issue', icon: List },
];

const EXTENSION_VIEWS = new Set<ViewType>([
  'recordings',
  'create-issue',
  'issues',
  'issue-detail',
  'profile',
]);

const DEFAULT_EXTENSION_VIEW: ViewType = 'recordings';

const MainMenuPageInner: React.FC = () => {
  const { current, reset } = useNavigation();
  const keyboardIsolation = useKeyboardIsolation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const session = useSession();
  const hookUser = useSessionUser();
  const { user } = session || hookUser;

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
      case 'create-issue':
        return <CreateIssuePage portalContainer={container} />;
      case 'profile':
        return <ProfilePage portalContainer={container} />;
      case 'recordings':
        return <RecordingsPage portalContainer={container} />;
      default:
        return <RecordingsPage portalContainer={container} />;
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
  const [initialView, setInitialView] = useState<ViewType>(DEFAULT_EXTENSION_VIEW);
  const [initialIssue, setInitialIssue] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('initialView') as ViewType | null;
    const issueParam = params.get('initialIssue');

    if (viewParam && EXTENSION_VIEWS.has(viewParam)) {
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
