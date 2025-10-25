import React from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { useMRFilters } from './hooks/useMRFilters';
import { useMRData } from './hooks/useMRData';
import { MRListToolbar } from './components/MRListToolbar';
import { MRFilters } from './components/MRFilters';
import { MRListContent } from './components/MRListContent';
import type { MRListProps } from './types';

const MRListInner: React.FC<MRListProps> = ({
  className,
  onSelect,
  onCreateClick,
  portalContainer,
}) => {
  const keyboardIsolation = useKeyboardIsolation();

  // Use custom hooks for state management
  const filterHook = useMRFilters();
  const dataHook = useMRData(filterHook.filters, filterHook.filtersReady);

  const handleCreateClick = () => {
    if (onCreateClick) onCreateClick();
  };

  return (
    <div
      className={cn('flex flex-col h-full min-h-0', className)}
      {...keyboardIsolation}
    >
      {/* Toolbar with Create button */}
      {onCreateClick && <MRListToolbar onCreateClick={handleCreateClick} />}

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
        portalContainer={portalContainer}
      />
    </div>
  );
};

const MRList: React.FC<MRListProps> = props => {
  return <MRListInner {...props} />;
};

export default MRList;
