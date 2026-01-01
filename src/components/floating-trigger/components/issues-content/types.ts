export interface MockLabel {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface MockUser {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
}

export interface MockProject {
  id: string;
  name: string;
  avatarUrl?: string;
}

export type IssueStatus = 'OPEN' | 'IN_QA' | 'BLOCKED' | 'CLOSED' | 'MERGED';

// Pin priority/color for visual organization
export type PinColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple';

export interface PinnedIssueMeta {
  pinnedAt: string; // ISO date string
  pinColor: PinColor; // Color coding for priority
  note?: string; // Optional personal note
}

// New interfaces for extended issue data

export interface Milestone {
  id: string;
  title: string;
  dueDate?: string;
  state: 'active' | 'closed';
}

export interface TimeTracking {
  timeEstimate: number; // in seconds
  totalTimeSpent: number; // in seconds
}

export interface TestAccount {
  id: string;
  label: string;
  username: string;
  password: string;
}

export interface TestDataSnippet {
  id: string;
  label: string;
  content: string;
  type: 'sql' | 'json' | 'text';
}

export interface TestEnvironment {
  envUrls: { label: string; url: string }[];
  testAccounts: TestAccount[];
  testDataSnippets: TestDataSnippet[];
}

export interface Comment {
  id: string;
  author: MockUser;
  body: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface DevQAChecklist {
  devItems: ChecklistItem[];
  qaItems: ChecklistItem[];
  isDevReady: boolean;
  isQaReady: boolean;
  isReadyForRelease: boolean;
}

export interface AcceptanceCriteria {
  id: string;
  text: string;
  completed: boolean;
}

// Child issue reference (lightweight version for display)
export interface ChildIssue {
  id: string;
  iid: number;
  title: string;
  status: IssueStatus;
  labels: MockLabel[];
  assignee?: MockUser;
  fullIssue?: MockIssue;
}

// Parent issue reference
export interface ParentIssue {
  id: string;
  iid: number;
  title: string;
  status: IssueStatus;
}

export interface MockIssue {
  id: string;
  iid: number;
  title: string;
  description: string;
  status: IssueStatus;
  project: MockProject;
  author: MockUser;
  assignee?: MockUser;
  labels: MockLabel[];
  mrStatus?: 'NONE' | 'OPEN' | 'MERGED';
  mrId?: number;
  createdAt: string;
  updatedAt: string;
  // Extended fields
  milestone?: Milestone;
  dueDate?: string;
  timeTracking?: TimeTracking;
  devQaChecklist?: DevQAChecklist;
  comments?: Comment[];
  testEnvironment?: TestEnvironment;
  acceptanceCriteria?: AcceptanceCriteria[];
  webUrl?: string;
  // Parent-child relationships
  parentIssue?: ParentIssue;
  childIssues?: ChildIssue[];
  pinnedMeta?: PinnedIssueMeta; // Only present if issue is pinned
}

export interface IssueFilterState {
  search: string;
  projectId: string | 'ALL';
  status: IssueStatus | 'ALL';
  sort: 'UPDATED' | 'NEWEST' | 'OLDEST' | 'PRIORITY';
  quickFilters: {
    assignedToMe: boolean;
    createdByMe: boolean;
    highPriority: boolean;
    inQa: boolean;
    blocked: boolean;
    hasOpenMr: boolean;
    unassigned: boolean;
  };
}
