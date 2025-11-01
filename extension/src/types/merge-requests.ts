/**
 * Merge Request types for the extension
 */

export interface MRAuthor {
  id: number;
  name: string;
  username?: string;
  avatar_url?: string;
}

export interface MRPipeline {
  id?: number;
  status:
    | 'success'
    | 'failed'
    | 'pending'
    | 'running'
    | 'canceled'
    | 'skipped'
    | 'manual';
  ref?: string;
  web_url?: string;
}

export interface MergeRequestSummary {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  source_branch: string;
  target_branch: string;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  author: MRAuthor;
  assignees: MRAuthor[];
  reviewers: MRAuthor[];
  created_at: string;
  updated_at: string;
  web_url: string;
  user_notes_count?: number;
  has_conflicts?: boolean;
  draft?: boolean;
  work_in_progress?: boolean;
  merge_status?: string;
  pipeline?: MRPipeline;
  labels?: string[];
  project?: {
    id: number;
    name: string;
  };
}

export interface MergeRequestDetail extends MergeRequestSummary {
  description: string;
  upvotes?: number;
  downvotes?: number;
  merged_at?: string | null;
  closed_at?: string | null;
  merged_by?: MRAuthor | null;
  closed_by?: MRAuthor | null;
  sha?: string;
  merge_commit_sha?: string | null;
  squash_commit_sha?: string | null;
  should_remove_source_branch?: boolean | null;
  force_remove_source_branch?: boolean;
  squash?: boolean;
  blocking_discussions_resolved?: boolean;
}

export interface MRNote {
  id: number;
  body: string;
  system?: boolean;
  created_at: string;
  updated_at?: string;
  author?: MRAuthor;
  noteable_type?: string;
  noteable_id?: number;
  resolvable?: boolean;
  resolved?: boolean;
  type?: 'DiffNote' | 'DiscussionNote' | null;
  position?: {
    base_sha?: string;
    start_sha?: string;
    head_sha?: string;
    old_path?: string;
    new_path?: string;
    position_type?: string;
    old_line?: number | null;
    new_line?: number | null;
    line_range?: {
      start: {
        line_code: string;
        type: string;
        old_line: number | null;
        new_line: number | null;
      };
      end: {
        line_code: string;
        type: string;
        old_line: number | null;
        new_line: number | null;
      };
    };
  };
}

export interface MRNoteSnippetLine {
  lineNumber: number;
  content: string;
  highlight: boolean;
}

export interface MRNoteSnippet {
  path: string;
  ref: string;
  highlightStart: number;
  highlightEnd: number;
  startLine: number;
  endLine: number;
  totalLines: number;
  lines: MRNoteSnippetLine[];
}

export interface MRNoteFixSuggestion {
  summary: string;
  updatedCode: string;
  warnings?: string[];
}

export interface MRNoteFixPreview {
  diff: string;
  commitMessage: string;
  snippet: MRNoteSnippet;
}

export interface MRNoteFixApplyResult extends MRNoteFixPreview {
  commitSha: string;
  undoToken?: string | null;
}

export interface ListMRsParams {
  search?: string;
  projectId?: string;
  state?: 'opened' | 'closed' | 'locked' | 'merged' | 'all';
  assignee_id?: number | 'me';
  reviewer_id?: number | 'me';
  author_id?: number | 'me';
  scope?: 'all' | 'created_by_me' | 'assigned_to_me';
  labels?: string[];
  per_page?: number;
  page?: number;
  sort?: 'newest' | 'oldest';
}

export interface ListMRsResponse {
  items: MergeRequestSummary[];
  total?: number;
  nextPage?: number | null;
}
