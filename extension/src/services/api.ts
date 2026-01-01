/**
 * API service for direct GitLab communication (No Backend)
 */

import { storageService } from './storage';
import bridgeFetch from './fetch-bridge';
import { UserData, AuthData, IssueData } from '@/types/messages';
import type {
  MRNote,
  MRNoteSnippet,
  MRNoteFixSuggestion,
  MRNoteFixPreview,
  MRNoteFixApplyResult,
  ListMRsResponse,
} from '@/types/merge-requests';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T | null;
  error?: string;
  message?: string;
  meta?: any;
}

export interface GitLabLabel {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  gitlabProjectId?: string;
  gitlab_project_id?: number;
  path_with_namespace?: string;
  hasLocalData?: boolean;
  isActive: boolean;
  createdAt: string;
  last_activity_at?: string;
}

export interface GitLabUser {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl?: string;
  webUrl?: string;
}

export interface GitLabIssueDetail {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  web_url?: string;
  author?: { id: number; name: string; username?: string; avatar_url?: string };
  assignees?: {
    id: number;
    name: string;
    username?: string;
    avatar_url?: string;
  }[];
  labels?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface GitLabIssueNote {
  id: number;
  body: string;
  system?: boolean;
  created_at: string;
  author?: { id: number; name: string; username?: string; avatar_url?: string };
}

export interface IssueListItem {
  id: string;
  number?: number;
  title: string;
  project: {
    id: string;
    name: string;
    labels?: GitLabLabel[];
  };
  labels: string[];
  assignee?: {
    id: string;
    name: string;
    avatarUrl?: string;
    username?: string;
  } | null;
  author: { id: string; name: string; username?: string };
  createdAt: string;
}

export interface ListIssuesParams {
  search?: string;
  projectId?: string;
  labels?: string[];
  assigneeId?: string | 'unassigned';
  createdBy?: 'me' | string | 'any';
  status?: 'draft' | 'submitted' | 'in_progress' | 'resolved' | 'closed';
  cursor?: string | null;
  limit?: number;
  sort?: 'newest' | 'oldest';
}

export interface ListIssuesResponse {
  items: IssueListItem[];
  nextCursor?: string | null;
  projectLabels?: Record<string, GitLabLabel[]>;
}

class ApiService {
  private gitlabBaseUrl = 'https://gitlab.com/api/v4';

  private async getGitLabHeaders(): Promise<Record<string, string>> {
    const auth = await storageService.getAuth();
    // Use gitlabToken if available, otherwise fallback to jwtToken (though it's usually for backend)
    // After backend removal, users should ideally provide a GitLab Personal Access Token
    const token = auth?.gitlabToken || auth?.jwtToken;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getGitLabHeaders();
      const url = endpoint.startsWith('http')
        ? endpoint
        : `${this.gitlabBaseUrl}${endpoint}`;

      const resp = await bridgeFetch<T>({
        url,
        init: {
          ...options,
          headers: {
            ...headers,
            ...(options.headers as any),
          },
        },
        responseType: 'json',
      });

      if (!resp.ok) {
        return {
          success: false,
          error: `GitLab API Error: ${resp.status} ${resp.statusText}`,
          message: resp.body as any,
        };
      }

      return {
        success: true,
        data: resp.body,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Network error calling GitLab API',
      };
    }
  }

  // Projects
  async getProjects(): Promise<ApiResponse<Project[]>> {
    const res = await this.request<any[]>(
      '/projects?membership=true&simple=true&per_page=100'
    );
    if (res.success && res.data) {
      const projects = res.data.map(
        p =>
          ({
            id: String(p.id),
            name: p.name_with_namespace || p.name,
            gitlabProjectId: String(p.id),
            gitlab_project_id: p.id,
            path_with_namespace: p.path_with_namespace,
            isActive: true,
            createdAt: p.created_at,
          }) as Project
      );
      return { success: true, data: projects };
    }
    return res as any;
  }

  async getGitLabProjectLabels(
    projectId: string | number
  ): Promise<ApiResponse<{ items: GitLabLabel[] }>> {
    const res = await this.request<any[]>(`/projects/${projectId}/labels`);
    if (res.success && res.data) {
      return { success: true, data: { items: res.data } };
    }
    return res as any;
  }

  async getUsersInProject(
    projectId: string | number
  ): Promise<ApiResponse<GitLabUser[]>> {
    const res = await this.request<any[]>(`/projects/${projectId}/members/all`);
    if (res.success && res.data) {
      const users = res.data.map(
        u =>
          ({
            id: String(u.id),
            username: u.username,
            name: u.name,
            avatarUrl: u.avatar_url,
            webUrl: u.web_url,
          }) as GitLabUser
      );
      return { success: true, data: users };
    }
    return res as any;
  }

  async searchUsersInProject(
    projectId: string | number,
    params: { search?: string; limit?: number } = {}
  ): Promise<ApiResponse<GitLabUser[]>> {
    const q = new URLSearchParams();
    if (params.search) q.append('query', params.search);
    if (params.limit) q.append('per_page', String(params.limit));
    const res = await this.request<any[]>(
      `/projects/${projectId}/members/all?${q.toString()}`
    );
    if (res.success && res.data) {
      const users = res.data.map(
        u =>
          ({
            id: String(u.id),
            username: u.username,
            name: u.name,
            avatarUrl: u.avatar_url,
            webUrl: u.web_url,
          }) as GitLabUser
      );
      return { success: true, data: users };
    }
    return res as any;
  }

  // Issues
  async listGitLabIssues(
    projectId: string,
    params: ListIssuesParams & { limit?: number } = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.assigneeId)
      q.append(
        'assignee_id',
        params.assigneeId === 'unassigned' ? 'None' : params.assigneeId
      );
    q.append('per_page', String(params.limit || 20));
    const page = params.cursor ? parseInt(params.cursor) : 1;
    q.append('page', String(page));

    const res = await this.request<any[]>(
      `/projects/${projectId}/issues?${q.toString()}`
    );
    if (res.success && res.data) {
      const items = res.data.map(
        it =>
          ({
            id: String(it.id),
            number: it.iid,
            title: it.title,
            project: {
              id: String(it.project_id),
              name: it.references?.full || 'Project',
            },
            labels: it.labels || [],
            assignee: it.assignees?.[0]
              ? {
                  id: String(it.assignees[0].id),
                  name: it.assignees[0].name,
                  avatarUrl: it.assignees[0].avatar_url,
                  username: it.assignees[0].username,
                }
              : null,
            author: {
              id: String(it.author.id),
              name: it.author.name,
              username: it.author.username,
            },
            createdAt: it.created_at,
          }) as IssueListItem
      );

      const nextCursor =
        res.data.length === (params.limit || 20) ? String(page + 1) : null;
      return { success: true, data: { items, nextCursor } };
    }
    return res as any;
  }

  async listGitLabIssuesGlobal(
    params: ListIssuesParams & { limit?: number } = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.projectId) q.append('project_id', params.projectId);
    q.append('per_page', String(params.limit || 20));
    const page = params.cursor ? parseInt(params.cursor) : 1;
    q.append('page', String(page));

    const res = await this.request<any[]>(`/issues?${q.toString()}`);
    if (res.success && res.data) {
      const items = res.data.map(
        it =>
          ({
            id: String(it.id),
            number: it.iid,
            title: it.title,
            project: {
              id: String(it.project_id),
              name: it.references?.full || 'Project',
            },
            labels: it.labels || [],
            assignee: it.assignees?.[0]
              ? {
                  id: String(it.assignees[0].id),
                  name: it.assignees[0].name,
                  avatarUrl: it.assignees[0].avatar_url,
                  username: it.assignees[0].username,
                }
              : null,
            author: {
              id: String(it.author.id),
              name: it.author.name,
              username: it.author.username,
            },
            createdAt: it.created_at,
          }) as IssueListItem
      );

      const nextCursor =
        res.data.length === (params.limit || 20) ? String(page + 1) : null;
      return { success: true, data: { items, nextCursor } };
    }
    return res as any;
  }

  async getGitLabIssue(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    return this.request<GitLabIssueDetail>(
      `/projects/${projectId}/issues/${issueIid}`
    );
  }

  async createGitLabIssue(
    projectId: string | number,
    data: any,
    _options?: any
  ): Promise<ApiResponse<{ issue: GitLabIssueDetail }>> {
    const res = await this.request<GitLabIssueDetail>(
      `/projects/${projectId}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          labels: data.labels?.join(','),
          assignee_ids: data.assigneeIds,
        }),
      }
    );
    if (res.success && res.data) {
      return { success: true, data: { issue: res.data } };
    }
    return res as any;
  }

  async updateGitLabIssue(
    projectId: string | number,
    issueIid: number,
    payload: any
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    const res = await this.request<GitLabIssueDetail>(
      `/projects/${projectId}/issues/${issueIid}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
    return res;
  }

  async getGitLabIssueNotes(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<{ items: GitLabIssueNote[] }>> {
    const res = await this.request<any[]>(
      `/projects/${projectId}/issues/${issueIid}/notes`
    );
    if (res.success && res.data) {
      return { success: true, data: { items: res.data } };
    }
    return res as any;
  }

  async addGitLabIssueNote(
    projectId: string | number,
    issueIid: number,
    body: string,
    _options?: any
  ): Promise<ApiResponse<{ note: any }>> {
    const res = await this.request<any>(
      `/projects/${projectId}/issues/${issueIid}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
    if (res.success && res.data) {
      return { success: true, data: { note: res.data } };
    }
    return res as any;
  }

  // Merge Requests
  async getMergeRequests(
    projectId: string | number,
    options: any = {}
  ): Promise<ApiResponse<{ items: any[]; total: number }>> {
    const q = new URLSearchParams(options);
    const res = await this.request<any[]>(
      `/projects/${projectId}/merge_requests?${q.toString()}`
    );
    if (res.success && res.data) {
      return {
        success: true,
        data: { items: res.data, total: res.data.length },
      };
    }
    return res as any;
  }

  async getMergeRequestsForProjects(
    projectIds: Array<string | number>,
    options: any = {}
  ): Promise<ApiResponse<ListMRsResponse>> {
    // GitLab global MR endpoint (across all projects membership)
    const q = new URLSearchParams(options);
    if (projectIds.length > 0) {
      // GitLab doesn't support multiple project_ids in query directly easily for merge_requests
      // Usually you'd use /merge_requests?scope=all or loop.
      // For now, we'll use the user-wide search if no projectIds, or just use the first if provided (simplified)
    }
    const res = await this.request<any[]>(`/merge_requests?${q.toString()}`);
    if (res.success && res.data) {
      return {
        success: true,
        data: { items: res.data, total: res.data.length } as any,
      };
    }
    return res as any;
  }

  async getMergeRequest(
    projectId: string | number,
    mrIid: number
  ): Promise<ApiResponse<any>> {
    return this.request(`/projects/${projectId}/merge_requests/${mrIid}`);
  }

  async getMergeRequestNotes(
    projectId: string | number,
    mrIid: number
  ): Promise<ApiResponse<{ items: MRNote[] }>> {
    const res = await this.request<any[]>(
      `/projects/${projectId}/merge_requests/${mrIid}/notes`
    );
    if (res.success && res.data) {
      return { success: true, data: { items: res.data as any } };
    }
    return res as any;
  }

  async getMergeRequestChanges(
    projectId: string | number,
    mrIid: number
  ): Promise<ApiResponse<any>> {
    return this.request(
      `/projects/${projectId}/merge_requests/${mrIid}/changes`
    );
  }

  async getMergeRequestNoteSnippet(
    projectId: string | number,
    mrIid: number,
    params: any
  ): Promise<ApiResponse<any>> {
    // This was a backend-heavy feature. Returning stub.
    return {
      success: false,
      error: 'Note snippets requires backend processing',
    };
  }

  async getProjectBranches(
    projectId: string | number,
    options: any = {}
  ): Promise<ApiResponse<{ items: any[]; total: number }>> {
    const q = new URLSearchParams(options);
    const res = await this.request<any[]>(
      `/projects/${projectId}/repository/branches?${q.toString()}`
    );
    if (res.success && res.data) {
      return {
        success: true,
        data: { items: res.data, total: res.data.length },
      };
    }
    return res as any;
  }

  // Mocked/Disabled methods (formerly backend endpoints)
  async uploadFile(
    file: File,
    purpose: string
  ): Promise<ApiResponse<{ url: string; id: string }>> {
    console.warn('File upload disabled: requires backend storage.');
    return {
      success: false,
      error:
        'File upload requires backend infrastructure which has been removed.',
    };
  }

  async getSlackChannels(): Promise<ApiResponse<any[]>> {
    return { success: true, data: [] };
  }
  async getSlackUsers(): Promise<ApiResponse<any[]>> {
    return { success: true, data: [] };
  }
  async generateDescriptionFromTemplate(
    _params?: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }
  async generateGitLabIssueTitle(
    _projectId: any,
    _params: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }
  async generateMergeRequestDescription(
    _projectId: any,
    _params: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }
  async generateMergeRequestNoteFix(
    _projectId: any,
    _mrIid: any,
    _params: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }
  async applyMergeRequestNoteFix(
    _projectId: any,
    _mrIid: any,
    _payload: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }
  async undoMergeRequestNoteFix(
    _projectId: any,
    _mrIid: any,
    _token: any
  ): Promise<ApiResponse<any>> {
    return { success: false, error: 'AI features disabled.' };
  }

  async createMergeRequest(
    data: any,
    _options?: any
  ): Promise<ApiResponse<any>> {
    const res = await this.request<any>(
      `/projects/${data.projectId || data.project_id}/merge_requests`,
      {
        method: 'POST',
        body: JSON.stringify({
          source_branch: data.sourceBranch,
          target_branch: data.targetBranch,
          title: data.title,
          description: data.description,
          labels: data.labels?.join(','),
          assignee_ids: data.assigneeIds,
          remove_source_branch: data.removeSourceBranch,
          squash: data.squash,
        }),
      }
    );
    return res;
  }

  // Auth (Disabled backend flows)
  async logout(): Promise<ApiResponse<void>> {
    await storageService.remove('auth');
    await storageService.remove('user');
    return { success: true };
  }

  // Compatibility stubs
  async healthCheck(): Promise<ApiResponse<any>> {
    return { success: true, data: { status: 'standalone' } };
  }
  async getGitLabUsers(): Promise<ApiResponse<GitLabUser[]>> {
    const res = await this.request<any[]>('/users?per_page=100');
    if (res.success && res.data) {
      const users = res.data.map(
        u =>
          ({
            id: String(u.id),
            username: u.username,
            name: u.name,
            avatarUrl: u.avatar_url,
            webUrl: u.web_url,
          }) as GitLabUser
      );
      return { success: true, data: users };
    }
    return res as any;
  }

  async createIssue(
    data: any,
    _options?: any,
    _extra?: any
  ): Promise<ApiResponse<any>> {
    return this.createGitLabIssue(data.projectId || data.project_id, data);
  }

  async getIssues(
    params: ListIssuesParams & { limit?: number } = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    return this.listGitLabIssuesGlobal(params);
  }

  async getIssue(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    return this.getGitLabIssue(projectId, issueIid);
  }

  async updateIssue(
    projectId: string | number,
    issueIid: number,
    payload: any
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    return this.updateGitLabIssue(projectId, issueIid, payload);
  }

  async deleteIssue(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<void>> {
    // Delete is dangerous, usually not exposed in the same way, but let's provide the GitLab call
    return this.request(`/projects/${projectId}/issues/${issueIid}`, {
      method: 'DELETE',
    });
  }

  async listIssues(
    params: ListIssuesParams & { limit?: number } = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    return this.listGitLabIssuesGlobal(params);
  }

  async getIssuesByIds(ids: string[]): Promise<ApiResponse<IssueListItem[]>> {
    // GitLab doesn't have a batch get by global ID easily.
    // This usually implies backend-side filtering of its own DB.
    // For now returning empty or we'd have to loop many calls.
    return { success: true, data: [] };
  }

  // Projects stubs
  async createProject(data: any): Promise<ApiResponse<Project>> {
    return {
      success: false,
      error: 'Project creation via extension is disabled.',
    };
  }
  async updateProject(id: string, data: any): Promise<ApiResponse<Project>> {
    return {
      success: false,
      error: 'Project update via extension is disabled.',
    };
  }
  async deleteProject(id: string): Promise<ApiResponse<void>> {
    return {
      success: false,
      error: 'Project deletion via extension is disabled.',
    };
  }
  async searchProjects(query: string): Promise<ApiResponse<Project[]>> {
    const res = await this.request<any[]>(
      `/projects?search=${encodeURIComponent(query)}&simple=true&membership=true`
    );
    if (res.success && res.data) {
      const projects = res.data.map(
        p =>
          ({
            id: String(p.id),
            name: p.name_with_namespace || p.name,
            isActive: true,
            createdAt: p.created_at,
          }) as Project
      );
      return { success: true, data: projects };
    }
    return res as any;
  }
  async getRecentProjects(_userId?: any): Promise<ApiResponse<Project[]>> {
    return this.getProjects();
  }
  async getRecentIssueProjects(_userId?: any): Promise<ApiResponse<Project[]>> {
    return this.getProjects();
  }

  // Slack stubs
  async connectSlack(_token?: any): Promise<ApiResponse<any>> {
    return { success: false, error: 'Slack integration requires backend' };
  }
  async disconnectSlack(): Promise<ApiResponse<any>> {
    return { success: false, error: 'Slack integration requires backend' };
  }
  async getSlackConnectUrl(): Promise<ApiResponse<{ url: string }>> {
    return { success: false, error: 'Slack integration requires backend' };
  }
  async postSlackMessage(): Promise<ApiResponse<any>> {
    return { success: false, error: 'Slack integration requires backend' };
  }

  // Auth stubs/mock
  async login(_data: any): Promise<ApiResponse<AuthData>> {
    return {
      success: false,
      error: 'Direct login disabled. Please use GitLab Token.',
    };
  }
  async register(_data: any): Promise<ApiResponse<AuthData>> {
    return { success: false, error: 'Registration disabled.' };
  }
  async refreshToken(): Promise<ApiResponse<AuthData>> {
    return { success: false, error: 'Token refresh disabled.' };
  }
  async getProfile(): Promise<ApiResponse<UserData>> {
    const res = await this.request<any>('/user');
    if (res.success && res.data) {
      return {
        success: true,
        data: {
          id: String(res.data.id),
          email: res.data.email,
          name: res.data.name,
        } as any,
      };
    }
    return res as any;
  }
  async updateProfile(_data: any): Promise<ApiResponse<UserData>> {
    return { success: false, error: 'Profile update disabled.' };
  }
  async connectGitLab(_token?: any): Promise<ApiResponse<any>> {
    return { success: false, error: 'GitLab linking requires backend OAuth' };
  }
  async disconnectGitLab(): Promise<ApiResponse<any>> {
    return { success: false, error: 'GitLab linking requires backend OAuth' };
  }

  // Voice stubs
  async transcribeVoice(_blob: Blob): Promise<ApiResponse<{ text: string }>> {
    return { success: false, error: 'Voice transcription requires backend' };
  }
}

export const apiService = new ApiService();
export default apiService;
