import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import type { MergeRequestSummary } from '@/types/merge-requests';
import type { MRFilters } from '../types';
import { MRCard } from './MRCard';
import EmptyState from '@/components/common/EmptyState';

interface MRListContentProps {
  mergeRequests: MergeRequestSummary[];
  filters: MRFilters;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect?: (mr: MergeRequestSummary) => void;
  onMROpen: (mr: MergeRequestSummary) => void;
  portalContainer?: Element | null;
}

export const MRListContent: React.FC<MRListContentProps> = ({
  mergeRequests,
  filters,
  isLoading,
  isError,
  error,
  isFetching,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  onMROpen,
}) => {
  const handleMRClick = (mr: MergeRequestSummary) => {
    onMROpen(mr);
  };

  const renderLoadingCard = (_: unknown, i: number) => (
    <div
      key={i}
      className="rounded-lg glass-card border border-gray-100 p-3 bg-white shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <div className="mt-3 flex gap-1">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
    </div>
  );

  const renderMRCard = (mr: MergeRequestSummary) => {
    return (
      <div
        key={`${mr.project_id}-${mr.iid}`}
        onClick={() => handleMRClick(mr)}
        className="cursor-pointer"
      >
        <MRCard mr={mr} onClick={() => handleMRClick(mr)} />
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-scroll px-4 py-2 space-y-2">
      {/* Loading State */}
      {isLoading && (
        <div className="space-y-2">{[...Array(5)].map(renderLoadingCard)}</div>
      )}

      {/* Error State */}
      {isError && (
        <div className="text-xs text-red-600">
          {(error as any)?.message || 'Failed to load merge requests'}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && mergeRequests.length === 0 && (
        <div className="h-full">
          <EmptyState
            title="No merge requests found"
            description="When there are merge requests to show, they will appear here."
          />
        </div>
      )}

      {/* MR List */}
      {mergeRequests.map(renderMRCard)}

      {/* Load More Button */}
      {hasMore && !isLoading && (
        <div className="flex justify-center p-4">
          <Button
            onClick={onLoadMore}
            disabled={isFetching}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {isFetching ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {/* Loading More Indicators */}
      {isFetching && !isLoading && (
        <div className="space-y-2">{[...Array(2)].map(renderLoadingCard)}</div>
      )}
    </div>
  );
};
