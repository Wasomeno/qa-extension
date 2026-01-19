import { Issue } from '@/api/issue';

// Moved from src/components/floating-trigger/components/issues-content/types.ts
export interface MockLabel {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface MockUser {
  id: string | number;
  name: string;
  username: string;
  avatarUrl?: string;
  // Compatibility with UserBasic
  state?: string;
  web_url?: string;
  avatar_url?: string;
}

export interface MockProject {
  id: string;
  name: string;
  avatarUrl?: string;
}

export type IssueStatus = 'OPEN' | 'IN_QA' | 'BLOCKED' | 'CLOSED' | 'MERGED';

export interface MockIssue {
  id: string;
  iid: number;
  title: string;
  description?: string;
  status: IssueStatus;
  assignee?: MockUser;
  author: MockUser;
  labels: MockLabel[];
  project: MockProject;
  createdAt: string;
  updatedAt: string;
  milestone?: Milestone;
  weight?: number;
  timeTracking?: TimeTracking;
  testEnvironment?: TestEnvironment;
  devQaChecklist?: DevQAChecklist;
  acceptanceCriteria?: AcceptanceCriteria[];
  comments?: Comment[];
  parentIssue?: ParentIssue;
  childIssues?: ChildIssue[];
  relatedMrs?: any[]; // Avoiding circular dependency hell for now
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  mrStatus?: string;
  pinnedMeta?: PinnedIssueMeta;
  mrId?: number;
  webUrl?: string;
  dueDate?: string;
}

export type PinColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple';

export interface PinnedIssueMeta {
  pinnedAt: string;
  pinColor: PinColor;
  note?: string;
  projectId?: number;
}
export interface Milestone {
  id: string;
  title: string;
  dueDate?: string;
  state: 'active' | 'closed';
}

export interface TimeTracking {
  timeEstimate: number;
  totalTimeSpent: number;
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
export interface ChildIssue {
  id: string;
  iid: number;
  title: string;
  status: IssueStatus;
  labels: MockLabel[];
  assignee?: MockUser;
  fullIssue?: Partial<Issue>;
  state?: string;
  web_url?: string;
}

export interface ParentIssue {
  id: string;
  iid: number;
  title: string;
  status: IssueStatus;
}

export interface IssueFilterState {
  search: string;
  projectId: string | 'ALL';
  status: IssueStatus | 'ALL';
  labels?: string[];
  issueIds?: number[];
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