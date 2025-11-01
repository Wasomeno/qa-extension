import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/ui/button';

interface MRListToolbarProps {
  title?: string;
  subtitle?: string;
  onCreateClick?: () => void;
  onManageClick?: () => void;
}

export const MRListToolbar: React.FC<MRListToolbarProps> = ({
  title,
  subtitle,
  onCreateClick,
}) => {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 bg-transparent px-2 py-3 md:px-3">
      <div className="space-y-0.5">
        {title ? (
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        ) : null}
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {onCreateClick ? (
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-md bg-slate-900 text-xs font-medium text-white hover:bg-slate-800"
            onClick={onCreateClick}
          >
            <Plus className="h-3.5 w-3.5" />
            Merge Request
          </Button>
        ) : null}
      </div>
    </div>
  );
};
