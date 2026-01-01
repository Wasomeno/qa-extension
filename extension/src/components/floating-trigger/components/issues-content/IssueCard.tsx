import React from 'react';
import {
  Pin,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Palette,
  MessageSquare,
} from 'lucide-react';
import { MockIssue, IssueStatus, PinColor } from './types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Map for pin colors
const PIN_COLOR_MAP: Record<PinColor, string> = {
  default: 'bg-gray-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
};

// Map for status colors
const statusConfig: Record<IssueStatus, { color: string; border: string }> = {
  OPEN: { color: 'bg-green-500', border: 'border-l-green-500' },
  IN_QA: { color: 'bg-blue-500', border: 'border-l-blue-500' },
  BLOCKED: { color: 'bg-red-500', border: 'border-l-red-500' },
  CLOSED: { color: 'bg-gray-500', border: 'border-l-gray-400' },
  MERGED: { color: 'bg-purple-500', border: 'border-l-purple-500' },
};

/**
 * Base Props for the visual representation of an issue card
 */
interface BaseIssueCardProps {
  issue: MockIssue;
  onClick: (issue: MockIssue) => void;
  actions?: React.ReactNode;
  showPinnedStyles?: boolean;
}

/**
 * BaseIssueCard component that handles the layout and visual content
 * This is now our "Base" as requested, supporting all features like notes and color bars.
 */
export const BaseIssueCard: React.FC<BaseIssueCardProps> = ({
  issue,
  onClick,
  actions,
  showPinnedStyles = false,
}) => {
  const statusStyle = statusConfig[issue.status] || statusConfig.OPEN;

  return (
    <div
      onClick={() => onClick(issue)}
      className={cn(
        'group relative p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer mb-2 overflow-hidden',
        'border-l-[3px]',
        statusStyle.border
      )}
    >
      {/* Dynamic Pin Color Bar */}
      {showPinnedStyles && issue.pinnedMeta && (
        <div
          className={cn(
            'absolute -left-[3px] top-0 bottom-0 w-[3px] rounded-l-lg',
            PIN_COLOR_MAP[issue.pinnedMeta.pinColor]
          )}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Left Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-500">
              #{issue.iid}
            </span>
            <h4 className="text-sm font-medium text-gray-900 truncate pr-4">
              {issue.title}
            </h4>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {issue.project.name}
            </span>

            {issue.labels.slice(0, 3).map(label => (
              <span
                key={label.id}
                className="text-[10px] px-1.5 py-0.5 rounded border"
                style={{
                  backgroundColor: `${label.color}15`,
                  color: label.color,
                  borderColor: `${label.color}30`,
                }}
              >
                {label.name}
              </span>
            ))}

            {issue.mrStatus && issue.mrStatus !== 'NONE' && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                  issue.mrStatus === 'MERGED'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
                )}
              >
                {issue.mrStatus === 'MERGED' ? (
                  <GitMerge className="w-3 h-3" />
                ) : (
                  <GitPullRequest className="w-3 h-3" />
                )}
                {issue.mrStatus === 'MERGED' ? 'Merged' : 'MR Open'}
              </span>
            )}
          </div>
        </div>

        {/* Right Content / Assignee */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {issue.assignee ? (
            <img
              src={issue.assignee.avatarUrl}
              alt={issue.assignee.name}
              title={`Assigned to ${issue.assignee.name}`}
              className="w-6 h-6 rounded-full border border-gray-200"
            />
          ) : (
            <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">?</span>
            </div>
          )}
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {formatDistanceToNow(new Date(issue.updatedAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>

      {/* Note view - supports both but usually only shown in pinned context */}
      {showPinnedStyles && issue.pinnedMeta?.note && (
        <div className="mt-2 flex gap-2 items-start bg-black/5 p-2 rounded-md">
          <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-600 italic line-clamp-2">
            {issue.pinnedMeta.note}
          </p>
        </div>
      )}

      {/* Action Overlay */}
      {actions && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-md p-1 shadow-sm border border-gray-100">
          {actions}
        </div>
      )}
    </div>
  );
};

/**
 * HOC Props
 */
interface IssueCardProps {
  issue: MockIssue;
  onClick: (issue: MockIssue) => void;
  // Dynamic props that might come from the HOC or user
  onPin?: (issue: MockIssue) => void;
  onUnpin?: (issue: MockIssue) => void;
  onSetPinColor?: (issue: MockIssue) => void;
  onAddNote?: (issue: MockIssue) => void;
  variant?: 'default' | 'pinned';
}

/**
 * High-Order Component to customize Issue Actions
 */
const withIssueActions = (variant: 'default' | 'pinned') => {
  return (props: IssueCardProps) => {
    const { issue, onPin, onUnpin, onSetPinColor, onAddNote } = props;
    const isPinned = variant === 'pinned';

    const handleOpenGitlab = (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(issue.webUrl, '_blank');
    };

    const handlePinToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPinned) onUnpin?.(issue);
      else onPin?.(issue);
    };

    // Construct actions based on variant
    const actions = (
      <>
        {isPinned ? (
          <>
            <button
              onClick={handlePinToggle}
              className="p-1 hover:bg-amber-100 rounded text-amber-500 transition-colors"
              title="Unpin Issue"
            >
              <Pin className="w-3.5 h-3.5 fill-current" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                onSetPinColor?.(issue);
              }}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
              title="Set Pin Color"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                onAddNote?.(issue);
              }}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
              title="Add/Edit Note"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={handlePinToggle}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
            title="Pin Issue"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="w-px h-3 bg-gray-200 mx-0.5" />
        <button
          onClick={handleOpenGitlab}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
          title="Open in GitLab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </>
    );

    return (
      <BaseIssueCard {...props} showPinnedStyles={isPinned} actions={actions} />
    );
  };
};

/**
 * Specialized Exports
 */
export const DefaultIssueCard = withIssueActions('default');
export const PinnedIssueCard = withIssueActions('pinned');

/**
 * Main IssueCard component that maintains backward compatibility
 * but uses the HOC-refactored architecture under the hood.
 */
export const IssueCard: React.FC<IssueCardProps> = props => {
  const Component =
    props.variant === 'pinned' ? PinnedIssueCard : DefaultIssueCard;
  return <Component {...props} />;
};
