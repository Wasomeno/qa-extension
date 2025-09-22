import React from 'react';
import { Skeleton } from '@/src/components/ui/ui/skeleton';

interface IssueCardSkeletonProps {
  className?: string;
}

const IssueCardSkeleton: React.FC<IssueCardSkeletonProps> = ({ className }) => {
  return (
    <div
      className={
        'glass-card shadow-none w-full text-left rounded-md border border-gray-200 px-4 py-3 ' +
        (className || '')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-7 w-[100px] rounded" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-7 rounded" />
      </div>
      <div className="h-1" />
      <div className="space-y-1">
        <Skeleton className="h-3 w-14" />
        <div className="flex gap-1">
          <Skeleton className="h-4 w-14 rounded-full" />
          <Skeleton className="h-4 w-10 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
};

export default IssueCardSkeleton;

