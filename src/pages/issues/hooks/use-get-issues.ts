import { getIssues, getProjectIssues, Issue } from '@/api/issue';
import { useQuery } from '@tanstack/react-query';
import { IssueFilterState } from '@/types/issues';
import { useGetLoggedInUser } from '@/hooks/use-get-logged-in-user';

// Dummy Label Names as per request
const LABEL_NAMES = {
  HIGH_PRIORITY: 'High Priority',
  IN_QA: 'In QA',
  BLOCKED: 'Blocked',
};

export function useGetIssues(filters?: Partial<IssueFilterState>) {
  const { data: currentUser } = useGetLoggedInUser();

  const query = useQuery({
    queryKey: ['issues', filters, currentUser?.id],
    queryFn: () => {
      // If issueIds is provided but empty, return empty result immediately to avoid fetching all issues
      if (filters?.issueIds && filters.issueIds.length === 0) {
        return Promise.resolve({ data: [] } as any);
      }

      // If no filters at all, fetch default global issues
      if (!filters) return getIssues();

      const labels: string[] = [];
      if (filters.quickFilters?.highPriority)
        labels.push(LABEL_NAMES.HIGH_PRIORITY);
      if (filters.quickFilters?.inQa) labels.push(LABEL_NAMES.IN_QA);
      if (filters.quickFilters?.blocked) labels.push(LABEL_NAMES.BLOCKED);

      // Add any manually selected labels
      if (filters.labels && filters.labels.length > 0) {
        labels.push(...filters.labels);
      }

      let assigneeId: number | string | null | undefined = undefined;
      // "Assigned to Me" takes precedence over unassigned check if both were somehow true (UI should prevent this)
      if (filters.quickFilters?.assignedToMe && currentUser) {
        assigneeId = currentUser.id;
      } else if (filters.quickFilters?.unassigned) {
        assigneeId = null; // Assuming backend handles null/0 for unassigned
      } else if (currentUser && !filters.issueIds) {
        // Default to current user if not explicitly unassigned or filtered otherwise
        // BUT skip this default if we are looking for specific issue IDs (e.g. child tasks)
        assigneeId = currentUser.id;
      }

      let authorId: number | string | undefined = undefined;
      // Backend requires author_id. Default to current user if available.
      // Skip default author filter if we are fetching specific IDs
      if (currentUser && !filters.issueIds) {
        authorId = currentUser.id;
      }

      // If specific "Created by Me" toggle exists
      if (filters.quickFilters?.createdByMe && currentUser) {
        authorId = currentUser.id;
      }

      const params: any = {
        search: filters.search || undefined,
        state:
          filters.status && filters.status !== 'ALL'
            ? filters.status.toLowerCase()
            : undefined,
        labels: labels.length > 0 ? labels : undefined,
        assignee_id: assigneeId,
        author_id: authorId,
      };

      if (filters.issueIds && filters.issueIds.length > 0) {
        params.issue_ids = filters.issueIds.join(',');
      }

      if (filters.projectId && filters.projectId !== 'ALL') {
        return getProjectIssues(Number(filters.projectId), params);
      } else {
        return getIssues({
          ...params,
          project_id: undefined, // explicit undefined just to match logic, though default is undefined
        });
      }
    },
    enabled: true, // Always enabled, even if no user yet (will just fetch public/all issues)
  });

  return {
    ...query,
    data: query.data?.data || [],
  };
}
