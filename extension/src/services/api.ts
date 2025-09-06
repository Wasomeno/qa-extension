/**
 * API service for backend communication
 */

import { storageService } from './storage';
import bridgeFetch from './fetch-bridge';
import { MessageType } from '@/types/messages';
import {
  UserData,
  AuthData,
  IssueData,
  InteractionEvent,
} from '@/types/messages';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T | null;
  error?: string;
  message?: string;
  meta?: any;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  username: string;
}

export interface CreateIssueRequest {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  projectId: string;
  assigneeId?: string;
  attachments?: string[];
  acceptanceCriteria?: string[];
  labels?: string[];
  // AI and context extras supported by backend
  useAI?: boolean;
  checkDuplicates?: boolean;
  browserInfo?: {
    url: string;
    title: string;
    userAgent: string;
    viewport: { width: number; height: number };
  };
  errorDetails?: {
    message: string;
    stack?: string;
    type: string;
  };
  reproductionSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  // Optional Slack notification fields
  slackChannelId?: string;
  slackUserIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  gitlabProjectId?: string;
  // May be present when listing GitLab projects merged with local records
  gitlab_project_id?: number;
  hasLocalData?: boolean;
  slackChannelId?: string;
  isActive: boolean;
  createdAt: string;
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
  iid: number; // issue number within project
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

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  projectId: string;
  assigneeId?: string;
  recordingId?: string;
  gitlabIssueId?: string;
  slackThreadId?: string;
  attachments: string[];
  acceptanceCriteria: string[];
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

// Issue list item with denormalized fields for display
export interface IssueListItem {
  id: string;
  number?: number;
  title: string;
  project: { id: string; name: string };
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
  cursor?: string | null; // used as page number for backend
  limit?: number; // default 5 for extension
  sort?: 'newest' | 'oldest';
}

export interface ListIssuesResponse {
  items: IssueListItem[];
  nextCursor?: string | null;
}

export interface VoiceTranscriptionRequest {
  audioBlob: Blob;
  language?: string;
}

class ApiService {
  private baseUrl: string = 'http://localhost:3000';
  private wsConnection: WebSocket | null = null;

  constructor() {
    this.initializeBaseUrl().catch(error => {
      console.error('Failed to initialize API base URL:', error);
      // Keep default baseUrl on error
    });
    // React to settings changes to avoid stale base URLs
    try {
      storageService.onChanged('settings', v => {
        const ep = (v as any)?.apiEndpoint;
        if (typeof ep === 'string' && ep && ep !== this.baseUrl) {
          this.baseUrl = ep;
          try {
            console.log('API base URL updated via settings change:', ep);
          } catch {}
        }
      });
    } catch {}
  }

  private async initializeBaseUrl(): Promise<void> {
    try {
      const settings = await storageService.getSettings();
      this.baseUrl = settings.apiEndpoint;
      console.log('API base URL initialized:', this.baseUrl);
    } catch (error) {
      console.error('Error getting settings for API URL:', error);
      // baseUrl remains default 'http://localhost:3000'
    }
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const auth = await storageService.getAuth();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (auth?.jwtToken) {
      headers['Authorization'] = `Bearer ${auth.jwtToken}`;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const inServiceWorker = typeof document === 'undefined';
      const headers = await this.getAuthHeaders();
      const method = (options.method || 'GET').toUpperCase();
      const timeoutMs = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        ? 20000
        : 10000;

      // Service worker can fetch directly; UI contexts use background bridge
      if (inServiceWorker) {
        const response = await this.httpRequestDirect(
          `${this.baseUrl}${endpoint}`,
          {
            ...options,
            headers: { ...headers, ...(options.headers as any) },
          },
          timeoutMs
        );

        if (!response.ok) {
          if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
            const refreshResult = await this.refreshToken();
            if (refreshResult.success) {
              const newHeaders = await this.getAuthHeaders();
              const retry = await this.httpRequestDirect(
                `${this.baseUrl}${endpoint}`,
                {
                  ...options,
                  headers: { ...newHeaders, ...(options.headers as any) },
                },
                timeoutMs
              );
              if (retry.ok) {
                const body = retry.body;
                return {
                  success: true,
                  data: body && body.data !== undefined ? body.data : body,
                  message: body?.message,
                  meta: (body as any)?.meta,
                } as ApiResponse<T>;
              }
            }
          }
          const body = response.body;
          return {
            success: false,
            error:
              (body && (body.error || body.message)) ||
              `HTTP ${response.status}: ${response.statusText}`,
            message: body?.message,
            meta: (body as any)?.meta,
          } as ApiResponse<T>;
        }

        const body = response.body;
        return {
          success: true,
          data: body && body.data !== undefined ? body.data : body,
          message: body?.message,
          meta: (body as any)?.meta,
        } as ApiResponse<T>;
      }

      const resp = await bridgeFetch<any>({
        url: `${this.baseUrl}${endpoint}`,
        init: {
          ...options,
          headers: {
            ...headers,
            ...(options.headers as any),
          } as Record<string, string>,
        },
        responseType: 'json',
        timeoutMs,
      });

      if (!resp.ok) {
        // Handle 401 Unauthorized - try to refresh token once
        if (resp.status === 401 && !endpoint.includes('/auth/refresh')) {
          console.log('🔐 Got 401, attempting token refresh...');
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            console.log('🔐 Token refreshed, retrying original request...');
            const newHeaders = await this.getAuthHeaders();
            const retry = await bridgeFetch<any>({
              url: `${this.baseUrl}${endpoint}`,
              init: {
                ...options,
                headers: {
                  ...newHeaders,
                  ...(options.headers as any),
                } as Record<string, string>,
              },
              responseType: 'json',
              timeoutMs,
            });
            if (retry.ok) {
              const body = retry.body;
              return {
                success: true,
                data: body && body.data !== undefined ? body.data : body,
                message: body?.message,
                meta: (body as any)?.meta,
              } as ApiResponse<T>;
            }
          }
        }

        const body = resp.body;
        return {
          success: false,
          error:
            (body && (body.error || body.message)) ||
            `HTTP ${resp.status}: ${resp.statusText}`,
          message: body?.message,
          meta: (body as any)?.meta,
        } as ApiResponse<T>;
      }

      const body = resp.body;
      return {
        success: true,
        data: body && body.data !== undefined ? body.data : body,
        message: body?.message,
        meta: (body as any)?.meta,
      } as ApiResponse<T>;
    } catch (error) {
      console.error('API request failed (bridge):', error);
      console.error('Request details:', {
        endpoint,
        baseUrl: this.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
      });
      const isAbort =
        (error as any)?.name === 'AbortError' ||
        /aborted/i.test(String((error as any)?.message));
      return {
        success: false,
        error: isAbort
          ? `Request timed out after ${Math.round((['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase()) ? 20000 : 10000) / 1000)}s`
          : error instanceof Error
            ? error.message
            : 'Network error',
      };
    }
  }

  private async httpRequestDirect(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<{ ok: boolean; status: number; statusText: string; body: any }> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);
      let body: any = undefined;
      try {
        body = await resp.json();
      } catch {}
      return {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        body,
      };
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  /**
   * Authentication endpoints
   */
  async login(
    credentials: LoginRequest
  ): Promise<ApiResponse<{ user: UserData; auth: AuthData }>> {
    const response = await this.request<{
      user: UserData;
      token: string;
      refreshToken: string;
      expiresIn: number;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    console.log('RESPONSE', response);

    if (response.success && response.data) {
      const authData: AuthData = {
        jwtToken: response.data.token,
        refreshToken: response.data.refreshToken,
        expiresAt: Date.now() + response.data.expiresIn * 1000,
      };

      console.log('🔐 API Service: Storing auth data...', {
        hasToken: !!authData.jwtToken,
        hasRefresh: !!authData.refreshToken,
        expiresAt: authData.expiresAt
          ? new Date(authData.expiresAt).toISOString()
          : 'none',
      });

      // Store auth data
      try {
        await storageService.setAuth(authData);
        await storageService.setUser(response.data.user);
        // Write unified session
        await storageService.setSession({
          user: response.data.user,
          accessToken: authData.jwtToken || null,
          refreshToken: authData.refreshToken || null,
          expiresAt: authData.expiresAt || null,
        } as any);

        // Verify storage worked
        const storedAuth = await storageService.getAuth();
        const storedUser = await storageService.getUser();
        console.log('🔐 API Service: Verification after storage:', {
          authStored: !!storedAuth?.jwtToken,
          userStored: !!storedUser,
        });
      } catch (storageError) {
        console.error('🔐 API Service: Storage failed:', storageError);
      }

      return {
        success: true,
        data: {
          user: response.data.user,
          auth: authData,
        },
      };
    }

    return response as any;
  }

  async register(
    userData: RegisterRequest
  ): Promise<ApiResponse<{ user: UserData; auth: AuthData }>> {
    const response = await this.request<{
      user: UserData;
      token: string;
      refreshToken: string;
      expiresIn: number;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response.success && response.data) {
      const authData: AuthData = {
        jwtToken: response.data.token,
        refreshToken: response.data.refreshToken,
        expiresAt: Date.now() + response.data.expiresIn * 1000,
      };

      // Store auth data
      await storageService.setAuth(authData);
      await storageService.setUser(response.data.user);
      await storageService.setSession({
        user: response.data.user,
        accessToken: authData.jwtToken || null,
        refreshToken: authData.refreshToken || null,
        expiresAt: authData.expiresAt || null,
      } as any);

      return {
        success: true,
        data: {
          user: response.data.user,
          auth: authData,
        },
      };
    }

    return response as any;
  }

  async refreshToken(): Promise<ApiResponse<AuthData>> {
    const auth = await storageService.getAuth();
    if (!auth?.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    const response = await this.request<{
      token: string;
      refreshToken: string;
      expiresIn: number;
    }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });

    if (response.success && response.data) {
      const newAuthData: AuthData = {
        ...auth,
        jwtToken: response.data.token,
        refreshToken: response.data.refreshToken,
        expiresAt: Date.now() + response.data.expiresIn * 1000,
      };

      await storageService.setAuth(newAuthData);
      return { success: true, data: newAuthData };
    }

    return response as ApiResponse<AuthData>;
  }

  async logout(): Promise<ApiResponse<void>> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Continue with logout even if API call fails
    }

    // Clear local storage
    await storageService.remove('auth');
    await storageService.remove('user');
    try {
      await storageService.remove('session' as any);
    } catch {}

    return { success: true };
  }

  /**
   * User profile endpoints
   */
  async getProfile(): Promise<ApiResponse<UserData>> {
    return this.request<UserData>('/api/users/profile');
  }

  async updateProfile(
    updates: Partial<UserData>
  ): Promise<ApiResponse<UserData>> {
    const response = await this.request<UserData>('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (response.success && response.data) {
      await storageService.setUser(response.data);
    }

    return response;
  }

  /**
   * Project endpoints
   */
  async getProjects(): Promise<ApiResponse<Project[]>> {
    const response = await this.request<Project[]>('/api/projects');

    if (response.success && response.data) {
      // Cache projects
      await storageService.updateCache({
        projects: response.data,
        lastSync: Date.now(),
      });
    }

    return response;
  }

  async createProject(
    project: Omit<Project, 'id' | 'createdAt'>
  ): Promise<ApiResponse<Project>> {
    return this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async updateProject(
    id: string,
    updates: Partial<Project>
  ): Promise<ApiResponse<Project>> {
    return this.request<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProject(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * User endpoints
   */
  async getUsersInProject(
    projectId: string
  ): Promise<ApiResponse<GitLabUser[]>> {
    return this.request<GitLabUser[]>(`/api/projects/${projectId}/users`);
  }

  async getGitLabUsers(): Promise<ApiResponse<GitLabUser[]>> {
    return this.request<GitLabUser[]>('/api/integrations/gitlab/users');
  }

  /**
   * Issue endpoints
   */
  async createIssue(
    issueData: CreateIssueRequest
  ): Promise<ApiResponse<Issue>> {
    return this.request<Issue>('/api/issues', {
      method: 'POST',
      body: JSON.stringify(issueData),
    });
  }

  /**
   * Slack integrations
   */
  async getSlackChannels(): Promise<
    ApiResponse<{ id: string; name: string }[]>
  > {
    const res = await this.request<{ items: { id: string; name: string }[] }>(
      '/api/integrations/slack/channels'
    );
    if (res.success) {
      return { success: true, data: res.data?.items || [] } as any;
    }
    return res as any;
  }

  async getSlackUsers(): Promise<ApiResponse<{ id: string; name: string }[]>> {
    const res = await this.request<{ items: { id: string; name: string }[] }>(
      '/api/integrations/slack/users'
    );
    if (res.success) {
      return { success: true, data: res.data?.items || [] } as any;
    }
    return res as any;
  }

  async postSlackMessage(params: {
    channelId: string;
    text?: string;
    slackUserIds?: string[];
    threadTs?: string;
    blocks?: any[];
  }): Promise<ApiResponse<{ ts: string; channel: string }>> {
    return this.request<{ ts: string; channel: string }>(
      '/api/integrations/slack/post',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  }

  /**
   * Create GitLab issue directly
   */
  async createGitLabIssue(
    projectId: string | number,
    data: {
      title: string;
      description: string;
      childDescriptions?: string[];
      labels?: string[];
      assigneeIds?: number[];
      milestone_id?: number;
      due_date?: string;
      issueFormat?: string;
      weight?: number;
    },
    options?: { slackChannelId?: string; slackUserIds?: string[] }
  ): Promise<ApiResponse<{ issue: GitLabIssueDetail }>> {
    const res = await this.request<{ issue: GitLabIssueDetail }>(
      `/api/projects/${encodeURIComponent(String(projectId))}/gitlab/issues`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );

    // Optional Slack notify as a side-effect on success
    if (res.success && options?.slackChannelId) {
      try {
        const created = res.data?.issue as any;
        const title = created?.title || data.title;
        const webUrl: string | undefined = created?.web_url;
        const baseText = `Hey: ${title}${webUrl ? ' ' + webUrl : ''}`;
        await this.postSlackMessage({
          channelId: options.slackChannelId,
          text: baseText,
          slackUserIds: Array.isArray(options.slackUserIds)
            ? options.slackUserIds
            : [],
        });
      } catch (e) {
        console.warn('Slack notify (GitLab-direct) failed:', e);
      }
    }

    return res;
  }

  /**
   * GitLab issue checklist (parsed from description)
   */
  async getGitLabIssueChecklist(
    projectId: string | number,
    issueIid: number
  ): Promise<
    ApiResponse<{
      items: { text: string; checked: boolean; raw: string; line: number }[];
    }>
  > {
    return this.request<{
      items: { text: string; checked: boolean; raw: string; line: number }[];
    }>(`/api/projects/${projectId}/gitlab/issues/${issueIid}/checklist`);
  }

  async getIssues(projectId?: string): Promise<ApiResponse<Issue[]>> {
    const endpoint = projectId
      ? `/api/issues?projectId=${projectId}`
      : '/api/issues';
    return this.request<Issue[]>(endpoint);
  }

  async getIssue(id: string): Promise<ApiResponse<Issue>> {
    return this.request<Issue>(`/api/issues/${id}`);
  }

  /**
   * Optional batch fetch. Falls back to sequential getIssue on failure.
   */
  async getIssuesByIds(ids: string[]): Promise<ApiResponse<Issue[]>> {
    if (!ids || ids.length === 0) return { success: true, data: [] };
    // Try batch endpoint (two variants), then fallback
    const qs = encodeURIComponent(ids.join(','));
    const candidates = [`/api/issues?ids=${qs}`, `/api/issues/batch?ids=${qs}`];
    for (const endpoint of candidates) {
      try {
        const res = await this.request<any>(endpoint);
        if (res.success && res.data) {
          const items = (res.data.issues ||
            res.data.items ||
            res.data) as Issue[];
          if (Array.isArray(items)) return { success: true, data: items };
        }
      } catch (e) {
        // ignore and fallback
      }
    }
    // Fallback: sequential fetches
    const results: Issue[] = [];
    for (const id of ids) {
      const r = await this.getIssue(id);
      if (r.success && r.data) results.push(r.data);
    }
    return { success: true, data: results };
  }

  async updateIssue(
    id: string,
    updates: Partial<Issue>
  ): Promise<ApiResponse<Issue>> {
    return this.request<Issue>(`/api/issues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteIssue(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/issues/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * List issues with filters and cursor-based pagination for infinite scroll
   */
  async listIssues(
    params: ListIssuesParams = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    // Map extension params to backend expectations
    const user = await storageService.getUser();

    const page = params.cursor ? parseInt(params.cursor as string, 10) || 1 : 1;
    const limit = params.limit ?? 5;

    const query = new URLSearchParams();
    if (params.search) query.set('query', params.search);
    if (params.projectId) query.set('projectId', params.projectId);
    if (params.assigneeId && params.assigneeId !== 'unassigned')
      query.set('assigneeId', params.assigneeId);
    if (params.createdBy && params.createdBy !== 'any') {
      const createdBy = params.createdBy === 'me' ? user?.id : params.createdBy;
      if (createdBy) query.set('createdBy', createdBy as string);
    }
    // Only pass status if it matches backend allowed values
    if (params.status) query.set('status', params.status);
    // Sorting
    const sortBy = 'created_at';
    const sortOrder = params.sort === 'oldest' ? 'asc' : 'desc';
    query.set('sortBy', sortBy);
    query.set('sortOrder', sortOrder);
    // Pagination
    query.set('page', String(page));
    query.set('limit', String(limit));

    const endpoint = `/api/issues?${query.toString()}`;
    const res = await this.request<any>(endpoint);
    if (!res.success || !res.data)
      return res as ApiResponse<ListIssuesResponse>;

    // Backend returns { issues, pagination }
    if (res.data.issues && res.data.pagination) {
      const issues = res.data.issues as any[];
      const mapped: IssueListItem[] = issues.map(it => ({
        id: it.id,
        number: it.gitlab_issue_iid || it.gitlabIssueIid || undefined,
        title: it.title,
        project: { id: it.project_id, name: it.project_name || 'Project' },
        labels: Array.isArray(it.labels) ? it.labels : [],
        assignee: it.assignee
          ? {
              id: it.assignee.id,
              name: it.assignee.full_name || it.assignee.username || 'Assignee',
              avatarUrl: it.assignee.avatar_url,
              username: it.assignee.username,
            }
          : null,
        author: it.creator
          ? {
              id: it.creator.id,
              name: it.creator.full_name || it.creator.username || 'Author',
              username: it.creator.username,
            }
          : { id: it.user_id, name: 'Author' },
        createdAt: it.created_at || it.createdAt,
      }));

      const p = res.data.pagination;
      const hasMore = p.page * p.limit < p.total;
      const nextCursor = hasMore ? String(p.page + 1) : null;
      return { success: true, data: { items: mapped, nextCursor } };
    }

    // Legacy array response fallback
    const raw = res.data;
    const normalized: ListIssuesResponse = Array.isArray(raw)
      ? { items: raw, nextCursor: null }
      : raw;
    return { success: true, data: normalized };
  }

  /**
   * List GitLab issues for a specific project (proxy endpoint)
   */
  async listGitLabIssues(
    projectId: string,
    params: ListIssuesParams = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.labels && params.labels.length)
      query.set('labels', params.labels.join(','));
    if (params.assigneeId) query.set('assigneeId', params.assigneeId);
    if (params.createdBy) query.set('createdBy', params.createdBy);
    if (params.cursor)
      query.set('page', String(parseInt(String(params.cursor)) || 1));
    if (params.limit) query.set('limit', String(params.limit));
    // Map sort to state if needed; default 'opened'
    const endpoint = `/api/projects/${encodeURIComponent(projectId)}/gitlab/issues?${query.toString()}`;
    const res = await this.request<ListIssuesResponse>(endpoint);
    if (!res.success || !res.data)
      return res as ApiResponse<ListIssuesResponse>;
    return res;
  }

  async listGitLabIssuesGlobal(
    params: ListIssuesParams = {}
  ): Promise<ApiResponse<ListIssuesResponse>> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.labels && params.labels.length)
      query.set('labels', params.labels.join(','));
    if (params.assigneeId) query.set('assigneeId', params.assigneeId);
    if (params.createdBy) query.set('createdBy', params.createdBy);
    if (params.cursor)
      query.set('page', String(parseInt(String(params.cursor)) || 1));
    if (params.limit) query.set('limit', String(params.limit));
    const endpoint = `/api/projects/gitlab/issues?${query.toString()}`;
    const res = await this.request<ListIssuesResponse>(endpoint);
    return res as ApiResponse<ListIssuesResponse>;
  }

  async getGitLabIssue(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    const endpoint = `/api/projects/${encodeURIComponent(String(projectId))}/gitlab/issues/${issueIid}`;
    return this.request<GitLabIssueDetail>(endpoint);
  }

  async updateGitLabIssue(
    projectId: string | number,
    issueIid: number,
    payload: {
      state?: 'close' | 'reopen';
      assigneeId?: number | 'me' | null;
      labels?: string[];
      addLabels?: string[];
      removeLabels?: string[];
    }
  ): Promise<ApiResponse<GitLabIssueDetail>> {
    const endpoint = `/api/projects/${encodeURIComponent(String(projectId))}/gitlab/issues/${issueIid}`;
    return this.request<GitLabIssueDetail>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async getGitLabProjectLabels(projectId: string | number): Promise<
    ApiResponse<{
      items: {
        id: number;
        name: string;
        color: string;
        text_color?: string;
        description?: string;
      }[];
    }>
  > {
    const endpoint = `/api/projects/${encodeURIComponent(String(projectId))}/gitlab/labels`;
    const res = await this.request<any>(endpoint);
    if (!res.success) return res as any;
    // Unwrap sendResponse payload shape if present
    const payload =
      res.data && (res.data as any).data ? (res.data as any).data : res.data;
    return { success: true, data: payload };
  }

  async getGitLabIssueNotes(
    projectId: string | number,
    issueIid: number
  ): Promise<ApiResponse<{ items: GitLabIssueNote[] }>> {
    const endpoint = `/api/projects/${encodeURIComponent(String(projectId))}/gitlab/issues/${issueIid}/notes`;
    return this.request<{ items: GitLabIssueNote[] }>(endpoint);
  }

  /**
   * AI-powered issue creation
   */
  async generateIssueFromContext(context: {
    url: string;
    title: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    errorDetails?: {
      message: string;
      stack?: string;
      type: string;
    };
    userDescription?: string;
    reproductionSteps?: string[];
    screenshots?: string[];
    consoleErrors?: string[];
    networkErrors?: string[];
    expectedBehavior?: string;
    actualBehavior?: string;
    elementInfo?: any;
  }): Promise<
    ApiResponse<{
      title: string;
      description: string;
      acceptanceCriteria: string[];
      severity: 'critical' | 'high' | 'medium' | 'low';
      priority: 'urgent' | 'high' | 'normal' | 'low';
      labels: string[];
      estimatedEffort?: string;
      affectedComponents?: string[];
    }>
  > {
    const raw = await this.request<any>('/api/issues/generate-from-context', {
      method: 'POST',
      body: JSON.stringify(context),
    });
    if (raw.success && raw.data && raw.data.issue) {
      return { success: true, data: raw.data.issue };
    }
    return raw as any;
  }

  /**
   * Get AI suggestions for an issue
   */
  async getAISuggestions(issueId: string): Promise<
    ApiResponse<{
      improvedDescription: string;
      acceptanceCriteria: string[];
      classification?: {
        severity: 'critical' | 'high' | 'medium' | 'low';
        priority: 'urgent' | 'high' | 'normal' | 'low';
        confidence: number;
        reasoning: string;
      };
    }>
  > {
    return this.request(`/api/issues/${issueId}/ai-suggestions`, {
      method: 'POST',
    });
  }

  /**
   * Legacy transcription method for backward compatibility
   */
  async _legacyTranscribeVoice(
    request: VoiceTranscriptionRequest
  ): Promise<ApiResponse<{ text: string }>> {
    const formData = new FormData();
    formData.append('audio', request.audioBlob);
    if (request.language) {
      formData.append('language', request.language);
    }

    try {
      const headers = await this.getAuthHeaders();
      delete (headers as any)['Content-Type']; // Let browser set content-type for FormData

      const response = await fetch(`${this.baseUrl}/api/ai/transcribe`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error:
            data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data: data.data !== undefined ? data.data : data,
      };
    } catch (error) {
      console.error('Voice transcription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Integration endpoints
   */
  async getSlackConnectUrl(): Promise<ApiResponse<{ url: string }>> {
    return this.request<{ url: string }>('/api/integrations/slack/connect');
  }

  async connectGitLab(token: string): Promise<ApiResponse<void>> {
    const response = await this.request<void>(
      '/api/integrations/gitlab/connect',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );

    if (response.success) {
      // Update stored auth data
      const auth = await storageService.getAuth();
      if (auth) {
        auth.gitlabToken = token;
        await storageService.setAuth(auth);
      }
    }

    return response;
  }

  async connectSlack(token: string): Promise<ApiResponse<void>> {
    const response = await this.request<void>(
      '/api/integrations/slack/connect',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );

    if (response.success) {
      // Update stored auth data
      const auth = await storageService.getAuth();
      if (auth) {
        auth.slackToken = token;
        await storageService.setAuth(auth);
      }
    }

    return response;
  }

  async disconnectGitLab(): Promise<ApiResponse<void>> {
    const response = await this.request<void>(
      '/api/integrations/gitlab/disconnect',
      {
        method: 'POST',
      }
    );

    if (response.success) {
      const auth = await storageService.getAuth();
      if (auth) {
        delete auth.gitlabToken;
        await storageService.setAuth(auth);
      }
    }

    return response;
  }

  async disconnectSlack(): Promise<ApiResponse<void>> {
    const response = await this.request<void>(
      '/api/integrations/slack/disconnect',
      {
        method: 'POST',
      }
    );

    if (response.success) {
      const auth = await storageService.getAuth();
      if (auth) {
        delete auth.slackToken;
        await storageService.setAuth(auth);
      }
    }

    return response;
  }

  /**
   * File upload
   */
  async uploadFile(
    file: File,
    purpose: 'screenshot' | 'attachment'
  ): Promise<ApiResponse<{ url: string; id: string }>> {
    try {
      // Route via background to avoid CORS and let SW attach Authorization
      // To avoid structured clone issues across runtime messaging, send as data URL
      const fileAsDataUrl = await (async () => {
        try {
          if (!file) return null;
          const buf = await file.arrayBuffer();
          // Convert to base64 data URL
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i++)
            bin += String.fromCharCode(bytes[i]);
          const b64 = btoa(bin);
          const mime = file.type || 'application/octet-stream';
          return `data:${mime};base64,${b64}`;
        } catch {
          return null;
        }
      })();
      const result = await new Promise<
        ApiResponse<{ url: string; id: string }>
      >(resolve => {
        try {
          chrome.runtime.sendMessage(
            {
              type: MessageType.FILE_UPLOAD,
              data: {
                url: `${this.baseUrl}/api/files/upload`,
                file: (fileAsDataUrl || file) as any,
                purpose,
                filename: (file && (file as any).name) || undefined,
              },
            },
            reply => {
              const err = chrome.runtime.lastError;
              if (err)
                return resolve({
                  success: false,
                  error: String(err.message || err),
                });
              resolve(
                (reply as any) || { success: false, error: 'No response' }
              );
            }
          );
        } catch (e: any) {
          resolve({
            success: false,
            error: e?.message || 'Background not reachable',
          });
        }
      });
      return result;
    } catch (error) {
      console.error('File upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Voice transcription (background, avoids CORS)
   */
  async transcribeVoice(
    req: VoiceTranscriptionRequest
  ): Promise<ApiResponse<any>> {
    if (!req?.audioBlob) return { success: false, error: 'Missing audio blob' };
    try {
      const result = await new Promise<ApiResponse<any>>(resolve => {
        try {
          chrome.runtime.sendMessage(
            {
              type: MessageType.AI_TRANSCRIBE,
              data: {
                url: `${this.baseUrl}/api/ai/transcribe`,
                audioBlob: req.audioBlob,
                language: req.language,
              },
            },
            reply => {
              const err = chrome.runtime.lastError;
              if (err)
                return resolve({
                  success: false,
                  error: String(err.message || err),
                });
              resolve(
                (reply as any) || { success: false, error: 'No response' }
              );
            }
          );
        } catch (e: any) {
          resolve({
            success: false,
            error: e?.message || 'Background not reachable',
          });
        }
      });
      return result;
    } catch (error) {
      console.error('Voice transcription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * WebSocket connection for real-time updates
   */
  connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      if (
        this.wsConnection &&
        this.wsConnection.readyState === WebSocket.OPEN
      ) {
        resolve(this.wsConnection);
        return;
      }

      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.log('WebSocket connected');
        resolve(this.wsConnection!);
      };

      this.wsConnection.onerror = error => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        this.wsConnection = null;
      };

      // Set up automatic reconnection
      this.wsConnection.onclose = () => {
        setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          this.connectWebSocket().catch(console.error);
        }, 5000);
      };
    });
  }

  disconnectWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * GitLab OAuth URL
   */
  async getGitLabOAuthUrl(): Promise<ApiResponse<{ authUrl: string }>> {
    return this.request<{ authUrl: string }>('/api/auth/gitlab');
  }

  /**
   * GitLab OAuth URL with session ID
   */
  async getGitLabOAuthUrlWithSession(
    sessionId: string
  ): Promise<ApiResponse<{ authUrl: string; sessionId: string }>> {
    return this.request<{ authUrl: string; sessionId: string }>(
      `/api/auth/gitlab?sessionId=${encodeURIComponent(sessionId)}`
    );
  }

  /**
   * Get OAuth session data
   */
  async getOAuthSession(sessionId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/auth/oauth/session/${sessionId}`);
  }

  /**
   * Generate an issue description using the server-side template + AI
   */
  async generateDescriptionFromTemplate({
    userDescription,
    issueFormat,
  }: {
    userDescription: string;
    issueFormat: string;
  }): Promise<ApiResponse<{ description: string }>> {
    return this.request<{ description: string }>(
      `/api/issues/generate-from-template`,
      {
        method: 'POST',
        body: JSON.stringify({ userDescription, issueFormat }),
      }
    );
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<
    ApiResponse<{ status: string; version: string }>
  > {
    try {
      return this.request<{ status: string; version: string }>('/health');
    } catch (error) {
      // If health check fails, still allow the extension to work
      console.warn('Health check failed, continuing anyway:', error);
      return {
        success: true,
        data: { status: 'unknown', version: '1.0.0' },
      };
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
