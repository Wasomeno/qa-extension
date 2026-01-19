import React from 'react';
import { BoardColumn as IBoardColumn } from '../mock-data';
import { BoardCard } from './board-card';

interface BoardColumnProps {
  column: IBoardColumn;
}

export const BoardColumn: React.FC<BoardColumnProps> = ({ column }) => {
  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col max-h-full bg-gray-50/50 rounded-lg border border-gray-200/60">
      {/* Column Header */}
      <div className="px-3 py-3 border-b border-gray-200/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
        <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
          {column.issues.length}
        </span>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 custom-scrollbar">
        {column.issues.map((issue) => (
          <BoardCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
};
