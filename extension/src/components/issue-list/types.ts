export interface IssueFilterState {
  search: string;
  selectedProjectIds: string[];
  selectedAssigneeIds: string[];
  selectedLabels: string[];
  selectedStatuses: string[];
  sort: 'newest' | 'oldest';
}

export interface IssueListProps {
  className?: string;
  portalContainer?: Element | null;
  onSelect?: (item: any) => void;
}

export interface GitLabLabel {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  description?: string;
}

export interface IssueData {
  items: any[];
  nextCursor?: string | null;
  projectLabels?: Record<string, GitLabLabel[]>;
}