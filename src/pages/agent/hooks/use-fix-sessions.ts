import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFixSessions, getFixSessionStatus, getFixSessionDetails, startFixIssue, deleteFixSession } from '@/api/agent-fix';
import { FixSession } from '@/types/agent-fix';

export function useFixSessions() {
  const query = useQuery<FixSession[]>({
    queryKey: ['fix-sessions'],
    queryFn: getFixSessions,
    refetchInterval: 5000, // Poll every 5 seconds for running sessions
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    sessions: query.data || [],
  };
}

export function useFixSession(sessionId: string | null) {
  const query = useQuery<FixSession | null>({
    queryKey: ['fix-session', sessionId],
    queryFn: () => sessionId ? getFixSessionStatus(sessionId) : Promise.resolve(null),
    enabled: !!sessionId,
    refetchInterval: 2000, // Poll every 2 seconds when session is active
    refetchOnWindowFocus: true,
  });

  return query;
}

export function useFixSessionDetails(sessionId: string | null) {
  const query = useQuery<FixSession | null>({
    queryKey: ['fix-session-details', sessionId],
    queryFn: () => sessionId ? getFixSessionDetails(sessionId) : Promise.resolve(null),
    enabled: !!sessionId,
    refetchInterval: 3000, // Poll every 3 seconds for updates
    refetchOnWindowFocus: true,
  });

  return query;
}

export function useStartFixIssue() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: {
      projectId: number;
      issueIid: number;
      repoProjectId?: number;
      targetBranch?: string;
      additionalContext?: string;
    }) => startFixIssue(
      params.projectId,
      params.issueIid,
      {
        repoProjectId: params.repoProjectId,
        targetBranch: params.targetBranch,
        additionalContext: params.additionalContext,
      }
    ),
    onSuccess: () => {
      // Invalidate sessions list to refresh
      queryClient.invalidateQueries({ queryKey: ['fix-sessions'] });
    },
  });

  return mutation;
}

export function useDeleteFixSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (sessionId: string) => deleteFixSession(sessionId),
    onSuccess: () => {
      // Invalidate sessions list to refresh
      queryClient.invalidateQueries({ queryKey: ['fix-sessions'] });
    },
  });

  return mutation;
}
