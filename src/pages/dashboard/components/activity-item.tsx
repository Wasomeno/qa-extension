import React from 'react';
import { ActivityFeedItem } from '@/api/dashboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Settings2,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityItemProps {
  activity: ActivityFeedItem;
  onIssueClick: () => void;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  onIssueClick,
}) => {
  const getActionConfig = (type: ActivityFeedItem['action_type']) => {
    switch (type) {
      case 'comment':
        return {
          label: 'commented on',
          icon: MessageSquare,
          color: 'text-blue-500',
          bg: 'bg-blue-50',
          border: 'border-blue-100',
        };
      case 'system_note':
        return {
          label: 'updated status',
          icon: Settings2,
          color: 'text-purple-500',
          bg: 'bg-purple-50',
          border: 'border-purple-100',
        };
      case 'issue_update':
        return {
          label: 'updated',
          icon: RefreshCw,
          color: 'text-orange-500',
          bg: 'bg-orange-50',
          border: 'border-orange-100',
        };
      default:
        return {
          label: 'interacted with',
          icon: RefreshCw,
          color: 'text-gray-500',
          bg: 'bg-gray-50',
          border: 'border-gray-100',
        };
    }
  };

  const config = getActionConfig(activity.action_type);
  const Icon = config.icon;

  return (
    <div
      onClick={onIssueClick}
      className={cn(
        'group relative p-4 bg-white border border-gray-200 rounded-xl',
        'hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer overflow-hidden'
      )}
    >
      <div className="flex items-start gap-4">
        {/* User Avatar & Action Icon */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-10 w-10 border border-gray-100 shadow-sm">
            <AvatarImage
              src={activity.actor_avatar}
              alt={activity.actor_name}
            />
            <AvatarFallback className="bg-gray-100 text-gray-400 text-[10px] font-bold">
              {activity.actor_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              'absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center',
              config.bg,
              config.color
            )}
          >
            <Icon className="w-2.5 h-2.5" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 truncate max-w-[120px]">
                {activity.actor_name}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {config.label}
              </span>
              <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                #{activity.issue_iid}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap">
              {formatDistanceToNow(new Date(activity.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          <h4 className="text-sm font-medium text-gray-700 leading-snug line-clamp-1 group-hover:text-blue-600 transition-colors">
            {activity.title}
          </h4>

          {activity.description && (
            <div className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100 italic font-medium">
              "{activity.description}"
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border',
                  config.bg,
                  config.color,
                  config.border
                )}
              >
                {activity.action_type.replace('_', ' ')}
              </span>
            </div>

            <a
              href={activity.web_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 font-semibold"
            >
              GitLab <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

        {/* Arrow Hint */}
        <div className="flex-shrink-0 self-center">
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>
    </div>
  );
};
