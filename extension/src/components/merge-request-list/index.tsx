import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { useMRFilters } from './hooks/useMRFilters';
import { useMRData } from './hooks/useMRData';
import { MRFilters } from './components/MRFilters';
import { MRListContent } from './components/MRListContent';
import { MRDetailDialog } from './components/MRDetailDialog';
import type { MRListProps } from './types';
import type { MergeRequestSummary } from '@/types/merge-requests';

const MRListInner: React.FC<MRListProps> = ({
  className,
  onSelect,
  portalContainer,
}) => {
  const keyboardIsolation = useKeyboardIsolation();

  // Use custom hooks for state management
  const filterHook = useMRFilters();
  const dataHook = useMRData(filterHook.filters, filterHook.filtersReady);

  // Local state for UI
  const [selectedMR, setSelectedMR] = useState<MergeRequestSummary | null>(
    null
  );

  const stateCounts = React.useMemo(
    () => ({
      [filterHook.filters.state]: dataHook.mergeRequests.length,
    }),
    [dataHook.mergeRequests.length, filterHook.filters.state]
  );

  // Handlers
  const handleMROpen = (mr: MergeRequestSummary) => {
    if (onSelect) onSelect(mr);
    else setSelectedMR(mr);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) setSelectedMR(null);
  };

  return (
    <div
      className={cn('flex flex-col h-full min-h-0', className)}
      {...keyboardIsolation}
    >
      {/* Filters Section */}
      <MRFilters
        filters={filterHook.filters}
        search={filterHook.search}
        onSearchChange={filterHook.setSearch}
        onToggleProject={filterHook.toggleProject}
        onToggleState={filterHook.toggleState}
        onClearProjects={filterHook.clearProjects}
        portalContainer={portalContainer}
        isLoading={dataHook.isLoading}
        stateCounts={stateCounts}
      />

      {/* MR List Content */}
      <MRListContent
        mergeRequests={dataHook.mergeRequests}
        filters={filterHook.filters}
        isLoading={dataHook.isLoading}
        isError={dataHook.isError}
        error={dataHook.error}
        isFetching={dataHook.isFetching}
        hasMore={dataHook.hasMore}
        isLoadingMore={dataHook.isLoadingMore}
        onLoadMore={dataHook.loadMore}
        onSelect={onSelect}
        onMROpen={handleMROpen}
        portalContainer={portalContainer}
      />

      {/* Detail Dialog */}
      {!onSelect && (
        <MRDetailDialog
          mr={selectedMR}
          onOpenChange={handleDialogOpenChange}
          portalContainer={portalContainer}
        />
      )}
    </div>
  );
};

const MRList: React.FC<MRListProps> = props => {
  return <MRListInner {...props} />;
};

export default MRList;
