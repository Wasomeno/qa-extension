import React, { useState, useEffect } from 'react';
import { ProjectFilter } from './components/project-filter';
import { ProjectBoardView } from './components/project-board-view';
import { useGetProjects } from '@/hooks/use-get-projects';
import { useGetProjectBoards } from './hooks/use-get-project-boards';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectBoard } from './mock-data';

interface BoardsPageProps {
  portalContainer?: HTMLDivElement | null;
  onNavigateToIssue?: (issue: any) => void;
}

export const BoardsPage: React.FC<BoardsPageProps> = ({
  portalContainer,
  onNavigateToIssue,
}) => {
  const { data: projects = [], isLoading: isLoadingProjects } =
    useGetProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | number | undefined
  >(undefined);

  // Default to first project if none selected
  const activeProjectId = selectedProjectId ?? projects[0]?.id;

  const { data: boards = [], isLoading: isLoadingBoards } = useGetProjectBoards(
    Number(activeProjectId)
  );

  // Select the first board by default (API returns list of boards)
  const selectedBoardData = boards[0];

  const handleProjectSelect = (projectId: string | number) => {
    setSelectedProjectId(projectId);
  };

  console.log('BOARDS', boards);

  // Map API data to UI model
  const activeProject = projects.find(p => p.id === activeProjectId);

  const mappedBoard: ProjectBoard | undefined = selectedBoardData
    ? {
        id: selectedBoardData.id.toString(),
        name: selectedBoardData.name,
        avatarUrl: activeProject?.avatar_url,
        columns: selectedBoardData.lists
          .map(list => ({
            id: list.id.toString(),
            title: list.label?.name || `List ${list.position}`,
            color: list.label?.color,
            textColor: list.label?.text_color,
            issues: list.issues.map(issue => ({
              id: issue.id.toString(),
              iid: issue.iid,
              title: issue.title,
              weight: 0, // Not provided in API yet
              projectId: activeProject?.id || 0,
              projectName:
                activeProject?.name_with_namespace || activeProject?.name || '',
              webUrl: activeProject?.web_url
                ? `${activeProject.web_url}/-/issues/${issue.iid}`
                : '',
              assignee: issue.assignees[0]
                ? {
                    id: issue.assignees[0].id.toString(),
                    name: issue.assignees[0].name,
                    username: issue.assignees[0].username,
                    avatarUrl: issue.assignees[0].avatar_url,
                  }
                : undefined,
              labels: issue.labels.map(label => ({
                id: label.id.toString(),
                name: label.name,
                color: label.color,
                textColor: label.text_color as string,
              })),
            })),
          }))
          .sort((a, b) => {
            return 0;
          }),
      }
    : undefined;

  const isLoading = isLoadingProjects || (!!activeProjectId && isLoadingBoards);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Filter Bar */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Issue Boards</h1>
          <div className="h-6 w-px bg-gray-200" />
          {isLoadingProjects ? (
            <Skeleton className="h-9 w-[250px]" />
          ) : (
            <ProjectFilter
              projects={projects}
              selectedProjectIds={activeProjectId ? [activeProjectId] : []}
              onSelect={handleProjectSelect}
              portalContainer={portalContainer}
              singleSelect={true}
            />
          )}
        </div>
      </div>

      {/* Boards Content */}
      <div className="flex-1 flex flex-col w-full overflow-y-auto">
        <div className="flex flex-1 flex-col w-full">
          {isLoading ? (
            <div className="p-6">
              <div className="flex gap-4 overflow-hidden">
                <Skeleton className="h-[400px] w-[280px] rounded-lg" />
                <Skeleton className="h-[400px] w-[280px] rounded-lg" />
                <Skeleton className="h-[400px] w-[280px] rounded-lg" />
              </div>
            </div>
          ) : mappedBoard ? (
            <div className="flex flex-1 flex-col w-full border-b border-gray-100 last:border-0">
              {/* Horizontal Board Area */}
              <div className="flex-1 flex-col flex w-full overflow-x-auto">
                <ProjectBoardView
                  key={mappedBoard.id}
                  project={mappedBoard}
                  onOpenIssue={issue => {
                    // Map BoardIssue to structure expected by IssueDetail
                    // Minimal mapping; detail page will fetch full data or use partials
                    onNavigateToIssue?.({
                      id: Number(issue.id),
                      iid: issue.iid,
                      title: issue.title,
                      project_id: issue.projectId,
                      project_name: issue.projectName,
                      description: '', // Loaded in detail
                      state: 'opened', // Default, updated in detail
                      web_url: issue.webUrl,
                      author: { name: 'Unknown', avatar_url: '' }, // Placeholder
                      assignees: issue.assignee
                        ? [
                            {
                              id: Number(issue.assignee.id),
                              name: issue.assignee.name,
                              username: issue.assignee.username,
                              avatar_url: issue.assignee.avatarUrl,
                            },
                          ]
                        : [],
                      labels: issue.labels.map(l => l.name),
                      label_details: issue.labels.map(l => ({
                        id: Number(l.id.split('-')[0]) || 0, // Best effort parse if id is composite
                        name: l.name,
                        color: l.color,
                        text_color: l.textColor,
                      })),
                      created_at: new Date().toISOString(), // Fallback
                      merge_requests_count: 0,
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[50vh] text-gray-500">
              {activeProjectId
                ? 'No boards found for this project.'
                : 'Select a project to view boards.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
