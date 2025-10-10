import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';
import { RedisService, redisService } from './redis';
import { CustomError } from '../middleware/errorHandler';

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  avatar_url: string;
  default_branch: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  labels: string[];
  assignees: GitLabUser[];
  author: GitLabUser;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  text: string;
  checked: boolean;
  raw: string;
  line: number;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
  avatar_url: string;
  web_url: string;
}

export interface GitLabLabel {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  description?: string;
}

export interface CreateIssueData {
  title: string;
  description: string;
  labels?: string[];
  assignee_ids?: number[];
  milestone_id?: number;
  due_date?: string;
  weight?: number;
}

export class GitLabService {
  private client: AxiosInstance;
  private redis: RedisService;
  private baseUrl: string;

  constructor(accessToken?: string, baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.GITLAB_BASE_URL || 'https://gitlab.com';
    this.redis = redisService;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v4`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging and rate limiting
    this.client.interceptors.request.use(
      async config => {
        // Add request ID for tracking
        config.headers['X-Request-ID'] = this.generateRequestId();
        // Local rate limiting removed; rely on GitLab's upstream limits.
        logger.debug(
          `GitLab API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      error => {
        logger.error('GitLab API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and caching
    this.client.interceptors.response.use(
      response => {
        logger.debug(
          `GitLab API Response: ${response.status} ${response.config.url}`
        );

        // Cache GET responses
        if (response.config.method === 'get' && response.status === 200) {
          this.cacheResponse(response.config.url!, response.data);
        }

        return response;
      },
      async error => {
        logger.error('GitLab API Response Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          data: error.response?.data,
        });

        // Handle upstream GitLab rate limiting gracefully
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          logger.warn(`GitLab API rate limited. Retrying after ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          return this.client.request(error.config);
        }

        // Handle token expiration
        if (error.response?.status === 401) {
          logger.warn(
            'GitLab API authentication failed - attempting token refresh'
          );
          try {
            await this.refreshAccessToken();
            // Retry the original request with the new token
            return this.client.request(error.config);
          } catch (refreshError) {
            logger.error('Token refresh failed:', refreshError);
            // Token refresh failed, user needs to re-authenticate
          }
        }

        return Promise.reject(error);
      }
    );
  }

  public async authenticate(accessToken: string): Promise<GitLabUser> {
    this.client.defaults.headers['Authorization'] = `Bearer ${accessToken}`;

    try {
      const response = await this.client.get('/user');
      const user = response.data;

      // Cache user info
      await this.redis.set(`gitlab_user:${user.id}`, user, 3600);

      logger.info(
        `GitLab authentication successful for user: ${user.username}`
      );
      return user;
    } catch (error) {
      logger.error('GitLab authentication failed:', error);
      throw new Error('Failed to authenticate with GitLab');
    }
  }

  public async getProjects(
    options: {
      owned?: boolean;
      membership?: boolean;
      starred?: boolean;
      search?: string;
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitLabProject[]> {
    try {
      const params = {
        per_page: options.per_page || 20,
        page: options.page || 1,
        ...options,
      };

      const cacheKey = `gitlab_projects:${JSON.stringify(params)}`;

      // Check cache first (if Redis is available)
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (error) {
        logger.debug(
          'Cache lookup failed, proceeding without cache:',
          (error as Error).message
        );
      }

      const response = await this.client.get('/projects', { params });
      const projects = response.data;

      // Cache for 5 minutes (if Redis is available)
      try {
        await this.redis.set(cacheKey, projects, 300);
      } catch (error) {
        logger.debug(
          'Cache storage failed, continuing without cache:',
          (error as Error).message
        );
      }

      return projects;
    } catch (error: any) {
      logger.error('Failed to fetch GitLab projects:', error);

      // Provide more specific error information
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;

        if (status === 401) {
          throw new Error(
            'GitLab authentication failed. Please reconnect your GitLab account.'
          );
        } else if (status === 403) {
          throw new Error(
            'GitLab access forbidden. Check your account permissions.'
          );
        } else if (status === 404) {
          throw new Error(
            'GitLab API endpoint not found. Check your GitLab configuration.'
          );
        } else if (status === 429) {
          throw new Error(
            'GitLab API rate limit exceeded. Please try again later.'
          );
        } else {
          throw new Error(
            `GitLab API error (${status} ${statusText}): ${errorData?.message || errorData?.error || 'Unknown error'}`
          );
        }
      } else if (error.request) {
        throw new Error(
          'Failed to connect to GitLab API. Check your network connection and GitLab configuration.'
        );
      } else {
        throw new Error(`GitLab service error: ${error.message}`);
      }
    }
  }

  public async getProject(projectId: string | number): Promise<GitLabProject> {
    try {
      const cacheKey = `gitlab_project:${projectId}`;

      // Check cache first
      const cached = await this.safeRedisGet<GitLabProject>(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.client.get(`/projects/${projectId}`);
      const project = response.data;

      // Cache for 10 minutes
      await this.safeRedisSet(cacheKey, project, 600);

      return project;
    } catch (error) {
      logger.error(`Failed to fetch GitLab project ${projectId}:`, error);
      throw new Error('Failed to fetch project from GitLab');
    }
  }

  public async createIssue(
    projectId: string | number,
    issueData: CreateIssueData
  ): Promise<GitLabIssue> {
    try {
      const pid = this.normalizeProjectId(projectId);
      const response = await this.client.post(
        `/projects/${pid}/issues`,
        issueData
      );
      const issue = response.data;

      logger.info(`Created GitLab issue: ${issue.web_url}`);

      // Invalidate project issues cache
      await this.invalidateCache(`gitlab_issues:${projectId}:*`);

      return issue;
    } catch (error) {
      const status = (error as any)?.response?.status;
      const statusText = (error as any)?.response?.statusText;
      const data = (error as any)?.response?.data;
      logger.error('Failed to create GitLab issue:', {
        status,
        statusText,
        data,
      });
      const message =
        data?.message ||
        data?.error ||
        `GitLab API error${status ? ` (${status} ${statusText || ''})` : ''}`;
      throw new CustomError(
        message || 'Failed to create issue in GitLab',
        status || 502,
        'GITLAB_API_ERROR',
        data
      );
    }
  }

  public async updateIssue(
    projectId: string | number,
    issueIid: number,
    updateData: Partial<CreateIssueData> & {
      state_event?: 'close' | 'reopen';
      labels?: string[];
      assignee_ids?: number[];
      assignee_id?: number;
      add_labels?: string;
      remove_labels?: string;
    }
  ): Promise<GitLabIssue> {
    try {
      const pid = this.normalizeProjectId(projectId);
      const payload: any = { ...updateData };
      // Normalize labels to comma-separated string if array is provided (GitLab accepts either, but normalize for safety)
      if (Array.isArray(payload.labels)) {
        payload.labels = payload.labels.join(',');
      }
      const response = await this.client.put(
        `/projects/${pid}/issues/${issueIid}`,
        payload
      );
      const issue = response.data;

      logger.info(`Updated GitLab issue: ${issue.web_url}`);

      // Invalidate caches
      await this.invalidateCache(`gitlab_issues:${projectId}:*`);
      await this.invalidateCache(`gitlab_issue:${pid}:${issueIid}`);
      if (String(projectId) !== pid) {
        await this.invalidateCache(`gitlab_issue:${projectId}:${issueIid}`);
      }

      return issue;
    } catch (error) {
      logger.error('Failed to update GitLab issue:', error);
      throw new Error('Failed to update issue in GitLab');
    }
  }

  public async getIssues(
    projectId: string | number,
    options: {
      state?: 'opened' | 'closed' | 'all';
      labels?: string;
      milestone?: string;
      assignee_id?: number;
      author_id?: number;
      search?: string;
      per_page?: number;
      page?: number;
    } = {}
  ): Promise<GitLabIssue[]> {
    try {
      const params = {
        per_page: options.per_page || 20,
        page: options.page || 1,
        ...options,
      };

      const cacheKey = `gitlab_issues:${projectId}:${JSON.stringify(params)}`;

      // Check cache first
      const cached = await this.safeRedisGet<GitLabIssue[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.client.get(`/projects/${projectId}/issues`, {
        params,
      });
      const issues = response.data;

      // Cache for 2 minutes
      await this.safeRedisSet(cacheKey, issues, 120);

      return issues;
    } catch (error) {
      logger.error('Failed to fetch GitLab issues:', error);
      throw new Error('Failed to fetch issues from GitLab');
    }
  }

  public async getAllIssues(
    options: {
      state?: 'opened' | 'closed' | 'all';
      labels?: string;
      milestone?: string;
      assignee_id?: number;
      author_id?: number;
      search?: string;
      scope?: 'created_by_me' | 'assigned_to_me' | 'all';
      per_page?: number;
      page?: number;
      project_ids?: Array<number | string>;
      labels_match_mode?: 'and' | 'or';
    } = {}
  ): Promise<GitLabIssue[]> {
    try {
      const params: Record<string, any> = {
        state: options.state || 'opened',
        per_page: options.per_page || 20,
        page: options.page || 1,
        order_by: 'updated_at',
        sort: 'desc',
      };

      // Add optional filters
      if (options.labels) params.labels = options.labels;
      if (options.milestone) params.milestone = options.milestone;
      if (options.assignee_id) params.assignee_id = options.assignee_id;
      if (options.author_id) params.author_id = options.author_id;
      if (options.search) params.search = options.search;
      if (options.scope) params.scope = options.scope;
      if (options.project_ids && options.project_ids.length === 1) {
        params.project_id = options.project_ids[0];
      }

      const cacheKey = `gitlab_global_issues:${JSON.stringify({
        ...params,
        project_ids: options.project_ids || [],
        labels_match_mode: options.labels_match_mode || 'and',
      })}`;

      // Check cache first
      const cached = await this.safeRedisGet<GitLabIssue[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Use GitLab's global issues API - much more efficient
      const response = await this.client.get('/issues', { params });
      const issues = response.data as GitLabIssue[];

      // Filter by project_ids if specified
      let filteredIssues = issues;
      if (options.project_ids && options.project_ids.length > 0) {
        const projectIdSet = new Set(options.project_ids.map(id => Number(id)));
        filteredIssues = issues.filter(issue => projectIdSet.has(issue.project_id));
      }

      // Handle OR logic for labels if needed
      if (options.labels && options.labels_match_mode === 'or') {
        const labelList = options.labels.split(',').map(l => l.trim()).filter(Boolean);
        filteredIssues = filteredIssues.filter(issue =>
          labelList.some(label => issue.labels.includes(label))
        );
      }

      // Cache for 2 minutes
      await this.safeRedisSet(cacheKey, filteredIssues, 120);

      return filteredIssues;
    } catch (error) {
      logger.error('Failed to fetch GitLab issues via global API:', error);
      throw new Error('Failed to fetch issues from GitLab');
    }
  }

  // List all accessible project IDs for the authenticated user
  private async listAllAccessibleProjectIds(): Promise<number[]> {
    const perPage = 100;
    let page = 1;
    const ids: number[] = [];
    try {
      // membership=true returns projects the user is a member of
      // simple=true reduces payload
      while (true) {
        const resp = await this.client.get('/projects', {
          params: {
            membership: true,
            simple: true,
            per_page: perPage,
            page,
            order_by: 'last_activity_at',
            sort: 'desc',
          },
        });
        const projects = resp.data as Array<{ id: number }>;
        for (const p of projects) {
          if (p && typeof p.id === 'number') ids.push(p.id);
        }
        const next = resp.headers && resp.headers['x-next-page'] ? parseInt(resp.headers['x-next-page'] as any, 10) : null;
        if (!next) break;
        page = next;
      }
      return ids;
    } catch (error) {
      logger.error('Failed to list accessible GitLab projects:', error);
      throw new Error('Failed to list accessible GitLab projects');
    }
  }

  public async getIssue(
    projectId: string | number,
    issueIid: number
  ): Promise<GitLabIssue> {
    const pid = this.normalizeProjectId(projectId);
    try {
      const cacheKey = `gitlab_issue:${pid}:${issueIid}`;

      // Check cache first
      const cached = await this.safeRedisGet<GitLabIssue>(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.client.get(
        `/projects/${pid}/issues/${issueIid}`
      );

      const issue = response.data;

      // Cache for 5 minutes
      await this.safeRedisSet(cacheKey, issue, 300);

      return issue;
    } catch (error: any) {
      const status = error?.response?.status;
      const statusText = error?.response?.statusText;
      const data = error?.response?.data;
      logger.error(`Failed to fetch GitLab issue ${pid}:${issueIid}:`, {
        status,
        statusText,
        data,
      });

      // Fallback: try list endpoint with iids[] to locate the issue
      try {
        const listResp = await this.client.get(`/projects/${pid}/issues`, {
          params: { iids: [issueIid] },
        });
        if (Array.isArray(listResp.data) && listResp.data.length === 1) {
          const fallbackIssue = listResp.data[0];
          // Cache and return
          await this.safeRedisSet(
            `gitlab_issue:${pid}:${issueIid}`,
            fallbackIssue,
            300
          );
          return fallbackIssue;
        }
      } catch (fallbackErr) {
        logger.error('Fallback issues search failed', {
          status: (fallbackErr as any)?.response?.status,
          data: (fallbackErr as any)?.response?.data,
        });
      }

      if (status === 404) {
        throw new Error('GitLab issue not found or inaccessible');
      }
      if (status === 401) {
        throw new Error('GitLab authentication failed while fetching issue');
      }
      if (status === 403) {
        throw new Error('GitLab access forbidden for this issue');
      }
      throw new Error(
        `Failed to fetch issue from GitLab${status ? ` (${status} ${statusText || ''})` : ''}`
      );
    }
  }

  public async getIssueNotes(
    projectId: string | number,
    issueIid: number
  ): Promise<any[]> {
    const pid = this.normalizeProjectId(projectId);
    const urlPath = `/projects/${pid}/issues/${issueIid}/notes`;
    try {
      const response = await this.client.get(urlPath, {
        params: { per_page: 50 },
      });
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const statusText = error?.response?.statusText;
      const data = error?.response?.data;
      logger.error(`Failed to fetch GitLab issue notes ${pid}:${issueIid}:`, {
        status,
        statusText,
        data,
      });
      if (status === 404) {
        throw new Error('GitLab issue notes not found or inaccessible');
      }
      if (status === 401) {
        throw new Error('GitLab authentication failed while fetching notes');
      }
      if (status === 403) {
        throw new Error('GitLab access forbidden for notes');
      }
      throw new Error(
        `Failed to fetch issue notes from GitLab${status ? ` (${status} ${statusText || ''})` : ''}`
      );
    }
  }

  public async getProjectLabels(
    projectId: string | number
  ): Promise<GitLabLabel[]> {
    const pid = this.normalizeProjectId(projectId);
    try {
      const cacheKey = `gitlab_labels:${pid}`;
      try {
        const cached = await this.safeRedisGet<GitLabLabel[]>(cacheKey);
        if (cached) return cached;
      } catch (_) {}

      const response = await this.client.get(`/projects/${pid}/labels`, {
        params: { per_page: 100 },
      });
      const labels = response.data as GitLabLabel[];
      try {
        await this.safeRedisSet(cacheKey, labels, 300);
      } catch (_) {}
      return labels;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      logger.error(`Failed to fetch GitLab labels ${pid}:`, { status, data });
      throw new Error('Failed to fetch project labels from GitLab');
    }
  }

  public async batchFetchProjectLabels(
    projectIds: Array<number | string>
  ): Promise<Map<number | string, GitLabLabel[]>> {
    const labelsMap = new Map<number | string, GitLabLabel[]>();

    if (projectIds.length === 0) {
      return labelsMap;
    }

    // Batch size for concurrent requests
    const batchSize = 8;
    const batches = [];

    for (let i = 0; i < projectIds.length; i += batchSize) {
      batches.push(projectIds.slice(i, i + batchSize));
    }

    try {
      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(async projectId => {
            try {
              const labels = await this.getProjectLabels(projectId);
              return { projectId, labels };
            } catch (error) {
              logger.warn(`Failed to fetch labels for project ${projectId}:`, error);
              return { projectId, labels: [] as GitLabLabel[] };
            }
          })
        );

        // Process batch results
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            const { projectId, labels } = result.value;
            labelsMap.set(projectId, labels);
          }
        });
      }

      return labelsMap;
    } catch (error) {
      logger.error('Failed to batch fetch project labels:', error);
      // Return partial results instead of failing completely
      return labelsMap;
    }
  }

  /**
   * Extract Markdown checklist items (GitLab task list) from an issue description.
   * Supports lines like: "- [ ] task" or "* [x] done" or "1. [X] item" (case-insensitive).
   */
  public parseChecklistFromDescription(
    description: string | null | undefined
  ): ChecklistItem[] {
    if (!description) return [];
    const lines = description.split(/\r?\n/);
    const items: ChecklistItem[] = [];

    const checkboxRe = /^\s*(?:[-*+]|\d+[.)])?\s*\[( |x|X)\]\s+(.*\S.*)$/;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const m = raw.match(checkboxRe);
      if (m) {
        const checked = m[1].toLowerCase() === 'x';
        const text = m[2].trim();
        items.push({ text, checked, raw, line: i + 1 });
      }
    }
    return items;
  }

  /**
   * Convenience method: fetch an issue and return only checklist items from its description.
   */
  public async getIssueChecklist(
    projectId: string | number,
    issueIid: number
  ): Promise<ChecklistItem[]> {
    const issue = await this.getIssue(projectId, issueIid);
    return this.parseChecklistFromDescription(issue.description);
  }

  public async addIssueComment(
    projectId: string | number,
    issueIid: number,
    body: string
  ): Promise<any> {
    try {
      const pid = this.normalizeProjectId(projectId);
      const urlPath = `/projects/${pid}/issues/${issueIid}/notes`;
      const response = await this.client.post(urlPath, {
        body,
      });

      logger.info(`Added comment to GitLab issue ${projectId}:${issueIid}`);

      // Invalidate issue cache (support both raw and normalized keys)
      await this.invalidateCache(`gitlab_issue:${pid}:${issueIid}`);
      if (String(projectId) !== pid) {
        await this.invalidateCache(`gitlab_issue:${projectId}:${issueIid}`);
      }
      await this.invalidateCache(`gitlab_cache:${urlPath}`);

      return response.data;
    } catch (error) {
      logger.error('Failed to add GitLab issue comment:', error);
      throw new Error('Failed to add comment to GitLab issue');
    }
  }

  public async getProjectMembers(
    projectId: string | number
  ): Promise<GitLabUser[]> {
    try {
      const cacheKey = `gitlab_members:${projectId}`;

      // Check cache first (if Redis is available)
      try {
        const cached = await this.safeRedisGet<GitLabUser[]>(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (error) {
        logger.debug(
          'Cache lookup failed, proceeding without cache:',
          (error as Error).message
        );
      }

      const response = await this.client.get(
        `/projects/${projectId}/members/all`
      );
      const members = response.data;

      // Cache for 15 minutes (if Redis is available)
      try {
        await this.safeRedisSet(cacheKey, members, 900);
      } catch (error) {
        logger.debug(
          'Cache storage failed, continuing without cache:',
          (error as Error).message
        );
      }

      return members;
    } catch (error: any) {
      logger.error('Failed to fetch GitLab project members:', error);

      // Provide more specific error information
      if (error.response) {
        const status = error.response.status;
        const statusText = error.response.statusText;
        const errorData = error.response.data;

        if (status === 401) {
          throw new Error(
            'GitLab authentication failed. Please reconnect your GitLab account.'
          );
        } else if (status === 403) {
          throw new Error(
            'GitLab access forbidden. Check your account permissions.'
          );
        } else if (status === 404) {
          throw new Error(
            'GitLab project not found or no access to project members.'
          );
        } else if (status === 429) {
          throw new Error(
            'GitLab API rate limit exceeded. Please try again later.'
          );
        } else {
          throw new Error(
            `GitLab API error (${status} ${statusText}): ${errorData?.message || errorData?.error || 'Unknown error'}`
          );
        }
      } else if (error.request) {
        throw new Error(
          'Failed to connect to GitLab API. Check your network connection and GitLab configuration.'
        );
      } else {
        throw new Error(`GitLab service error: ${error.message}`);
      }
    }
  }

  public async uploadFile(
    projectId: string | number,
    file: Buffer,
    filename: string
  ): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([file]), filename);

      const pid = this.normalizeProjectId(projectId);
      const response = await this.client.post(
        `/projects/${pid}/uploads`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const uploadData = response.data;
      return `${this.baseUrl}${uploadData.full_path}`;
    } catch (error) {
      logger.error('Failed to upload file to GitLab:', error);
      throw new Error('Failed to upload file to GitLab');
    }
  }

  private normalizeProjectId(projectId: string | number): string {
    const value = String(projectId);
    return /^\d+$/.test(value) ? value : encodeURIComponent(value);
  }

  private async cacheResponse(url: string, data: any): Promise<void> {
    try {
      const cacheKey = `gitlab_cache:${url}`;
      await this.safeRedisSet(cacheKey, data, 300); // 5 minutes default
    } catch (error) {
      logger.warn('Failed to cache GitLab response:', error);
    }
  }

  private async safeRedisGet<T>(key: string): Promise<T | null> {
    if (!this.redis.isAvailable()) {
      return null;
    }
    try {
      return (await this.redis.get(key)) as T;
    } catch (error) {
      logger.debug('GitLab cache get skipped:', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private async safeRedisSet(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.redis.isAvailable()) {
      return;
    }
    try {
      await this.redis.set(key, value, ttl);
    } catch (error) {
      logger.debug('GitLab cache set skipped:', {
        key,
        error: (error as Error).message,
      });
    }
  }

  private async invalidateCache(pattern: string): Promise<void> {
    try {
      if (!this.redis.isAvailable()) {
        logger.debug('Redis not available, skipping cache invalidation');
        return;
      }

      const patterns = new Set<string>([pattern]);
      // If the caller passed an exact key (no wildcard), attempt a prefix match as well
      if (!pattern.includes('*')) {
        patterns.add(`${pattern}*`);
      }

      for (const pat of patterns) {
        const keys = await this.redis.keys(pat);
        if (!keys || keys.length === 0) {
          continue;
        }
        await Promise.all(keys.map((key: string) => this.redis.del(key)));
        logger.debug(
          `Invalidated ${keys.length} GitLab cache entr${keys.length === 1 ? 'y' : 'ies'} for pattern ${pat}`
        );
      }
    } catch (error) {
      logger.warn('Failed to invalidate GitLab cache:', error);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Webhook validation
  public validateWebhook(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // OAuth methods
  public getAuthUrl(state?: string): string {
    const clientId = process.env.GITLAB_CLIENT_ID;
    const redirectUri = process.env.GITLAB_REDIRECT_URI;
    // Request write-capable scope for creating issues. Allow override via env.
    const scope = process.env.GITLAB_OAUTH_SCOPES || 'api';

    if (!clientId || !redirectUri) {
      throw new Error('GitLab OAuth configuration missing');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      ...(state && { state }),
    });

    return `${this.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GITLAB_REDIRECT_URI,
      });

      const { access_token, refresh_token, expires_in } = response.data;

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      };
    } catch (error) {
      logger.error('Failed to exchange GitLab code for tokens:', error);
      throw new Error('Failed to exchange authorization code');
    }
  }

  public async refreshAccessToken(): Promise<string> {
    try {
      // Get current OAuth connection from database to get refresh token
      const db = await import('../services/database');
      const dbService = new db.DatabaseService();
      await dbService.connect();

      const oauthConnection = await dbService
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.refresh_token) {
        throw new Error('No refresh token available');
      }

      // Exchange refresh token for new access token
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        refresh_token: oauthConnection.refresh_token,
        grant_type: 'refresh_token',
      });

      const { access_token, refresh_token, expires_in } = response.data;

      // Update the database with new tokens
      await dbService
        .getConnection()
        .table('oauth_connections')
        .where('id', oauthConnection.id)
        .update({
          access_token: access_token,
          refresh_token: refresh_token || oauthConnection.refresh_token, // Keep old refresh token if new one not provided
          token_expires_at: new Date(Date.now() + expires_in * 1000),
          updated_at: new Date(),
        });

      // Update the client headers with the new token
      this.client.defaults.headers['Authorization'] = `Bearer ${access_token}`;

      await dbService.disconnect();

      logger.info('GitLab access token refreshed successfully');
      return access_token;
    } catch (error: any) {
      logger.error('Failed to refresh GitLab access token:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });

      // If refresh token is invalid/expired, we need user to re-authenticate
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === 'invalid_grant'
      ) {
        throw new Error(
          'GitLab refresh token has expired. Please reconnect your GitLab account.'
        );
      }

      throw new Error(
        `Failed to refresh access token: ${error.response?.data?.error_description || error.message}`
      );
    }
  }

  public async getCurrentUser(accessToken: string): Promise<GitLabUser> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v4/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get GitLab user:', error);
      throw new Error('Failed to get GitLab user information');
    }
  }
}
