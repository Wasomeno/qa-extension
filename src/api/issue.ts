import { api } from '@/services/api';
import { UserBasic } from '@/api/user';

export type Issue = {
  id: number;
  iid: number;
  external_id: string;
  state: string;
  description: string;
  health_status: string;
  author: UserBasic;
  milestone: null;
  project_id: number;
  project_name: string;
  assignees: UserBasic[];
  updated_at: string;
  closed_at: null;
  closed_by: null;
  title: string;
  created_at: string;
  moved_to_id: 0;
  labels: string[] | any[];
  label_details: Array<{
    id: number;
    name: string;
    color: string;
    description: string;
    description_html: string;
    text_color: string;
  }> | null;
  upvotes: 0;
  downvotes: 0;
  due_date: null;
  web_url: string;
  references: {
    short: string;
    relative: string;
    full: string;
  };
  time_stats: {
    human_time_estimate: string;
    human_total_time_spent: string;
    time_estimate: number;
    total_time_spent: number;
  };
  confidential: boolean;
  weight: number;
  discussion_locked: boolean;
  issue_type: string;
  subscribed: boolean;
  user_notes_count: number;
  _links: {
    self: string;
    notes: string;
    award_emoji: string;
    project: string;
  };
  issue_link_id: number;
  merge_requests_count: number;
  epic_issue_id: number;
  epic: null;
  iteration: null;
  task_completion_status: {
    count: number;
    completed_count: number;
  };
  service_desk_reply_to: string;
  assignee: null | any;
  child?: {
    amount: number;
    items: {
      id: string;
      iid: number;
    }[];
  };
};

export interface IssueComment {
  id: number;
  type: string | null;
  body: string;
  attachment: string | null;
  author: UserBasic;
  created_at: string;
  updated_at: string;
  system: boolean;
  noteable_id: number;
  noteable_type: string;
  project_id: number;
  noteable_iid: number;
  resolvable: boolean;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: UserBasic | null;
  internal: boolean;
  confidential: boolean;
  // Optional/Nullable fields from inspection
  title: string | null;
  file_name: string | null;
  expires_at: string | null;
  commit_id: string | null;
  position: any | null; // Complex object or null
}

export interface CreateIssueRequest {
  /**
   * The title of an issue.
   */
  title: string;

  /**
   * The description of an issue.
   */
  description?: string;

  /**
   * Set an issue to be confidential. Default is false.
   */
  confidential?: boolean;

  /**
   * The IDs of the users to assign the issue to.
   */
  assignee_ids?: number[];

  /**
   * The global ID of a milestone to assign the issue to.
   */
  milestone_id?: number;

  /**
   * Comma-separated label names for an issue.
   * Can also be an array of strings depending on how the frontend sends it,
   * but the Go client typically accepts a list or comma-separated string.
   */
  labels?: string[];

  /**
   * Date time string, ISO 8601 formatted, e.g. 2016-03-11T03:45:40Z
   * (Only allowed for admins and owners)
   */
  created_at?: string;

  /**
   * Date time string in the format YEAR-MONTH-DAY, e.g. 2016-03-11
   */
  due_date?: string;

  /**
   * The IID of a merge request in which to resolve all issues.
   * This will fill the issue with a default description and mark the merge request as in-progress.
   */
  merge_request_to_resolve_discussions_of?: number;

  /**
   * The ID of a discussion to resolve.
   * This will fill the issue with a default description and mark the discussion as resolved.
   * Use in combination with merge_request_to_resolve_discussions_of.
   */
  discussion_to_resolve?: string;

  /**
   * The weight of the issue. Valid values are greater than or equal to 0.
   */
  weight?: number;

  /**
   * The ID of the epic to add the issue to.
   * (Premium/Ultimate feature)
   */
  epic_id?: number;

  /**
   * The type of issue.
   */
  issue_type?: 'issue' | 'incident' | 'test_case';
}

export type UpdateIssueRequest = {
  /**
   * The new title of the issue.
   */
  title?: string;

  /**
   * The description of the issue.
   */
  description?: string;

  /**
   * Set to true to make the issue confidential.
   */
  confidential?: boolean;

  /**
   * The IDs of the users to assign the issue to.
   * NOTE: This overwrites the existing assignees.
   */
  assignee_ids?: number[];

  /**
   * The global ID of a milestone to assign the issue to.
   * Set to 0 (or null in some clients) to unassign a milestone.
   */
  milestone_id?: number;

  /**
   * Comma-separated list of label names (or an array of strings).
   * WARNING: This overwrites all existing labels.
   * Use add_labels/remove_labels for safer updates.
   */
  labels?: string | string[];

  /**
   * Labels to add to the existing set.
   * Useful for moving issues across board columns without losing other tags.
   */
  add_labels?: string | string[];

  /**
   * Labels to remove from the existing set.
   */
  remove_labels?: string | string[];

  /**
   * Change the state of the issue.
   */
  state_event?: 'close' | 'reopen';

  /**
   * Date string in the format 'YYYY-MM-DD'.
   */
  due_date?: string;

  /**
   * Set to true to lock the discussion.
   */
  discussion_locked?: boolean;

  /**
   * Type of issue (e.g., 'issue', 'incident', 'test_case').
   */
  issue_type?: 'issue' | 'incident' | 'test_case';

  /**
   * The ID of the epic to assign the issue to.
   * (Premium/Ultimate feature)
   */
  epic_id?: number;
};

export interface IssueFilterParams {
  search?: string;
  project_id?: number;
  state?: string;
  labels?: string[];
  assignee_id?: number | string | null;
  author_id?: number | string | null;
  issue_ids?: string;
}

function buildIssueQueryParams(params: IssueFilterParams): string {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append('search', params.search);
  // Note: project_id might be used in the path for getProjectIssues, but kept here for getIssues global search
  if (params.project_id)
    queryParams.append('project_id', params.project_id.toString());
  if (params.state) queryParams.append('state', params.state);

  if (params.labels && params.labels.length > 0) {
    // Backend likely expects comma-separated string for "labels" key
    queryParams.append('labels', params.labels.join(','));
  }

  if (params.assignee_id)
    queryParams.append('assignee_id', params.assignee_id.toString());
  if (params.author_id)
    queryParams.append('author_id', params.author_id.toString());
  if (params.issue_ids) queryParams.append('issue_ids', params.issue_ids);

  return queryParams.toString();
}

export async function getIssues(params: IssueFilterParams = {}) {
  const queryString = buildIssueQueryParams(params);
  const url = queryString ? `/issues?${queryString}` : '/issues';

  return api.get<Issue[]>(url);
}

export async function getProjectIssues(
  projectId: number,
  params: IssueFilterParams = {}
) {
  // Exclude project_id from query params if it's already in the path,
  // though duplicate usually doesn't hurt, it's cleaner to remove it.
  const { project_id, ...restParams } = params;
  const queryString = buildIssueQueryParams(restParams);
  const url = queryString
    ? `/projects/${projectId}/issues?${queryString}`
    : `/projects/${projectId}/issues`;

  return api.get<Issue[]>(url);
}

export async function getIssue(projectId: number, id: number) {
  return api.get<Issue>(`/projects/${projectId}/issues/${id}`);
}

export async function createIssue(
  projectId: number,
  request: CreateIssueRequest
) {
  return api.post<Issue>(`/projects/${projectId}/issues`, {
    body: JSON.stringify(request),
  });
}

export async function updateIssue(
  projectId: number,
  id: number,
  request: UpdateIssueRequest
) {
  return api.put<Issue>(`/projects/${projectId}/issues/${id}`, {
    body: JSON.stringify(request),
  });
}

export async function getIssueComments(projectId: number, id: number) {
  return api.get<IssueComment[]>(
    `/projects/${projectId}/issues/${id}/comments`
  );
}
export interface CreateIssueWithChildRequest extends CreateIssueRequest {
  child_issues: CreateIssueRequest[];
}

export async function createIssueWithChild(
  projectId: number,
  request: CreateIssueWithChildRequest
) {
  console.log('REQUEST', request);
  return api.post<void>(`/projects/${projectId}/issues-with-child`, {
    body: JSON.stringify(request),
  });
}

export interface IssueLink {
  id: number;
  iid: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  confidential: boolean;
  link_type: string;
  link_created_at: string;
  link_updated_at: string;
  web_url: string;
  target_issue_iid: number;
  issue_link_id: number;
  assignees?: UserBasic[];
}

export async function getIssueLinks(projectId: number, issueIid: number) {
  return api.get<IssueLink[]>(
    `/projects/${projectId}/issues/${issueIid}/links`
  );
}

export async function createIssueLink(
  projectId: number,
  issueIid: number,
  targetIssueIid: string
) {
  return api.post<IssueLink>(
    `/projects/${projectId}/issues/${issueIid}/links`,
    {
      body: JSON.stringify({
        target_project_id: projectId.toString(),
        target_issue_iid: targetIssueIid,
      }),
    }
  );
}

export async function deleteIssueLink(
  projectId: number,
  issueIid: number,
  issueLinkId: number
) {
  return api.delete<void>(
    `/projects/${projectId}/issues/${issueIid}/links/${issueLinkId}`
  );
}
