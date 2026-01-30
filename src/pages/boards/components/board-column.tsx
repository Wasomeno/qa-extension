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
      <div
        className="px-3 py-3 border-b flex items-center justify-between overflow-hidden"
        style={
          column.color
            ? {
                backgroundColor: `${column.color}20`,
                borderColor: `${column.color}35`,
              }
            : {
                borderColor: 'rgba(229, 231, 235, 0.6)',
              }
        }
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: column.color || '#374151' }}
        >
          {column.title}
        </h3>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={
            column.color
              ? {
                  backgroundColor: `${column.color}20`,
                  color: column.color,
                }
              : {
                  backgroundColor: '#e5e7eb',
                  color: '#4b5563',
                }
          }
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
