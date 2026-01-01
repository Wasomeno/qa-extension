import React from 'react';
import { cn } from '@/lib/utils';
import { IssueFilterState } from './types';
import {
  User,
  PenTool,
  AlertCircle,
  PlayCircle,
  Ban,
  GitMerge,
  HelpCircle,
} from 'lucide-react';

interface QuickFilterChipsProps {
  filters: IssueFilterState['quickFilters'];
  onToggle: (key: keyof IssueFilterState['quickFilters']) => void;
}

export const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  filters,
  onToggle,
}) => {
  const chips = [
    { key: 'assignedToMe' as const, label: 'Assigned to Me', icon: User },
    { key: 'createdByMe' as const, label: 'Created by Me', icon: PenTool },
    { key: 'highPriority' as const, label: 'High Priority', icon: AlertCircle },
    { key: 'inQa' as const, label: 'In QA', icon: PlayCircle },
    { key: 'blocked' as const, label: 'Blocked', icon: Ban },
    { key: 'hasOpenMr' as const, label: 'Has Open MR', icon: GitMerge },
    { key: 'unassigned' as const, label: 'Unassigned', icon: HelpCircle },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar mask-gradient-right">
      {chips.map(chip => {
        const isActive = filters[chip.key];
        const Icon = chip.icon;

        return (
          <button
            key={chip.key}
            onClick={() => onToggle(chip.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border',
              isActive
                ? 'bg-blue-100/80 text-blue-700 border-blue-200 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
            )}
          >
            <Icon
              className={cn(
                'w-3.5 h-3.5',
                isActive ? 'text-blue-600' : 'text-gray-400'
              )}
            />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
};
