import React from 'react';
import { BoardColumn as IBoardColumn } from '../mock-data';

interface BoardColumnProps {
  column: IBoardColumn;
  children?: React.ReactNode;
  issueCount?: number;
}

export const BoardColumn: React.FC<BoardColumnProps> = ({
  column,
  children,
  issueCount,
}) => {
  return (
    <div
      className={`w-[280px] flex flex-col flex-1 max-h-full bg-gray-50/50 rounded-lg border border-[${column.color}35] overflow-hidden`}
    >
      {/* Column Header */}
      <div className="px-3 py-2.5 flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            {column.title}
          </h3>
          {column.color && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: column.color }}
            />
          )}
        </div>
        <span
          className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600"
        >
          {issueCount ?? column.issues.length}
        </span>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-scroll max-h-[60vh] p-2 space-y-2 min-h-0 custom-scrollbar">
        {children}
      </div>
    </div>
  );
};
