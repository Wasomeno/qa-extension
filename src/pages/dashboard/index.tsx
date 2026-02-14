import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/api/dashboard';
import { ActivityItem } from './components/activity-item';
import { ActivityItemSkeleton } from './components/activity-item-skeleton';
import { IssueDetailPage } from '../issues/detail';
import { AnimatePresence } from 'framer-motion';
import { Issue } from '@/api/issue';
import { MessageSquareOff } from 'lucide-react';

interface DashboardPageProps {
  portalContainer?: HTMLElement | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  portalContainer,
}) => {
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await getDashboardStats();
      return res.data;
    },
  });

  if (selectedIssue) {
    return (
      <AnimatePresence mode="wait">
        <IssueDetailPage
          key={selectedIssue.id}
          issue={selectedIssue}
          onBack={() => setSelectedIssue(null)}
          portalContainer={portalContainer}
        />
      </AnimatePresence>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none p-8 pb-0 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your QA activities and recent team updates.
          </p>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Recent Activity
            </h3>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-8 pt-6 pb-8">
          <div className="grid gap-4 max-w-4xl">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <ActivityItemSkeleton key={i} />
                ))
              : stats?.recent_activities?.map((activity, index) => (
                  <ActivityItem
                    key={`${activity.issue_id}-${activity.created_at}-${index}`}
                    activity={activity}
                    onIssueClick={() =>
                      setSelectedIssue({
                        id: activity.issue_id,
                        iid: activity.issue_iid,
                        project_id: activity.project_id,
                        title: activity.title,
                        web_url: activity.web_url,
                        description: activity.description || '',
                        state: 'opened',
                        author: {
                          id: 0,
                          name: activity.actor_name,
                          username: activity.actor_name
                            .toLowerCase()
                            .replace(/\s+/g, '_'),
                          avatar_url: activity.actor_avatar,
                          state: 'active',
                          web_url: '',
                        },
                        created_at: activity.created_at,
                        updated_at: activity.created_at,
                        project_name: 'Issue Activity', // Fallback name
                        labels: [],
                        label_details: [],
                        assignees: [],
                        merge_requests_count: 0,
                        user_notes_count: 0,
                      } as unknown as Issue)
                    }
                  />
                ))}

            {!isLoading &&
              (!stats?.recent_activities ||
                stats.recent_activities.length === 0) && (
                <div className="py-20 flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <MessageSquareOff className="w-6 h-6 text-gray-300" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    No recent activity found
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 text-center max-w-xs">
                    Activities will appear here as you interact with issues or
                    team members update their work.
                  </p>
                </div>
              )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default DashboardPage;
