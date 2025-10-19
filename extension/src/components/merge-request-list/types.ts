import type { MergeRequestSummary } from '@/types/merge-requests';

export interface MRListProps {
  className?: string;
  onSelect?: (mr: MergeRequestSummary) => void;
  onCreateClick?: () => void;
  portalContainer?: Element | null;
}

export interface MRFilters {
  search: string;
  projectIds: string[];
  state: 'opened' | 'closed' | 'merged' | 'all';
}
