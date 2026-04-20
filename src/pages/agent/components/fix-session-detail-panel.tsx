import React from 'react';
import {
  X,
  GitMerge,
  AlertCircle,
  Clock,
  Calendar,
  Hash,
  GitBranch,
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  ExternalLink,
  Wrench,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FixSession, FixStep } from '@/types/agent-fix';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow, format } from 'date-fns';

interface FixSessionDetailPanelProps {
  session: FixSession | null;
  onClose: () => void;
  onDelete?: () => void;
}

const getStepStatusIcon = (status: FixStep['status']) => {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'skipped':
      return <Circle className="h-4 w-4 text-gray-300" />;
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-gray-200" />;
  }
};

const getStepStatusBg = (status: FixStep['status']) => {
  switch (status) {
    case 'done':
      return 'bg-emerald-50 border-emerald-100';
    case 'running':
      return 'bg-blue-50 border-blue-100';
    case 'error':
      return 'bg-red-50 border-red-100';
    default:
      return 'bg-gray-50 border-gray-100';
  }
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'running':
    case 'fetching_issue':
    case 'cloning_repo':
    case 'creating_branch':
    case 'agent_running':
    case 'pushing_changes':
    case 'creating_mr':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-100',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: 'Running',
      };
    case 'done':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-100',
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: 'Complete',
      };
    case 'error':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-100',
        icon: <XCircle className="h-3 w-3" />,
        label: 'Failed',
      };
    default:
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-700',
        border: 'border-gray-100',
        icon: <Clock className="h-3 w-3" />,
        label: status,
      };
  }
};

// Helper to safely parse date and check validity
const isValidDate = (dateString: string | undefined | null): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

const formatFullDate = (dateString: string | undefined | null) => {
  if (!isValidDate(dateString)) return 'N/A';
  return new Date(dateString!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (dateString: string | undefined | null) => {
  if (!isValidDate(dateString)) return 'N/A';
  try {
    return formatDistanceToNow(new Date(dateString!), { addSuffix: true });
  } catch {
    return 'N/A';
  }
};

const formatEventTime = (dateString: string | undefined | null) => {
  if (!isValidDate(dateString)) return '--:--:--';
  try {
    return format(new Date(dateString!), 'HH:mm:ss');
  } catch {
    return '--:--:--';
  }
};

export const FixSessionDetailPanel: React.FC<FixSessionDetailPanelProps> = ({
  session,
  onClose,
  onDelete,
}) => {
  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Wrench className="w-6 h-6 text-gray-300" />
        </div>
        <p className="font-medium text-gray-900 text-sm">Select a session</p>
        <p className="text-xs text-gray-400 mt-1 max-w-[180px]">
          Click on a fix session to view details
        </p>
      </div>
    );
  }

  const statusConfig = getStatusConfig(session.status);
  const steps = session.steps || [];
  const events = session.events || [];

  // Calculate completed steps
  const completedSteps = steps.filter(s => s.status === 'done').length;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 text-sm">Session Details</h3>
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
            statusConfig.bg, statusConfig.text, statusConfig.border
          )}>
            {statusConfig.icon}
            <span className="ml-0.5">{statusConfig.label}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Issue Info */}
          <div>
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 shrink-0">
                #{session.issueIid}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">
                  {session.issueTitle || `Issue #${session.issueIid}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {session.projectName || `Project ${session.projectId}`}
                </p>
              </div>
            </div>
          </div>

          {/* Status Message */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-600 leading-relaxed">
              {session.message}
            </p>
          </div>

          {/* MR URL if done */}
          {session.mrUrl && (
            <a
              href={session.mrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-colors group"
            >
              <GitMerge className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-700 font-medium flex-1">
                View Merge Request
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
            </a>
          )}

          {/* Error message if failed */}
          {session.error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 leading-relaxed">
                {session.error}
              </p>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <>
              <Separator className="bg-gray-100" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Execution Steps
                  </h4>
                  <span className="text-xs text-gray-400">
                    {completedSteps}/{steps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {steps.map((step, index) => (
                    <div
                      key={step.id || index}
                      className={cn(
                        'flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors',
                        getStepStatusBg(step.status)
                      )}
                    >
                      <div className="mt-0.5">
                        {getStepStatusIcon(step.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800">
                          {step.title}
                        </p>
                        {step.message && (
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                            {step.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator className="bg-gray-100" />

          {/* Properties */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Properties
            </h4>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Hash className="w-3.5 h-3.5" />
                  Session ID
                </span>
                <span className="font-mono text-gray-600">
                  {session.sessionId ? session.sessionId.substring(0, 8) : 'N/A'}
                </span>
              </div>

              {session.targetBranch && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <GitBranch className="w-3.5 h-3.5" />
                    Branch
                  </span>
                  <span className="font-mono text-gray-600 text-[11px]">
                    {session.targetBranch}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Calendar className="w-3.5 h-3.5" />
                  Created
                </span>
                <span className="text-gray-600">
                  {formatFullDate(session.createdAt)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  Updated
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-gray-600 cursor-help">
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{formatFullDate(session.updatedAt)}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Events Timeline */}
          {events.length > 0 && (
            <>
              <Separator className="bg-gray-100" />
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Event Log
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {events.slice(-8).map((event, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-xs p-2 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <span className="text-gray-300 font-mono shrink-0">
                        {formatEventTime(event.timestamp)}
                      </span>
                      <span className="font-medium text-gray-500 shrink-0">
                        [{event.stage}]
                      </span>
                      <span className="text-gray-600 flex-1 truncate">
                        {event.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <Separator className="bg-gray-100" />
          <div className="space-y-2 pb-2">
            {session.mrUrl && (
              <Button
                variant="default"
                className="w-full gap-2 bg-gray-900 hover:bg-gray-800 rounded-xl"
                size="sm"
                onClick={() => window.open(session.mrUrl, '_blank')}
              >
                <GitMerge className="w-4 h-4" />
                View Merge Request
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
                size="sm"
                onClick={onDelete}
              >
                <XCircle className="w-4 h-4" />
                Delete session
              </Button>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
