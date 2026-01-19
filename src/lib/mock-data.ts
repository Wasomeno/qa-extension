// Moved from src/components/floating-trigger/components/issues-content/mock-data.ts
import {
  MockIssue,
  MockProject,
  MockUser,
  MockLabel,
  Milestone,
  TestEnvironment,
  DevQAChecklist,
  Comment,
  AcceptanceCriteria,
  ChildIssue,
} from '@/types/issues';

export const CURRENT_USER: MockUser = {
  id: 'user-1',
  name: 'QA User',
  username: 'qa_user',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=qa_user',
};

export const OTHER_USERS: MockUser[] = [
  {
    id: 'user-2',
    name: 'John Dev',
    username: 'john_dev',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john',
  },
  {
    id: 'user-3',
    name: 'Jane Lead',
    username: 'jane_lead',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
  },
  {
    id: 'user-4',
    name: 'Mike PM',
    username: 'mike_pm',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
  },
];

export const MOCK_LABELS: Record<string, MockLabel> = {
  BUG: { id: 'l1', name: 'Bug', color: '#FF0000', textColor: '#FFFFFF' },
  FEATURE: {
    id: 'l2',
    name: 'Feature',
    color: '#0000FF',
    textColor: '#FFFFFF',
  },
  P1: { id: 'l3', name: 'P1', color: '#FF4500', textColor: '#FFFFFF' },
  P2: { id: 'l4', name: 'P2', color: '#FFA500', textColor: '#FFFFFF' },
  IN_QA: { id: 'l5', name: 'In QA', color: '#4287f5', textColor: '#FFFFFF' },
  BLOCKED: {
    id: 'l6',
    name: 'Blocked',
    color: '#000000',
    textColor: '#FFFFFF',
  },
  FRONTEND: {
    id: 'l7',
    name: 'Frontend',
    color: '#33cc33',
    textColor: '#FFFFFF',
  },
  BACKEND: {
    id: 'l8',
    name: 'Backend',
    color: '#3333cc',
    textColor: '#FFFFFF',
  },
};

export const MOCK_PROJECTS: MockProject[] = [
  { id: 'p1', name: 'Project Alpha' },
  { id: 'p2', name: 'Project Beta' },
  { id: 'p3', name: 'Internal Tools' },
];

export const MOCK_MILESTONES: Record<string, Milestone> = {
  SPRINT_1: {
    id: 'm1',
    title: 'Sprint 1',
    dueDate: '2024-12-31',
    state: 'active',
  },
  SPRINT_2: {
    id: 'm2',
    title: 'Sprint 2',
    dueDate: '2025-01-15',
    state: 'active',
  },
  V2_RELEASE: {
    id: 'm3',
    title: 'v2.0 Release',
    dueDate: '2025-02-01',
    state: 'active',
  },
};

export const MOCK_TEST_ENV: TestEnvironment = {
  envUrls: [
    { label: 'Staging', url: 'https://staging.example.com' },
    { label: 'UAT', url: 'https://uat.example.com' },
    { label: 'Production', url: 'https://app.example.com' },
  ],
  testAccounts: [
    {
      id: 'ta1',
      label: 'Admin User',
      username: 'admin@test.com',
      password: 'Test@123',
    },
    {
      id: 'ta2',
      label: 'Regular User',
      username: 'user@test.com',
      password: 'User@456',
    },
    {
      id: 'ta3',
      label: 'Premium User',
      username: 'premium@test.com',
      password: 'Prem@789',
    },
  ],
  testDataSnippets: [
    { id: 'td1', label: 'Valid User ID', content: 'user_12345', type: 'text' },
    {
      id: 'td2',
      label: 'Test Order',
      content: '{"orderId": "ORD-001", "amount": 100.00}',
      type: 'json',
    },
    {
      id: 'td3',
      label: 'Reset User',
      content: "DELETE FROM sessions WHERE user_id = 'test_user';",
      type: 'sql',
    },
  ],
};

const now = new Date();
const hoursAgo = (h: number) =>
  new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) =>
  new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const mockComments = (issueId: string): Comment[] => [
  {
    id: `${issueId}-c1`,
    author: OTHER_USERS[0],
    body: 'I can reproduce this issue. Working on a fix now.',
    createdAt: hoursAgo(5),
  },
  {
    id: `${issueId}-c2`,
    author: CURRENT_USER,
    body: 'Thanks! Let me know when the fix is ready for QA.',
    createdAt: hoursAgo(3),
  },
];

const mockDevQaChecklist = (
  devProgress: number,
  qaProgress: number
): DevQAChecklist => ({
  devItems: [
    { id: 'd1', text: 'Code implemented', completed: devProgress >= 1 },
    { id: 'd2', text: 'Unit tests added', completed: devProgress >= 2 },
    { id: 'd3', text: 'Code reviewed', completed: devProgress >= 3 },
    { id: 'd4', text: 'Documentation updated', completed: devProgress >= 4 },
  ],
  qaItems: [
    { id: 'q1', text: 'Functional testing', completed: qaProgress >= 1 },
    { id: 'q2', text: 'Regression testing', completed: qaProgress >= 2 },
    { id: 'q3', text: 'Edge case testing', completed: qaProgress >= 3 },
    { id: 'q4', text: 'Sign-off approved', completed: qaProgress >= 4 },
  ],
  isDevReady: devProgress >= 3,
  isQaReady: qaProgress >= 4,
  isReadyForRelease: devProgress >= 4 && qaProgress >= 4,
});

const mockAcceptanceCriteria = (): AcceptanceCriteria[] => [
  {
    id: 'ac1',
    text: 'User sees validation error when email is empty',
    completed: false,
  },
  {
    id: 'ac2',
    text: 'Validation error message is user-friendly',
    completed: true,
  },
  {
    id: 'ac3',
    text: 'Form does not submit with invalid data',
    completed: false,
  },
  {
    id: 'ac4',
    text: 'Error state is cleared when user starts typing',
    completed: true,
  },
];

const MOCK_CHILD_ISSUES: ChildIssue[] = [
  {
    id: 'child-1',
    iid: 75,
    title: '[Issue] Label Case Title',
    status: 'OPEN',
    labels: [MOCK_LABELS.BACKEND, MOCK_LABELS.FRONTEND],
    assignee: OTHER_USERS[0],
    fullIssue: {
      id: 101,
      iid: 75,
      title: '[Issue] Label Case Title',
      description:
        'Need to fix label case title in the initial issue creation.',
      state: 'opened',
      author: OTHER_USERS[1],
      assignee: OTHER_USERS[0],
      labels: [MOCK_LABELS.BACKEND, MOCK_LABELS.FRONTEND],
      created_at: daysAgo(5),
      updated_at: daysAgo(2),

    },
  },
  {
    id: 'child-2',
    iid: 74,
    title: '[Issue] Typo Status Need Assessment',
    status: 'OPEN',
    labels: [MOCK_LABELS.BACKEND],
    assignee: OTHER_USERS[0],
    fullIssue: {
      id: 102,
      iid: 74,
      title: '[Issue] Typo Status Need Assessment',
      description: 'Typo in the status assessment state.',
      state: 'opened',
      author: OTHER_USERS[1],
      assignee: OTHER_USERS[0],
      labels: [MOCK_LABELS.BACKEND],
      created_at: daysAgo(4),
      updated_at: daysAgo(1),

    },
  },
  {
    id: 'child-3',
    iid: 73,
    title: '[Issue] Id Tax Case Study tidak sesuai dengan response',
    status: 'CLOSED',
    labels: [MOCK_LABELS.FRONTEND],
    assignee: OTHER_USERS[1],
    fullIssue: {
      id: 103,
      iid: 73,
      title: '[Issue] Id Tax Case Study tidak sesuai dengan response',
      description: 'Response ID mismatch.',
      state: 'closed',
      author: OTHER_USERS[2],
      assignee: OTHER_USERS[1],
      labels: [MOCK_LABELS.FRONTEND],
      created_at: daysAgo(3),
      updated_at: daysAgo(1),

    },
  },
  {
    id: 'child-4',
    iid: 72,
    title: '[Issue] Kesesuaian Halaman List dengan Desain UI',
    status: 'IN_QA',
    labels: [MOCK_LABELS.FRONTEND],
    assignee: CURRENT_USER,
    fullIssue: {
      id: 104,
      iid: 72,
      title: '[Issue] Kesesuaian Halaman List dengan Desain UI',
      description: 'UI/UX layout check.',
      state: 'opened',
      author: OTHER_USERS[0],
      assignee: CURRENT_USER,
      labels: [MOCK_LABELS.FRONTEND],
      created_at: daysAgo(2),
      updated_at: hoursAgo(4),

    },
  },
];

export const MOCK_ISSUES: MockIssue[] = [
  {
    id: 'issue-1',
    iid: 423,
    title: 'Login validation fails on empty email',
    description:
      'When submitting the login form with an empty email field, the form submits instead of showing validation error. \n\n**Steps to reproduce:**\n1. Go to login page\n2. Leave email empty\n3. Click Login\n\n**Expected:** Validation error shown.\n**Actual:** Form submits and reloads page.',
    status: 'OPEN',
    project: MOCK_PROJECTS[0],
    author: OTHER_USERS[0],
    assignee: CURRENT_USER,
    labels: [MOCK_LABELS.BUG, MOCK_LABELS.P1, MOCK_LABELS.FRONTEND],
    mrStatus: 'OPEN',
    mrId: 156,
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(2),
    milestone: MOCK_MILESTONES.SPRINT_1,
    dueDate: daysAgo(-3),
    timeTracking: { timeEstimate: 14400, totalTimeSpent: 7200 },
    devQaChecklist: mockDevQaChecklist(3, 1),
    comments: mockComments('issue-1'),
    testEnvironment: MOCK_TEST_ENV,
    acceptanceCriteria: mockAcceptanceCriteria(),
    webUrl: 'https://gitlab.com/project/alpha/-/issues/423',
    childIssues: MOCK_CHILD_ISSUES,
    pinnedMeta: {
      pinnedAt: daysAgo(3),
      pinColor: 'red',
      note: 'High priority - need to check before release',
    },
  },
  {
    id: 'issue-2',
    iid: 419,
    title: 'Payment timeout when card expired',
    description:
      'Payment gateway times out instead of returning clear error for expired cards.',
    status: 'BLOCKED',
    project: MOCK_PROJECTS[1],
    author: OTHER_USERS[1],
    assignee: OTHER_USERS[0],
    labels: [MOCK_LABELS.BUG, MOCK_LABELS.BLOCKED, MOCK_LABELS.BACKEND],
    mrStatus: 'NONE',
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(5),
    milestone: MOCK_MILESTONES.SPRINT_2,
    devQaChecklist: mockDevQaChecklist(1, 0),
    webUrl: 'https://gitlab.com/project/beta/-/issues/419',
    pinnedMeta: {
      pinnedAt: daysAgo(1),
      pinColor: 'orange',
      note: 'Waiting for backend fix',
    },
  },
  {
    id: 'issue-3',
    iid: 415,
    title: 'User profile page - QA verification',
    description:
      'Verify all user profile fields are editable and save correctly.',
    status: 'IN_QA',
    project: MOCK_PROJECTS[0],
    author: OTHER_USERS[1],
    assignee: CURRENT_USER,
    labels: [MOCK_LABELS.FEATURE, MOCK_LABELS.IN_QA],
    mrStatus: 'MERGED',
    mrId: 152,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    milestone: MOCK_MILESTONES.SPRINT_1,
    devQaChecklist: mockDevQaChecklist(4, 2),
    testEnvironment: MOCK_TEST_ENV,
    acceptanceCriteria: [
      { id: 'ac1', text: 'User can edit display name', completed: true },
      { id: 'ac2', text: 'User can upload avatar', completed: true },
      { id: 'ac3', text: 'Changes persist after refresh', completed: false },
    ],
    webUrl: 'https://gitlab.com/project/alpha/-/issues/415',
  },
  {
    id: 'issue-4',
    iid: 412,
    title: 'Add retry logic for failed transactions',
    description:
      'Implement exponential backoff for failed transaction retries.',
    status: 'OPEN',
    project: MOCK_PROJECTS[1],
    author: CURRENT_USER,
    assignee: CURRENT_USER,
    labels: [MOCK_LABELS.FEATURE, MOCK_LABELS.P2, MOCK_LABELS.BACKEND],
    mrStatus: 'OPEN',
    mrId: 148,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
    milestone: MOCK_MILESTONES.V2_RELEASE,
    timeTracking: { timeEstimate: 28800, totalTimeSpent: 10800 },
    webUrl: 'https://gitlab.com/project/beta/-/issues/412',
  },
  {
    id: 'issue-5',
    iid: 410,
    title: 'Homepage banner not loading',
    description: 'Banner image returns 404 on staging environment.',
    status: 'OPEN',
    project: MOCK_PROJECTS[0],
    author: OTHER_USERS[2],
    assignee: undefined,
    labels: [MOCK_LABELS.BUG, MOCK_LABELS.P2],
    mrStatus: 'NONE',
    createdAt: daysAgo(6),
    updatedAt: daysAgo(3),
    webUrl: 'https://gitlab.com/project/alpha/-/issues/410',
  },
  {
    id: 'issue-6',
    iid: 105,
    title: 'Update documentation for API v2',
    description: 'API documentation needs to be updated with new endpoints.',
    status: 'CLOSED',
    project: MOCK_PROJECTS[2],
    author: CURRENT_USER,
    assignee: OTHER_USERS[2],
    labels: [],
    mrStatus: 'MERGED',
    mrId: 45,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(5),
    devQaChecklist: mockDevQaChecklist(4, 4),
    webUrl: 'https://gitlab.com/project/internal/-/issues/105',
  },
  {
    id: 'issue-7',
    iid: 424,
    title: 'Fix responsive layout on tablet',
    description: 'Tablet view breaks on dashboard page.',
    status: 'OPEN',
    project: MOCK_PROJECTS[0],
    author: OTHER_USERS[0],
    assignee: CURRENT_USER,
    labels: [MOCK_LABELS.BUG, MOCK_LABELS.FRONTEND],
    mrStatus: 'NONE',
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    webUrl: 'https://gitlab.com/project/alpha/-/issues/424',
    parentIssue: {
      id: 'issue-1',
      iid: 423,
      title: 'Login validation fails on empty email',
      status: 'OPEN',
    },
  },
];

export const MOCK_PINNED_ISSUES = MOCK_ISSUES.filter(i => i.pinnedMeta);
