export type FixStage =
  | 'fetching_issue'
  | 'cloning_repo'
  | 'creating_branch'
  | 'agent_running'
  | 'pushing_changes'
  | 'creating_mr'
  | 'done'
  | 'error';

export interface FixEvent {
  stage: FixStage;
  message: string;
  mr_url?: string;
  error?: string;
  log_line?: string;
  timestamp: string;
}

export interface FixStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  message?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface FixIssueRequest {
  project_id: number;
  issue_iid: number;
  repo_project_id?: number;
  target_branch?: string;
  additional_context?: string;
  runner?: string;
}

export interface FixSession {
  sessionId: string;
  runner?: string;
  projectId: number;
  projectName?: string;
  repoProjectId: number;
  issueIid: number;
  issueTitle?: string;
  targetBranch: string;
  status: 'running' | 'done' | 'error' | FixStage;
  message: string;
  mrUrl?: string;
  error?: string;
  steps?: FixStep[];
  events?: FixEvent[];
  currentStep?: number;
  createdAt: string;
  updatedAt: string;
}
