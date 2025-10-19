import React from 'react';
import { Loader2, AlertCircle, GitMerge } from 'lucide-react';
import { Button } from '@/src/components/ui/ui/button';
import { MRCard } from './MRCard';
import type { MergeRequestSummary } from '@/types/merge-requests';
import type { MRFilters } from '../types';

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
    if (onSelect) {
      onSelect(mr);
    } else {
      onMROpen(mr);
    }
  };

  // Loading state
  if (isLoading && mergeRequests.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          <p className="text-sm text-gray-500">Loading merge requests...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
          <p className="text-sm text-gray-900 font-medium">
            Failed to load merge requests
          </p>
          <p className="text-xs text-gray-500">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (mergeRequests.length === 0) {
    const hasFilters = filters.search || filters.projectIds.length > 0;

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <GitMerge className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-900 font-medium">
            {hasFilters ? 'No merge requests found' : 'No merge requests'}
          </p>
          <p className="text-xs text-gray-500">
            {hasFilters
              ? 'Try adjusting your search or filters'
              : 'Create your first merge request to get started'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {mergeRequests.map(mr => (
          <MRCard
            key={`${mr.project_id}-${mr.iid}`}
            mr={mr}
            onClick={() => handleMRClick(mr)}
          />
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="p-3 border-t border-gray-100">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs pointer-events-auto"
            onClick={onLoadMore}
            disabled={isLoadingMore || isFetching}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* Fetching indicator */}
      {isFetching && mergeRequests.length > 0 && !isLoadingMore && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-white shadow-sm border border-gray-200 rounded-full px-3 py-1 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
            <span className="text-xs text-gray-600">Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
};
