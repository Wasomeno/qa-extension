import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { Input } from '@/src/components/ui/ui/input';

interface WorkflowListProps {
  className?: string;
}

const WorkflowListInner: React.FC<WorkflowListProps> = ({ className }) => {
  const keyboardIsolation = useKeyboardIsolation();

  const [search, setSearch] = React.useState('');

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      {...keyboardIsolation}
    >
      <div className="p-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
};

const WorkflowList: React.FC<WorkflowListProps> = props => {
  return <WorkflowListInner {...props} />;
};

export default WorkflowList;
