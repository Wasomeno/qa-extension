import React from 'react';
import { cn } from '@/lib/utils';
import { BoardIssue } from '../mock-data';

interface BoardCardProps {
  issue: BoardIssue;
}

export const BoardCard: React.FC<BoardCardProps> = ({ issue }) => {
  return (
    <div className="bg-white p-3 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">
          {issue.title}
        </h4>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-mono">#{issue.iid}</span>
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: label.color,
                color: label.textColor,
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
    </div>
  );
};
