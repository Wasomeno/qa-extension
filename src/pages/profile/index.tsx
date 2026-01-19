import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Bell, LogOut, ChevronRight } from 'lucide-react';
import { useSessionUser } from '@/hooks/use-session-user';
import { api } from '@/services/api';

export const ProfilePage: React.FC = () => {
  const { user, clearUser } = useSessionUser();

  const handleLogout = async () => {
    try {
      // Optional: Call backend logout if needed
      // await api.post('/auth/logout');

      // Clear local session
      await clearUser();

      // Refresh or redirect if needed
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  return (
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
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name || user.username}
              className="w-20 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-2xl font-semibold text-white">
                {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              {user?.name || user?.username || 'Guest User'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              @{user?.username || 'username'}
            </p>
            {/* Note: User interface doesn't strictly have email in all cases, but we assume it might */}
            <p className="text-sm text-gray-500">
              {user?.public_email || user?.email || 'No public email'}
            </p>

            <div className="flex items-center gap-2 mt-3">
              {/* We can infer connection status from provider, or just show GitLab as connected since we likely logged in via it */}
              {user && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  GitLab Connected
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
                <p className="text-sm font-medium text-gray-900">
                  Notifications
                </p>
                <p className="text-xs text-gray-500">Desktop: On • Sound: On</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <div className="pt-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </ScrollArea>
  );
};

export default ProfilePage;
