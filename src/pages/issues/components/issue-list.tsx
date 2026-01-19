import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { Issue } from '@/api/issue';
import { IssueCard } from './issue-card';
import { IssueCardSkeleton } from './issue-card-skeleton';

interface IssueListProps {
  issues: Issue[];
  isProjectFiltered: boolean;
  onIssueClick: (issue: Issue) => void;
  onPin?: (issue: Issue) => void; // Assuming IssueWithPin is compatible or Issue is used
  isLoading?: boolean;
  isPinned?: (issueIid: number, projectId: number) => boolean;
}

export const IssueList: React.FC<IssueListProps> = ({
  issues,
  isProjectFiltered,
  onIssueClick,
  onPin,
  isLoading = false,
  isPinned,
}) => {
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});

  const toggleProject = (projectId: string) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <IssueCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Group issues by project
  const groupedIssues = issues.reduce((acc, issue) => {
    const pid = issue.project_id.toString();
    if (!acc[pid]) {
      acc[pid] = {
        projectId: pid,
        projectName: issue.project_name,
        issues: [],
      };
    }
    acc[pid].issues.push(issue);
    return acc;
  }, {} as Record<string, { projectId: string; projectName: string; issues: Issue[] }>);

  const projectGroups = Object.values(groupedIssues);

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-gray-300" />
        </div>
        <h3 className="text-gray-900 font-medium">No issues found</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-xs">
          Try adjusting your filters or search terms to find what you're looking
          for.
        </p>
      </div>
    );
  }

  // If a specific project is selected, just show the flat list without headers
  if (isProjectFiltered) {
    return (
      <div className="space-y-2">
        {issues.map(issue => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onClick={onIssueClick}
            onPin={onPin}
            onUnpin={onPin} // Both toggle
            variant={
              isPinned?.(issue.iid, issue.project_id) ? 'pinned' : 'default'
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {projectGroups.map(group => {
        const isCollapsed = collapsedProjects[group.projectId];

        return (
          <div key={group.projectId}>
            <button
              onClick={() => toggleProject(group.projectId)}
              className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-gray-50 rounded-lg transition-colors group mb-1"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              )}
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {group.projectName}
              </span>
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-full">
                {group.issues.length}
              </span>
              <div className="h-px bg-gray-100 flex-1 ml-2" />
            </button>

            {!isCollapsed && (
              <div className="space-y-2 pl-2">
                {group.issues.map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onClick={onIssueClick}
                    onPin={onPin}
                    onUnpin={onPin}
                    variant={
                      isPinned?.(issue.iid, issue.project_id)
                        ? 'pinned'
                        : 'default'
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
