import React, { useState } from 'react';
import { MOCK_BOARDS } from './mock-data';
import { ProjectFilter } from './components/project-filter';
import { ProjectBoardView } from './components/project-board-view';

interface BoardsPageProps {
  portalContainer?: HTMLDivElement | null;
}

export const BoardsPage: React.FC<BoardsPageProps> = ({ portalContainer }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | number>(MOCK_BOARDS[0].id);

  const handleProjectSelect = (projectId: string | number) => {
    setSelectedProjectId(projectId);
  };

  const selectedBoard = MOCK_BOARDS.find((board) => board.id === selectedProjectId) || MOCK_BOARDS[0];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Filter Bar */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Issue Boards</h1>
          <div className="h-6 w-px bg-gray-200" />
          <ProjectFilter
            projects={MOCK_BOARDS}
            selectedProjectIds={[selectedProjectId]}
            onSelect={handleProjectSelect}
            portalContainer={portalContainer}
            singleSelect={true}
          />
        </div>
      </div>

      {/* Boards Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col">
          <div className="flex flex-col border-b border-gray-100 last:border-0">
            {/* Nice Separator / Project Header */}
            <div className="px-6 py-4 flex items-center gap-3 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50 sticky top-0">
              <div className="w-8 h-8 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 bg-gray-50">
                <img src={selectedBoard.avatarUrl} alt={selectedBoard.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-gray-900 leading-tight">
                  {selectedBoard.name}
                </h2>
                <span className="text-xs text-gray-500">Project Board</span>
              </div>
            </div>

            {/* Horizontal Board Area */}
            <div className="w-full overflow-x-auto">
                <ProjectBoardView project={selectedBoard} />
            </div>
          </div>
          
          {/* Bottom padding */}
          <div className="h-8" />
        </div>
      </div>
    </div>
  );
};
