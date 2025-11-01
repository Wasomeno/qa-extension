import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageCircle,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Copy,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MergeRequestSummary } from '@/types/merge-requests';

interface MRCardProps {
  mr: MergeRequestSummary;
  onClick: () => void;
}

const stateStyles: Record<
  MergeRequestSummary['state'],
  { label: string; badge: string; dot: string }
> = {
  opened: {
    label: 'Opened',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  merged: {
    label: 'Merged',
    badge: 'bg-violet-100 text-violet-700',
    dot: 'bg-violet-500',
  },
  closed: {
    label: 'Closed',
    badge: 'bg-rose-100 text-rose-700',
    dot: 'bg-rose-500',
  },
  locked: {
    label: 'Locked',
    badge: 'bg-slate-200 text-slate-700',
    dot: 'bg-slate-500',
  },
};

const pipelineStyles = {
  success: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Passed',
  },
  failed: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    badge: 'bg-rose-100 text-rose-700',
    label: 'Failed',
  },
  pending: {
    icon: <Clock className="h-3.5 w-3.5" />,
    badge: 'bg-blue-100 text-blue-700',
    label: 'Pending',
  },
  running: {
    icon: <Clock className="h-3.5 w-3.5 animate-spin" />,
    badge: 'bg-blue-100 text-blue-700',
    label: 'Running',
  },
};

export const MRCard: React.FC<MRCardProps> = ({ mr, onClick }) => {
  const [copied, setCopied] = React.useState(false);

  const timeAgo = React.useMemo(() => {
    try {
      return formatDistanceToNow(new Date(mr.created_at), { addSuffix: true });
    } catch {
      return 'unknown';
    }
  }, [mr.created_at]);

  const stateStyle = stateStyles[mr.state] || stateStyles.opened;

  const pipelineBadge = React.useMemo(() => {
    if (!mr.pipeline) return null;
    const status =
      pipelineStyles[mr.pipeline.status as keyof typeof pipelineStyles];
    if (!status) return null;

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
          status.badge
        )}
      >
        {status.icon}
        {status.label}
      </span>
    );
  }, [mr.pipeline]);

  const handleOpenGitLab = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      const chromeInstance = (window as any)?.chrome;
      if (chromeInstance?.tabs?.create) {
        chromeInstance.tabs.create({ url: mr.web_url });
        return;
      }
    } catch (_) {
      // Fallback to window.open below
    }
    window.open(mr.web_url, '_blank', 'noopener');
  };

  const handleCopyLink = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(mr.web_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (err) {
      console.warn('Failed to copy MR link:', err);
    }
  };

  const handleMore = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    // Placeholder for future context menu / actions
  };

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-6 bg-white px-6 py-4 text-left transition hover:bg-slate-50"
      aria-label={`Open merge request ${mr.title}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              !{mr.iid}
            </span>
            <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-slate-950">
              {mr.title}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <GitBranch className="h-3.5 w-3.5 text-slate-400" />
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              {mr.source_branch}
            </span>
            <span className="text-slate-300">→</span>
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              {mr.target_branch}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            by {mr.author.name || mr.author.username || 'Unknown Author'}
          </span>
          <span className="text-slate-300">·</span>
          <span>{timeAgo}</span>
          {mr.user_notes_count !== undefined && mr.user_notes_count > 0 ? (
            <>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                {mr.user_notes_count}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
              stateStyle.badge
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                stateStyle.dot || 'bg-emerald-500'
              )}
            />
            {stateStyle.label}
          </span>
          {mr.draft ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Draft
            </span>
          ) : null}
          {mr.has_conflicts ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Conflicts
            </span>
          ) : null}
          {pipelineBadge}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenGitLab}
          className="rounded-md border border-transparent p-2 text-slate-400 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700"
          title="Open in GitLab"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="relative rounded-md border border-transparent p-2 text-slate-400 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700"
          title="Copy link"
        >
          <Copy className="h-4 w-4" />
          {copied ? (
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg">
              Copied!
            </span>
          ) : null}
        </button>
      </div>
    </button>
  );
};
