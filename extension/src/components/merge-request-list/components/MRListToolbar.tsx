import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/ui/button';

interface MRListToolbarProps {
  onCreateClick: () => void;
}

export const MRListToolbar: React.FC<MRListToolbarProps> = ({ onCreateClick }) => {
  return (
    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-900">Your Merge Requests</h3>
      <Button
        variant="default"
        size="sm"
        className="h-7 text-xs pointer-events-auto gap-1"
        onClick={onCreateClick}
      >
        <Plus className="w-3.5 h-3.5" />
        Create MR
      </Button>
    </div>
  );
};
