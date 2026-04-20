import { useState, useCallback, useRef, useEffect } from 'react';
import { FixEvent, FixStage, FixSession } from '@/types/agent-fix';
import { startFixIssue, getFixSessionStatus } from '@/api/agent-fix';
import { useQueryClient } from '@tanstack/react-query';

export function useFixIssue() {
  const [stage, setStage] = useState<FixStage | null>(null);
  const [message, setMessage] = useState('');
  const [mrUrl, setMrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sid: string) => {
    stopPolling();
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const session = await getFixSessionStatus(sid);
        
        // Map backend status to frontend stage
        const mappedStage = session.status as FixStage;
        setStage(mappedStage);
        setMessage(session.message);
        
        if (session.mr_url) {
          setMrUrl(session.mr_url);
        }
        
        if (session.error) {
          setError(session.error);
        }
        
        if (session.status === 'done' || session.status === 'error') {
          setIsRunning(false);
          stopPolling();
          // Invalidate sessions list to refresh
          queryClient.invalidateQueries({ queryKey: ['fix-sessions'] });
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        setError(err.message);
        setStage('error');
        setIsRunning(false);
        stopPolling();
      }
    }, 2000); // Poll every 2 seconds
  }, [stopPolling, queryClient]);

  const startFix = useCallback(
    async (
      projectId: number,
      issueIid: number,
      options?: {
        repoProjectId?: number;
        targetBranch?: string;
        additionalContext?: string;
      }
    ) => {
      // Reset state
      setStage('fetching_issue');
      setMessage('Starting fix agent...');
      setMrUrl(null);
      setError(null);
      setLogLines([]);
      setIsRunning(true);

      try {
        // Start the fix agent and get session ID
        const result = await startFixIssue(projectId, issueIid, {
          repoProjectId: options?.repoProjectId,
          targetBranch: options?.targetBranch,
          additionalContext: options?.additionalContext,
        });

        setSessionId(result.session_id);
        
        // Start polling for status updates
        startPolling(result.session_id);
      } catch (err: any) {
        console.error('Failed to start fix agent:', err);
        setError(err.message);
        setStage('error');
        setIsRunning(false);
      }
    },
    [startPolling]
  );

  const cancelFix = useCallback(() => {
    stopPolling();
    setIsRunning(false);
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setSessionId(null);
    setStage(null);
    setMessage('');
    setMrUrl(null);
    setError(null);
    setLogLines([]);
    setIsRunning(false);
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    stage,
    message,
    mrUrl,
    error,
    logLines,
    isRunning,
    sessionId,
    startFix,
    cancelFix,
    reset,
  };
}
