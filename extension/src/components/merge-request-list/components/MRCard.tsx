import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageCircle,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/src/components/ui/ui/badge';
import { cn } from '@/lib/utils';
import type { MergeRequestSummary } from '@/types/merge-requests';

interface MRCardProps {
  mr: MergeRequestSummary;
  onClick: () => void;
}

export const MRCard: React.FC<MRCardProps> = ({ mr, onClick }) => {
  const timeAgo = React.useMemo(() => {
    try {
      return formatDistanceToNow(new Date(mr.created_at), { addSuffix: true });
    } catch {
      return 'unknown';
    }
  }, [mr.created_at]);

  const getStateColor = () => {
    switch (mr.state) {
      case 'merged':
        return '#8b5cf6'; // purple
      case 'closed':
        return '#ef4444'; // red
      case 'opened':
        return '#22c55e'; // green
      default:
        return '#6b7280'; // gray
    }
  };

  const getStateBadge = () => {
    const color = getStateColor();
    return (
      <Badge
        variant="secondary"
        className="gap-1 glass-card border-white/50 bg-white/60 backdrop-blur-sm ring-1 ring-blue-200 bg-blue-50/60"
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="capitalize">{mr.state}</span>
      </Badge>
    );
  };

  const getPipelineBadge = () => {
    if (!mr.pipeline) return null;

    const status = mr.pipeline.status;
    let icon = null;
    let label = '';
    let colorClass = '';

    switch (status) {
      case 'success':
        icon = <CheckCircle2 className="w-3 h-3" />;
        label = 'Passed';
        colorClass = 'text-green-600 bg-green-50/60';
        break;
      case 'failed':
        icon = <XCircle className="w-3 h-3" />;
        label = 'Failed';
        colorClass = 'text-red-600 bg-red-50/60';
        break;
      case 'pending':
      case 'running':
        icon = <Clock className="w-3 h-3" />;
        label = status === 'running' ? 'Running' : 'Pending';
        colorClass = 'text-blue-600 bg-blue-50/60';
        break;
      default:
        return null;
    }

    return (
      <Badge
        variant="secondary"
        className={`gap-1 glass-card border-white/50 backdrop-blur-sm ${colorClass}`}
      >
        {icon}
        <span>{label}</span>
      </Badge>
    );
  };

  return (
    <div className="group glass-card overflow-hidden shadow-none w-full text-left rounded-md border border-gray-200">
      <button
        onClick={onClick}
        className="px-4 py-3 w-full text-left hover:bg-gray-50/50 transition-colors"
        aria-label={`Open merge request ${mr.title}`}
      >
        <div className="flex flex-col gap-2">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-blue-600 shrink-0">
                  !{mr.iid}
                </span>
                <div className="truncate max-w-[260px] text-[13px] font-semibold text-black hover:text-blue-600">
                  {mr.title}
                </div>
              </div>
              {/* Branches */}
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-black/70">
                <GitBranch className="w-3 h-3" />
                <span
                  className="truncate max-w-[120px]"
                  title={mr.source_branch}
                >
                  {mr.source_branch}
                </span>
                <span>→</span>
                <span
                  className="truncate max-w-[120px]"
                  title={mr.target_branch}
                >
                  {mr.target_branch}
                </span>
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] text-black/70 truncate">
              <div className="flex items-center gap-2">
                <span>by {mr.author.name || mr.author.username}</span>
                <span>·</span>
                <span>{timeAgo}</span>
                {mr.user_notes_count !== undefined &&
                  mr.user_notes_count > 0 && (
                    <>
                      <span>·</span>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        <span>{mr.user_notes_count}</span>
                      </div>
                    </>
                  )}
              </div>
            </div>
          </div>

          {/* Labels/Badges */}
          <div className="h-1" />
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-black/70">Status</div>
            <div className="flex flex-wrap gap-2">
              {getStateBadge()}
              {mr.draft && (
                <Badge
                  variant="outline"
                  className="glass-card border-white/50 bg-white/60 backdrop-blur-sm"
                >
                  Draft
                </Badge>
              )}
              {mr.has_conflicts && (
                <Badge
                  variant="outline"
                  className="glass-card border-white/50 bg-amber-50/60 text-amber-700 backdrop-blur-sm"
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Conflicts
                </Badge>
              )}
              {getPipelineBadge()}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
