import React from 'react';
import { MOCK_BOARDS } from './mock-data';
import { BoardColumn } from './components/board-column';

export const BoardsPage: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto bg-white custom-scrollbar">
      <div className="flex flex-col">
        {MOCK_BOARDS.map((project) => (
          <div key={project.id} className="flex flex-col border-b border-gray-100 last:border-0">
            {/* Nice Separator / Project Header */}
            <div className="px-6 py-4 flex items-center gap-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
              <div className="w-8 h-8 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 bg-gray-50">
                <img src={project.avatarUrl} alt={project.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-gray-900 leading-tight">
                  {project.name}
                </h2>
                <span className="text-xs text-gray-500">Project Board</span>
              </div>
            </div>

            {/* Horizontal Board Area */}
            <div className="w-full overflow-x-auto">
              <div className="flex gap-4 px-6 py-4 min-w-min">
                {project.columns.map((column) => (
                  <BoardColumn key={column.id} column={column} />
                ))}
                {/* Spacer for right padding */}
                <div className="w-2 flex-shrink-0" />
              </div>
            </div>
          </div>
        ))}
        
        {/* Bottom padding */}
        <div className="h-8" />
      </div>
    </div>
  );
};