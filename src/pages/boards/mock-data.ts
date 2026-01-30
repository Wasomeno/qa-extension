import { MockUser, MockLabel } from '@/types/issues';

export interface BoardIssue {
  id: string;
  iid: number;
  title: string;
  assignee?: MockUser;
  labels: MockLabel[];
  weight?: number;
  webUrl: string;
  projectId: number;
  projectName: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  issues: BoardIssue[];
  color?: string;
  textColor?: string;
}

export interface ProjectBoard {
  id: string;
  name: string;
  avatarUrl?: string;
  columns: BoardColumn[];
}

const MOCK_USERS: MockUser[] = [
  {
    id: '1',
    name: 'Pickle Rick',
    username: 'pickle_rick',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pickle',
  },
  {
    id: '2',
    name: 'Morty Smith',
    username: 'morty',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Morty',
  },
  {
    id: '3',
    name: 'Summer Smith',
    username: 'summer',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Summer',
  },
  {
    id: '4',
    name: 'Jerry Smith',
    username: 'jerry',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jerry',
  },
];

const MOCK_LABELS: MockLabel[] = [
  { id: '1', name: 'bug', color: '#FF0000', textColor: '#FFFFFF' },
  { id: '2', name: 'feature', color: '#00FF00', textColor: '#000000' },
  { id: '3', name: 'documentation', color: '#0000FF', textColor: '#FFFFFF' },
  { id: '4', name: 'urgent', color: '#FF4500', textColor: '#FFFFFF' },
];

const generateIssues = (count: number): BoardIssue[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `issue-${Math.random().toString(36).substr(2, 9)}`,
    iid: Math.floor(Math.random() * 1000),
    title: `Issue ${i + 1}: ${['Fix the flux capacitor', 'Calibrate portal gun', 'Avoid family therapy', 'Defeat the Galactic Federation'][Math.floor(Math.random() * 4)]}`,
    assignee:
      Math.random() > 0.3
        ? MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)]
        : undefined,
    labels: MOCK_LABELS.slice(0, Math.floor(Math.random() * 3)),
    weight: Math.floor(Math.random() * 5) + 1,
    webUrl: '#',
    projectId: 1,
    projectName: 'Mock Project',
  }));
};

export const MOCK_BOARDS: ProjectBoard[] = [
  {
    id: 'proj-1',
    name: "Rick's Garage",
    avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=Garage',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        issues: generateIssues(3),
        color: '#10b981',
      },
      {
        id: 'col-2',
        title: 'Doing',
        issues: generateIssues(2),
        color: '#f59e0b',
      },
      {
        id: 'col-3',
        title: 'Done',
        issues: generateIssues(5),
        color: '#3b82f6',
      },
    ],
  },
  {
    id: 'proj-2',
    name: 'Citadel of Ricks',
    avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=Citadel',
    columns: [
      {
        id: 'col-4',
        title: 'Backlog',
        issues: generateIssues(4),
        color: '#6b7280',
      },
      {
        id: 'col-5',
        title: 'In Review',
        issues: generateIssues(1),
        color: '#8b5cf6',
      },
      {
        id: 'col-6',
        title: 'Deployed',
        issues: generateIssues(2),
        color: '#06b6d4',
      },
    ],
  },
  {
    id: 'proj-3',
    name: 'Purge Planet',
    avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=Purge',
    columns: [
      {
        id: 'col-7',
        title: 'Open',
        issues: generateIssues(2),
        color: '#ef4444',
      },
      {
        id: 'col-8',
        title: 'Closed',
        issues: generateIssues(6),
        color: '#10b981',
      },
    ],
  },
];
