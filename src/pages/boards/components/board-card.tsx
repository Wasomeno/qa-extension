import React from 'react';
import { cn } from '@/lib/utils';
import { BoardIssue } from '../mock-data';
import { Pin, ExternalLink, Link2 } from 'lucide-react';

interface BoardCardProps {
  issue: BoardIssue;
  onPin?: (issue: BoardIssue) => void;
  onClick?: (issue: BoardIssue) => void;
}

export const BoardCard: React.FC<BoardCardProps> = ({
  issue,
  onPin,
  onClick,
}) => {
  return (
    <div
      onClick={() => onClick?.(issue)}
      className="bg-white p-3 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group relatives"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 transition-colors line-clamp-2 leading-tight">
          {issue.title}
        </h4>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-mono">#{issue.iid}</span>
          {issue.labels.map(label => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
              style={{
                borderColor: `${label.color}35`,
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>

        {issue.assignee && (
          <div className="flex-shrink-0" title={issue.assignee.name}>
            <img
              src={issue.assignee.avatarUrl}
              alt={issue.assignee.username}
              className="w-5 h-5 rounded-full border border-gray-100"
            />
          </div>
        )}
      </div>

      {/* Action Overlay */}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-md p-1 shadow-sm border border-gray-100">
        <button
          onClick={e => {
            e.stopPropagation();
            onPin?.(issue);
          }}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
          title="Pin Issue"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3 bg-gray-200 mx-0.5" />

        <button
          onClick={e => {
            e.stopPropagation();
            window.open(issue.webUrl, '_blank');
          }}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
          title="Open in GitLab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            navigator.clipboard.writeText(issue.webUrl);
          }}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
          title="Copy Link"
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
