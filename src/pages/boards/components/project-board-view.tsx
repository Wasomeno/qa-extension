import React, { useState, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DropAnimation,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';

import {
  ProjectBoard,
  BoardIssue,
  BoardColumn as IBoardColumn,
} from '../mock-data';
import { BoardColumn } from './board-column';
import { SortableCard } from './sortable-card';
import { BoardCard } from './board-card';

interface ProjectBoardViewProps {
  project: ProjectBoard;
  onPinIssue?: (issue: BoardIssue) => void;
  onOpenIssue?: (issue: BoardIssue) => void;
  onMoveIssue?: (
    issueId: string,
    sourceColId: string,
    targetColId: string
  ) => void;
}

// Droppable Wrapper for Column
const DroppableColumn = ({
  column,
  children,
}: {
  column: IBoardColumn;
  children: React.ReactNode;
}) => {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: 'Column', column },
  });

  return (
    <div ref={setNodeRef} className="flex-1 flex-col flex">
      <BoardColumn column={column} issueCount={column.issues.length}>
        {children}
      </BoardColumn>
    </div>
  );
};

export const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({
  project: initialProject,
  onPinIssue,
  onOpenIssue,
  onMoveIssue,
}) => {
  // Lift state to local component to allow reordering
  const [columns, setColumns] = useState<IBoardColumn[]>(
    initialProject.columns
  );
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [startColumnId, setStartColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require drag movement of 8px to start (prevents accidental clicks)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const findColumn = (id: string) => {
    return columns.find(
      col => col.id === id || col.issues.some(issue => issue.id === id)
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const issue = active.data.current?.issue as BoardIssue;
    if (issue) setActiveIssue(issue);

    const activeColumn = findColumn(active.id as string);
    if (activeColumn) setStartColumnId(activeColumn.id);
  };

  // Drag-over handler for cross-column moves (same-column reordering is handled in handleDragEnd)
  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;

    const activeColumn = findColumn(activeId as string);
    const overColumn = findColumn(overId as string);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setColumns(prev => {
      const activeColIdx = prev.findIndex(c => c.id === activeColumn.id);
      const overColIdx = prev.findIndex(c => c.id === overColumn.id);

      const activeItems = prev[activeColIdx].issues;
      const overItems = prev[overColIdx].issues;
      const activeIndex = activeItems.findIndex(i => i.id === activeId);
      const overIndex = overItems.findIndex(i => i.id === overId);

      let newIndex;
      if (over.data.current?.type === 'Column') {
        newIndex = overItems.length;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      const newActiveColumn = {
        ...activeColumn,
        issues: [...activeColumn.issues],
      };
      const [movedItem] = newActiveColumn.issues.splice(activeIndex, 1);

      const newOverColumn = { ...overColumn, issues: [...overColumn.issues] };
      newOverColumn.issues.splice(newIndex, 0, movedItem);

      const newColumns = [...prev];
      newColumns[activeColIdx] = newActiveColumn;
      newColumns[overColIdx] = newOverColumn;

      return newColumns;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);

    if (!over) {
      setStartColumnId(null);
      return;
    }

    const activeColumn = findColumn(active.id as string);
    const overColumn = findColumn(over.id as string);

    if (!activeColumn || !overColumn) {
      setStartColumnId(null);
      return;
    }

    // If different column, trigger move
    if (activeColumn.id !== startColumnId) {
      // Logic for move is handled in onDragOver optimistically
      // Here we just persist
      onMoveIssue?.(active.id as string, startColumnId!, activeColumn.id);
    }

    // If same column, reorder
    if (activeColumn.id === overColumn.id) {
      const activeIndex = activeColumn.issues.findIndex(
        i => i.id === active.id
      );
      const overIndex = activeColumn.issues.findIndex(i => i.id === over.id);

      if (activeIndex !== overIndex) {
        setColumns(prev => {
          const colIdx = prev.findIndex(c => c.id === activeColumn.id);
          const newCol = {
            ...prev[colIdx],
            issues: arrayMove(prev[colIdx].issues, activeIndex, overIndex),
          };
          const newCols = [...prev];
          newCols[colIdx] = newCol;
          return newCols;
        });
      }
    }
    setStartColumnId(null);
  };

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col w-full flex-1">
        <div className="flex flex-1 gap-4 px-6 py-4 min-w-min">
          {columns.map(column => (
            <DroppableColumn key={column.id} column={column}>
              <SortableContext
                items={column.issues.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {column.issues.map(issue => (
                  <SortableCard
                    key={issue.id}
                    issue={issue}
                    onPin={onPinIssue}
                    onClick={onOpenIssue}
                  />
                ))}
              </SortableContext>
            </DroppableColumn>
          ))}
          {/* Spacer */}
          <div className="w-2 flex-shrink-0" />
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeIssue ? <BoardCard issue={activeIssue} /> : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};
