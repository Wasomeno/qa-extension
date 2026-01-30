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
}) => {
  // Lift state to local component to allow reordering
  const [columns, setColumns] = useState<IBoardColumn[]>(
    initialProject.columns
  );
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);

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
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find the containers
    const activeColumn = findColumn(activeId as string);
    const overColumn = findColumn(overId as string);

    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return;
    }

    setColumns(prev => {
      const activeItems = activeColumn.issues;
      const overItems = overColumn.issues;
      const activeIndex = activeItems.findIndex(i => i.id === activeId);
      const overIndex = overItems.findIndex(i => i.id === overId);

      let newIndex;
      if (overId in prev.find(c => c.id === overId)?.issues!) {
        // We're over another item in the target column
        newIndex = overItems.length + 1;
      } else {
        // We're over the column itself or empty space
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      // Actually, standard dnd-kit logic for dragging between containers is simpler:
      // Just move it to the new container's list

      const newActiveColumn = {
        ...activeColumn,
        issues: [...activeColumn.issues.filter(item => item.id !== activeId)],
      };

      const newOverColumn = {
        ...overColumn,
        issues: [
          ...overColumn.issues.slice(
            0,
            overIndex >= 0 ? overIndex : overColumn.issues.length
          ),
          activeItems[activeIndex],
          ...overColumn.issues.slice(
            overIndex >= 0 ? overIndex : overColumn.issues.length
          ),
        ],
      };

      // Fix: If over is a column, append to end
      if (over.data.current?.type === 'Column') {
        newOverColumn.issues = [...overColumn.issues, activeItems[activeIndex]];
        // Correctly remove from old
        // But wait, the slice logic above might have duplicated it if we didn't check type
        // Let's reset logic for Column drop
        newOverColumn.issues = [...overColumn.issues, activeItems[activeIndex]];
        // This is messy. Let's simplify.
      }

      return prev.map(c => {
        if (c.id === activeColumn.id) {
          return { ...c, issues: c.issues.filter(i => i.id !== activeId) };
        }
        if (c.id === overColumn.id) {
          // If dropping on the Column itself (empty or end)
          if (over.data.current?.type === 'Column') {
            // Check if already there to avoid flicker?
            if (c.issues.find(i => i.id === activeId)) return c;
            return { ...c, issues: [...c.issues, activeItems[activeIndex]] };
          }
          // Dropping on an Item
          const overItemIndex = c.issues.findIndex(i => i.id === overId);
          const isBelowLastItem =
            over &&
            overIndex === c.issues.length - 1 &&
            active.rect.current.translated &&
            active.rect.current.translated.top >
              over.rect.top + over.rect.height;

          const modifier = isBelowLastItem ? 1 : 0;
          const newIndex =
            overItemIndex >= 0 ? overItemIndex + modifier : c.issues.length;

          // Insert
          const newIssues = [...c.issues];
          newIssues.splice(newIndex, 0, activeItems[activeIndex]);
          return { ...c, issues: newIssues };
        }
        return c;
      });
    });
  };

  // Let's try a robust approach for DragOver
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

    if (!over) return;

    const activeColumn = findColumn(active.id as string);
    const overColumn = findColumn(over.id as string);

    if (!activeColumn || !overColumn) return;

    // If same column, reorder
    if (activeColumn === overColumn) {
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
