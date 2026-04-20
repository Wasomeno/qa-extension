import React, { useState, useRef, useCallback } from 'react';
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
import { toast } from 'sonner';

import {
  ProjectBoard,
  BoardIssue,
  BoardColumn as IBoardColumn,
} from '../mock-data';
import { BoardColumn } from './board-column';
import { SortableCard } from './sortable-card';
import { BoardCard } from './board-card';
import { updateIssue } from '@/api/issue';
import { useQueryClient } from '@tanstack/react-query';

interface PendingMove {
  issueId: string;
  iid: number;
  sourceColId: string;
  targetColId: string;
  sourceLabel?: string;
  targetLabel?: string;
}

interface ProjectBoardViewProps {
  project: ProjectBoard;
  projectId?: number;
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
  projectId,
  onPinIssue,
  onOpenIssue,
}) => {
  const queryClient = useQueryClient();
  // Lift state to local component to allow reordering
  const [columns, setColumns] = useState<IBoardColumn[]>(
    initialProject.columns
  );
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [startColumnId, setStartColumnId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Ref to track if we're currently in a drag operation
  const isDraggingRef = useRef(false);
  // Ref to track columns snapshot for rollback
  const prevColumnsRef = useRef<IBoardColumn[] | null>(null);

  // Only sync from props when NOT currently dragging and columns differ significantly
  React.useEffect(() => {
    // Don't reset state during drag operations
    if (isDraggingRef.current) return;
    
    // Check if columns actually changed (not just reference change)
    const hasStructuralChange = initialProject.columns.some((newCol, idx) => {
      const currentCol = columns[idx];
      if (!currentCol) return true;
      // Check if issues moved between columns (columns exist in both but issues differ)
      const newIssueIds = new Set(newCol.issues.map(i => i.id));
      const currentIssueIds = new Set(currentCol.issues.map(i => i.id));
      return (
        newCol.issues.length !== currentCol.issues.length ||
        ![...newIssueIds].every(id => currentIssueIds.has(id))
      );
    });
    
    // Only sync if there's a structural change (e.g., from API refetch) 
    // and we're not in the middle of a drag
    if (hasStructuralChange) {
      setColumns(initialProject.columns);
    }
  }, [initialProject.columns, columns]);

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

  const findColumn = useCallback((id: string, cols: IBoardColumn[]) => {
    return cols.find(
      col => col.id === id || col.issues.some(issue => issue.id === id)
    );
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    isDraggingRef.current = true;
    const { active } = event;
    const issue = active.data.current?.issue as BoardIssue;
    if (issue) setActiveIssue(issue);

    const activeColumn = findColumn(active.id as string, columns);
    if (activeColumn) setStartColumnId(activeColumn.id);
  };

  // Drag-over handler for cross-column moves (same-column reordering is handled in handleDragEnd)
  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;

    setColumns(prev => {
      // Find columns from the latest state to avoid stale closure issues
      const activeColIdx = prev.findIndex(
        col => col.id === activeId || col.issues.some(i => i.id === activeId)
      );
      const overColIdx = prev.findIndex(
        col => col.id === overId || col.issues.some(i => i.id === overId)
      );

      if (activeColIdx === -1 || overColIdx === -1) return prev;
      if (activeColIdx === overColIdx) return prev;

      const activeColumn = prev[activeColIdx];
      const overColumn = prev[overColIdx];

      const activeItems = activeColumn.issues;
      const overItems = overColumn.issues;
      const activeIndex = activeItems.findIndex(i => i.id === activeId);
      const overIndex = overItems.findIndex(i => i.id === overId);

      if (activeIndex === -1) return prev;

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
  }, []);

  // Persist move with proper state handling - accepts snapshot of current columns
  const persistMoveOptimistically = useCallback(async (
    issueId: string,
    sourceColId: string,
    targetColId: string,
    currentColumns: IBoardColumn[],
    targetIssue: BoardIssue
  ) => {
    if (!projectId) return;

    // Find columns from the captured snapshot
    const sourceCol = currentColumns.find(c => c.id === sourceColId);
    const targetCol = currentColumns.find(c => c.id === targetColId);
    if (!sourceCol || !targetCol) return;

    // Save previous state for rollback (from snapshot)
    prevColumnsRef.current = JSON.parse(JSON.stringify(currentColumns));

    setIsMoving(true);

    try {
      const updateData: any = {};

      // Handle Labels
      if (targetCol.label) {
        updateData.add_labels = [targetCol.label.name];
      }
      if (sourceCol.label) {
        updateData.remove_labels = [sourceCol.label.name];
      }

      if (Object.keys(updateData).length > 0) {
        await updateIssue(projectId, targetIssue.iid, updateData);
        toast.success(`Moved to ${targetCol.title}`);
        // Don't invalidate queries - optimistic update is already in local state
        // Next user action will refetch fresh data if needed
      }
    } catch {
      toast.error('Failed to move issue, reverting...');
      // Rollback to previous state using captured snapshot
      if (prevColumnsRef.current) {
        setColumns(prevColumnsRef.current);
      }
      // Don't invalidate on error - let user retry or refresh manually
    } finally {
      setIsMoving(false);
      prevColumnsRef.current = null;
    }
  }, [projectId]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);
    isDraggingRef.current = false;

    if (!over) {
      setStartColumnId(null);
      return;
    }

    const activeColumn = findColumn(active.id as string, columns);
    const overColumn = findColumn(over.id as string, columns);

    if (!activeColumn || !overColumn) {
      setStartColumnId(null);
      return;
    }

    // Find the issue from current columns state (we need the actual issue object)
    const issue = columns
      .flatMap(col => col.issues)
      .find(i => i.id === active.id);
    
    if (!issue) {
      setStartColumnId(null);
      return;
    }

    // If different column, persist the move optimistically
    // Capture current columns snapshot for the async function
    if (activeColumn.id !== startColumnId) {
      const currentColsSnapshot = [...columns];
      persistMoveOptimistically(
        active.id as string,
        startColumnId!,
        activeColumn.id,
        currentColsSnapshot,
        issue
      );
    }

    // If same column, reorder (no API call needed)
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
  }, [columns, startColumnId, findColumn, persistMoveOptimistically]);

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
