import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { useIssueFilters } from './hooks/useIssueFilters';
import { useIssueData } from './hooks/useIssueData';
import { useIssuePinning } from './hooks/useIssuePinning';
import { IssueFilters } from './components/IssueFilters';
import { IssueListContent } from './components/IssueListContent';
import { IssueDetailDialog } from './components/IssueDetailDialog';
import type { IssueListProps } from './types';

const IssueListInner: React.FC<IssueListProps> = ({
  className,
  onSelect,
  portalContainer,
}) => {
  const keyboardIsolation = useKeyboardIsolation();

  // Use custom hooks for state management
  const filterHook = useIssueFilters();
  const dataHook = useIssueData(filterHook.filters, filterHook.filtersReady);
  const pinningHook = useIssuePinning();

  // Local state for UI
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

  // Handlers
  const handleIssueOpen = (item: any) => {
    if (onSelect) onSelect(item);
    else setSelectedIssue(item);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) setSelectedIssue(null);
  };

  return (
    <div
      className={cn('flex flex-col h-full min-h-0', className)}
      {...keyboardIsolation}
    >
      {/* Filters Section */}
      <IssueFilters
        filters={filterHook.filters}
        search={filterHook.search}
        onSearchChange={filterHook.setSearch}
        onToggleProject={filterHook.toggleProject}
        onToggleAssignee={filterHook.toggleAssignee}
        onToggleLabel={filterHook.toggleLabel}
        onToggleStatus={filterHook.toggleStatus}
        allProjectLabels={dataHook.allProjectLabels}
        portalContainer={portalContainer}
        isLoading={dataHook.isLoading}
      />

      {/* Issue List Content */}
      <IssueListContent
        issues={dataHook.issues}
        allProjectLabels={dataHook.allProjectLabels}
        filters={filterHook.filters}
        isLoading={dataHook.isLoading}
        isError={dataHook.isError}
        error={dataHook.error}
        isFetching={dataHook.isFetching}
        hasNextPage={dataHook.hasNextPage}
        onLoadMore={dataHook.loadMore}
        onSelect={onSelect}
        onIssueOpen={handleIssueOpen}
        pinnedIds={pinningHook.pinnedIds}
        pinnedCount={pinningHook.pinnedCount}
        onTogglePin={pinningHook.togglePin}
        portalContainer={portalContainer}
      />

      {/* Detail Dialog */}
      {!onSelect && (
        <IssueDetailDialog
          issue={selectedIssue}
          onOpenChange={handleDialogOpenChange}
          portalContainer={portalContainer}
        />
      )}
    </div>
  );
};

const IssueList: React.FC<IssueListProps> = props => {
  return <IssueListInner {...props} />;
};

export default IssueList;
