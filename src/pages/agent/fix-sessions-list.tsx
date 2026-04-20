import React, { useState } from 'react';
import { useNavigation } from '@/contexts/navigation-context';
import { useFixSessions, useDeleteFixSession } from './hooks/use-fix-sessions';
import { FixSession } from '@/types/agent-fix';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  Trash2,
  Wrench,
  Calendar,
  GitMerge,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { FixSessionDetailPanel } from './components/fix-session-detail-panel';

interface FixSessionsListPageProps {
  portalContainer?: HTMLElement | null;
}

// Skeleton component for loading state
const FixSessionSkeleton: React.FC = () => {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-white">
      <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
};

export const FixSessionsListPage: React.FC<FixSessionsListPageProps> = ({ portalContainer }) => {
  const { pop } = useNavigation();
  const { sessions, isLoading, refetch } = useFixSessions();
  const deleteMutation = useDeleteFixSession();
  const [sessionToDelete, setSessionToDelete] = useState<FixSession | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, session: FixSession) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      try {
        await deleteMutation.mutateAsync(sessionToDelete.sessionId);
        toast.success('Session deleted successfully');
        if (selectedSessionId === sessionToDelete.sessionId) {
          setSelectedSessionId(null);
        }
      } catch (error) {
        toast.error('Failed to delete session');
      }
      setSessionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setSessionToDelete(null);
  };

  // Helper to safely parse date and check validity
  const isValidDate = (dateString: string | undefined | null): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };

  // Format relative time
  const formatRelativeTime = (dateString: string | undefined | null) => {
    if (!isValidDate(dateString)) return 'N/A';
    try {
      return formatDistanceToNow(new Date(dateString!), { addSuffix: true });
    } catch {
      return 'N/A';
    }
  };

  // Get status badge config
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
          color: 'bg-blue-50 text-blue-700 border-blue-100',
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          label: 'Running',
        };
      case 'done':
        return {
          color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Complete',
        };
      case 'error':
        return {
          color: 'bg-red-50 text-red-700 border-red-100',
          icon: <XCircle className="h-3 w-3" />,
          label: 'Failed',
        };
      default:
        return {
          color: 'bg-gray-50 text-gray-700 border-gray-100',
          icon: <Clock className="h-3 w-3" />,
          label: status,
        };
    }
  };

  // Get the selected session data from the list
  const getSelectedSession = (): FixSession | null => {
    if (!selectedSessionId) return null;
    return sessions.find(s => s.sessionId === selectedSessionId) || null;
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Header */}
      <div className="flex-none px-8 pt-8 pb-4 bg-white z-20">
        <h1 className="text-2xl font-bold text-gray-900">Fix Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor and manage your automated fix sessions
        </p>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sessions List */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1">
            <div className="px-8 pb-8">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <FixSessionSkeleton key={i} />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <Wrench className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium mb-1">No fix sessions yet</h3>
                  <p className="text-sm text-gray-400 max-w-xs">
                    Start a fix agent from an issue to see it listed here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {sessions.map((session: FixSession, index: number) => {
                      const statusConfig = getStatusConfig(session.status);
                      const isSelected = selectedSessionId === session.sessionId;
                      
                      return (
                        <motion.div
                          key={session.sessionId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ delay: index * 0.03, duration: 0.2 }}
                          onClick={() => setSelectedSessionId(session.sessionId)}
                          className={cn(
                            'group relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer bg-white',
                            'hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm',
                            'transition-all duration-200',
                            isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                            session.status === 'done' ? 'bg-emerald-50' :
                            session.status === 'error' ? 'bg-red-50' :
                            'bg-gray-100'
                          )}>
                            {session.status === 'done' ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : session.status === 'error' ? (
                              <XCircle className="h-5 w-5 text-red-500" />
                            ) : (
                              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-gray-900 truncate">
                                  {session.issueTitle || `Issue #${session.issueIid}`}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {session.projectName || `Project ${session.projectId}`}
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Status Badge */}
                                <div className={cn(
                                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                  statusConfig.color
                                )}>
                                  {statusConfig.icon}
                                  <span>{statusConfig.label}</span>
                                </div>
                                
                                {/* Delete Button */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 hover:bg-red-50"
                                      onClick={(e) => handleDeleteClick(e, session)}
                                      disabled={deleteMutation.isPending}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>Delete session</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>

                            {/* Status Message - only show if no error */}
                            {session.status !== 'error' && session.message && (
                              <p className="text-xs text-gray-500 line-clamp-2">
                                {session.message}
                              </p>
                            )}

                            {/* Error message if failed */}
                            {session.status === 'error' && session.error && (
                              <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 rounded-lg border border-red-100">
                                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-red-600 line-clamp-2">
                                  {session.error}
                                </p>
                              </div>
                            )}

                            {/* MR URL if done */}
                            {session.mrUrl && (
                              <a
                                href={session.mrUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <GitMerge className="h-3.5 w-3.5" />
                                <span>View Merge Request</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}

                            {/* Metadata */}
                            <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{formatRelativeTime(session.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Sidepanel */}
      <AnimatePresence>
        {selectedSessionId && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-40"
              onClick={() => setSelectedSessionId(null)}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: 436, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 436, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-0 bottom-0 w-[436px] z-50 border-l border-gray-200 bg-white overflow-hidden flex flex-col shadow-2xl"
            >
              <FixSessionDetailPanel
                session={getSelectedSession()}
                onClose={() => setSelectedSessionId(null)}
                onDelete={async () => {
                  if (selectedSessionId) {
                    try {
                      await deleteMutation.mutateAsync(selectedSessionId);
                      toast.success('Session deleted successfully');
                      setSelectedSessionId(null);
                    } catch (error) {
                      toast.error('Failed to delete session');
                    }
                  }
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && handleCancelDelete()}>
        <AlertDialogContent container={portalContainer}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fix Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this fix session?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
