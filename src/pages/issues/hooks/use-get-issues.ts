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
    queryKey: [
      'issues',
      filters?.search,
      filters?.projectId,
      filters?.status,
      filters?.labels,
      filters?.issueIds,
      filters?.quickFilters,
      currentUser?.id,
    ],
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
      if (filters.quickFilters?.assignedToMe && currentUser) {
        assigneeId = currentUser.id;
      } else if (filters.quickFilters?.unassigned) {
        assigneeId = 'None';
      }

      let authorId: number | string | undefined = undefined;
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
