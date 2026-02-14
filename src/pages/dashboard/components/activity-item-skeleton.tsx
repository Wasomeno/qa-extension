import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

export const ActivityItemSkeleton: React.FC = () => {
  return (
    <div
      className={cn(
        'relative p-4 bg-white border border-gray-200 rounded-xl',
        'overflow-hidden'
      )}
    >
      <div className="flex items-start gap-4">
        {/* User Avatar & Action Icon Skeleton */}
        <div className="relative flex-shrink-0">
          <Skeleton className="h-10 w-10 rounded-full border border-gray-100 shadow-sm" />
          <Skeleton className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white" />
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Actor Name */}
              <Skeleton className="h-4 w-24 rounded" />
              {/* Action Label */}
              <Skeleton className="h-3 w-16 rounded" />
              {/* Issue IID */}
              <Skeleton className="h-4 w-10 rounded" />
            </div>
            {/* Timestamp */}
            <Skeleton className="h-3 w-12 rounded" />
          </div>

          {/* Title */}
          <Skeleton className="h-5 w-3/4 rounded mb-3" />

          {/* Description Placeholder (Optional but good for layout consistency) */}
          <Skeleton className="h-12 w-full rounded-lg mb-3" />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Action Type Badge */}
              <Skeleton className="h-4 w-20 rounded-full" />
            </div>
          </div>
        </div>

        {/* Arrow Hint */}
        <div className="flex-shrink-0 self-center">
          <ChevronRight className="w-4 h-4 text-gray-200" />
        </div>
      </div>
    </div>
  );
};
