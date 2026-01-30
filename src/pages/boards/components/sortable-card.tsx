import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BoardCard } from './board-card';
import { BoardIssue } from '../mock-data';

interface SortableCardProps {
  issue: BoardIssue;
  onPin?: (issue: BoardIssue) => void;
  onClick?: (issue: BoardIssue) => void;
}

export const SortableCard: React.FC<SortableCardProps> = ({
  issue,
  onPin,
  onClick,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { type: 'Issue', issue } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BoardCard issue={issue} onPin={onPin} onClick={onClick} />
    </div>
  );
};
