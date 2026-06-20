import React from 'react';
import {
  ExternalLink,
  GitPullRequest,
  Link2,
  ClipboardList,
} from 'lucide-react';
import { Issue } from '@/api/issue';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface IssueCardProps {
  issue: Issue;
  onClick: (issue: Issue) => void;
  className?: string;
}

export const IssueCard: React.FC<IssueCardProps> = ({
  issue,
  onClick,
  className = '',
}) => {
  const assignee = issue.assignees?.[0];
  const author = issue.author;
  const hasChildIssues = issue.child && issue.child.amount > 0;

  const handleOpenGitlab = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(issue.web_url, '_blank');
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(issue.web_url);
  };

  return (
    <div
      onClick={() => onClick(issue)}
      className={cn(
        'group relative p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer mb-2 overflow-hidden w-full',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
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
            {issue.project_name && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {issue.project_name}
              </span>
            )}

            {issue.label_details && issue.label_details.length > 0
              ? issue.label_details.slice(0, 3).map(label => (
                  <span
                    key={label.id}
                    className="text-[10px] px-1.5 py-0.5 rounded border"
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color,
                      borderColor: `${label.color}35`,
                    }}
                  >
                    {label.name}
                  </span>
                ))
              : issue.labels?.slice(0, 3).map((label, index) => (
                  <span
                    key={index}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-600"
                  >
                    {label}
                  </span>
                ))}

            {hasChildIssues && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                  'bg-blue-100 text-blue-700'
                )}
              >
                <ClipboardList className="w-3 h-3" />
                {issue.child!.amount} child issues
              </span>
            )}

            {(issue.merge_requests_count ?? 0) > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                  'bg-green-100 text-green-700'
                )}
              >
                <GitPullRequest className="w-3 h-3" />
                {issue.merge_requests_count} MRs
              </span>
            )}
          </div>

          {author && (
            <div className="flex items-center gap-1.5 mt-2">
              <img
                src={author.avatar_url}
                alt={author.name}
                title={`Opened by ${author.name}`}
                className="w-4 h-4 rounded-full border border-gray-200"
              />
              <span className="text-[10px] text-gray-500 truncate max-w-[150px]">
                {author.name}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {assignee ? (
            <img
              src={assignee.avatar_url}
              alt={assignee.name}
              title={`Assigned to ${assignee.name}`}
              className="w-6 h-6 rounded-full border border-gray-200"
            />
          ) : (
            <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">?</span>
            </div>
          )}
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {formatDistanceToNow(new Date(issue.updated_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-md p-1 shadow-sm border border-gray-100">
        <button
          onClick={handleOpenGitlab}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
          title="Open in GitLab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleCopyLink}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
          title="Copy Link"
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
