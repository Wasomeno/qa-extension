import { FixIssueRequest, FixSession, FixEvent } from '@/types/agent-fix';
import { MessageType } from '@/types/messages';
import { api } from '@/services/api';

export interface FixIssueCallbacks {
  onEvent: (event: FixEvent) => void;
  onError: (error: string) => void;
  onComplete: () => void;
}

// POST /agent/fix-issue - Starts a fix agent session and returns session_id
export async function startFixIssue(
  projectId: number,
  issueIid: number,
  options?: {
    repoProjectId?: number;
    targetBranch?: string;
    additionalContext?: string;
  }
): Promise<{ session_id: string; message: string }> {
  const payload: FixIssueRequest = {
    project_id: projectId,
    issue_iid: issueIid,
  };

  if (options?.repoProjectId !== undefined) {
    payload.repo_project_id = options.repoProjectId;
  }

  if (options?.targetBranch) {
    payload.target_branch = options.targetBranch;
  }

  if (options?.additionalContext) {
    payload.additional_context = options.additionalContext;
  }

  const response = await api.post<{ session_id: string; message: string }>('/agent/fix-issue', {
    body: payload as any,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to start fix agent');
  }

  return response.data;
}

// GET /agent/fix-status/:session_id - Get status of a fix session
export async function getFixSessionStatus(sessionId: string): Promise<FixSession> {
  const response = await api.get<FixSession>(`/agent/fix-status/${sessionId}`);
  
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to get fix session status');
  }

  return response.data;
}

// GET /agent/fix-sessions - List all fix sessions
export async function getFixSessions(): Promise<FixSession[]> {
  const response = await api.get<{ sessions: FixSession[] }>('/agent/fix-sessions');
  
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to get fix sessions');
  }

  return response.data.sessions || [];
}

// DELETE /agent/fix-sessions/:session_id - Delete a fix session
export async function deleteFixSession(sessionId: string): Promise<void> {
  const response = await api.delete(`/agent/fix-sessions/${sessionId}`);
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to delete fix session');
  }
}

// POST /agent/fix-issue with SSE streaming via background bridge (legacy direct streaming)
// Follows the same pattern as agent-chat-sse
export function fixIssueWithAgent(
  projectId: number,
  issueIid: number,
  options: {
    repoProjectId?: number;
    targetBranch?: string;
  } & FixIssueCallbacks
): () => void {
  const { repoProjectId, targetBranch, onEvent, onError, onComplete } = options;

  // Connect to background via port for SSE streaming
  const port = chrome.runtime.connect({ name: 'agent-fix-sse' });

  const messageListener = (msg: { event: string; data: any }) => {
    if (msg.event === 'fix_event' && msg.data) {
      onEvent(msg.data as FixEvent);
    } else if (msg.event === 'error') {
      onError(msg.data);
    }
  };

  const disconnectListener = () => {
    onComplete();
  };

  port.onMessage.addListener(messageListener);
  port.onDisconnect.addListener(disconnectListener);

  // Send the fix request
  port.postMessage({
    type: MessageType.AGENT_FIX_ISSUE_SSE,
    data: {
      project_id: projectId,
      issue_iid: issueIid,
      repo_project_id: repoProjectId,
      target_branch: targetBranch,
    },
  });

  // Return cancel function
  return () => {
    port.onMessage.removeListener(messageListener);
    port.onDisconnect.removeListener(disconnectListener);
    port.disconnect();
  };
}
