import React, { useState } from 'react';
import { CreateIssueContent } from './CreateIssueContent';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  List,
  Pin,
  PlusCircle,
  X,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { IssuesContent } from './issues-content';
import { IssueCard } from './issues-content/IssueCard';
import { MOCK_PINNED_ISSUES } from './issues-content/mock-data';
import { PinColorPicker } from './issues-content/PinColorPicker';
import { PinNoteModal } from './issues-content/PinNoteModal';
import { MockIssue, PinColor } from './issues-content/types';

type MenuView = 'dashboard' | 'issues' | 'pinned' | 'create' | 'profile';

interface MenuItem {
  id: MenuView;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'issues', label: 'Issues', icon: List },
  { id: 'pinned', label: 'Pinned Issues', icon: Pin },
  { id: 'create', label: 'Create Issue', icon: PlusCircle },
];

interface MainMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MainMenuModal: React.FC<MainMenuModalProps> = ({ isOpen, onClose }) => {
  const [activeView, setActiveView] = useState<MenuView>('dashboard');
  const keyboardIsolation = useKeyboardIsolation();

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardContent />;
      case 'issues':
        return <IssuesContent />;
      case 'pinned':
        return <PinnedContent />;
      case 'create':
        return <CreateIssueContent />;
      case 'profile':
        return <ProfileContent />;
      default:
        return <DashboardContent />;
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
              }}
              {...keyboardIsolation}
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors z-10"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
              </button>

              <div className="flex h-full">
                {/* Sidebar */}
                <div className="w-[220px] bg-gray-50/80 border-r border-gray-200/60 flex flex-col">
                  {/* Logo / Header */}
                  <div className="px-5 py-5 border-b border-gray-200/60">
                    <h2 className="text-base font-semibold text-gray-900">
                      QA Extension
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
                      {/*{user?.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName || user.username}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-white">
                            {(user?.fullName || user?.username || 'U')
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user?.fullName || user?.username || 'User'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user?.email || 'Not signed in'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />*/}
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
                    className="h-full"
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

// ==================== Content Components ====================

const DashboardContent: React.FC = () => (
  <ScrollArea className="h-full">
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your QA activities
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Open Issues" value="12" color="text-blue-600" />
        <StatCard title="Closed Today" value="5" color="text-green-600" />
        <StatCard title="Pinned" value="3" color="text-amber-600" />
        <StatCard title="This Week" value="28" color="text-purple-600" />
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Recent Activity
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="p-4 bg-gray-50 rounded-xl border border-gray-100"
            >
              <div className="text-sm text-gray-700">
                Issue #{i * 100 + 23} updated
              </div>
              <div className="text-xs text-gray-400 mt-1">{i} hour ago</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </ScrollArea>
);

const PinnedContent: React.FC = () => {
  const [pinnedIssues, setPinnedIssues] = useState(MOCK_PINNED_ISSUES);
  const [editingColorIssueId, setEditingColorIssueId] = useState<string | null>(
    null
  );
  const [editingNoteIssue, setEditingNoteIssue] = useState<MockIssue | null>(
    null
  );

  const handleUnpin = (issue: MockIssue) => {
    setPinnedIssues(prev => prev.filter(i => i.id !== issue.id));
  };

  const handleSetColor = (issue: MockIssue, color: PinColor) => {
    setPinnedIssues(prev =>
      prev.map(i =>
        i.id === issue.id
          ? {
              ...i,
              pinnedMeta: i.pinnedMeta
                ? { ...i.pinnedMeta, pinColor: color }
                : undefined,
            }
          : i
      )
    );
    setEditingColorIssueId(null);
  };

  const handleSaveNote = (note: string) => {
    if (!editingNoteIssue) return;
    setPinnedIssues(prev =>
      prev.map(i =>
        i.id === editingNoteIssue.id
          ? {
              ...i,
              pinnedMeta: i.pinnedMeta ? { ...i.pinnedMeta, note } : undefined,
            }
          : i
      )
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pinned Issues</h1>
            <p className="text-sm text-gray-500 mt-1">
              Quick access to your important issues
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100">
            <Pin className="w-3.5 h-3.5 text-amber-500 fill-current" />
            <span className="text-xs font-medium text-amber-700">
              {pinnedIssues.length} Pinned
            </span>
          </div>
        </div>

        {pinnedIssues.length > 0 ? (
          <div className="grid grid-cols-1 gap-1">
            {pinnedIssues.map(issue => (
              <div key={issue.id} className="relative">
                <IssueCard
                  issue={issue}
                  variant="pinned"
                  onClick={() => console.log('Clicked issue:', issue.id)}
                  onUnpin={handleUnpin}
                  onSetPinColor={iss => setEditingColorIssueId(iss.id)}
                  onAddNote={iss => setEditingNoteIssue(iss)}
                />

                {/* Color Picker Overlay */}
                <AnimatePresence>
                  {editingColorIssueId === issue.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-12 z-50"
                    >
                      <PinColorPicker
                        currentColor={issue.pinnedMeta?.pinColor}
                        onSelect={color => handleSetColor(issue, color)}
                        onClose={() => setEditingColorIssueId(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Pin className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-700">
              No pinned issues
            </h3>
            <p className="text-sm text-gray-400 mt-1 max-w-xs px-4">
              Pin important issues from the Issues tab to keep them here for
              quick access.
            </p>
          </div>
        )}
      </div>

      <PinNoteModal
        isOpen={!!editingNoteIssue}
        onClose={() => setEditingNoteIssue(null)}
        onSave={handleSaveNote}
        initialNote={editingNoteIssue?.pinnedMeta?.note}
        issueTitle={editingNoteIssue?.title || ''}
      />
    </ScrollArea>
  );
};

interface ProfileContentProps {
  user?: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    avatarUrl?: string;
    gitlabConnected: boolean;
    slackConnected: boolean;
    preferences: {
      defaultProject?: string;
      notificationSettings: {
        desktop: boolean;
        sound: boolean;
      };
    };
  } | null;
  onLogout?: () => void;
}

const ProfileContent: React.FC<ProfileContentProps> = ({ user, onLogout }) => (
  <ScrollArea className="h-full">
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile Card */}
      <div className="flex items-start gap-5 p-6 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl border border-gray-200/60">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.fullName || user.username}
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-2xl font-semibold text-white">
              {(user?.fullName || user?.username || 'U')
                .charAt(0)
                .toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">
            {user?.fullName || user?.username || 'User'}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            @{user?.username || 'username'}
          </p>
          <p className="text-sm text-gray-500">{user?.email || 'No email'}</p>
          <div className="flex items-center gap-2 mt-3">
            {user?.gitlabConnected && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                GitLab Connected
              </span>
            )}
            {user?.slackConnected && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                Slack Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Settings</h3>

        {/* Settings Items */}
        <div className="space-y-2">
          <button className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer text-left">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                General Settings
              </p>
              <p className="text-xs text-gray-500">
                Configure default project and preferences
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </button>

          <button className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer text-left">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Notifications</p>
              <p className="text-xs text-gray-500">
                Desktop:{' '}
                {user?.preferences?.notificationSettings?.desktop
                  ? 'On'
                  : 'Off'}{' '}
                • Sound:{' '}
                {user?.preferences?.notificationSettings?.sound ? 'On' : 'Off'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Logout Button */}
      <div className="pt-4">
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  </ScrollArea>
);

// ==================== Helper Components ====================

interface StatCardProps {
  title: string;
  value: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, color }) => (
  <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
    <div className={cn('text-3xl font-bold', color)}>{value}</div>
    <div className="text-xs text-gray-500 mt-1">{title}</div>
  </div>
);

export default MainMenuModal;
