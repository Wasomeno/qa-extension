import { getProjectIssues, getIssues, Issue } from '@/api/issue';
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
      filters?.projectIds,
      filters?.status,
      filters?.labels,
      filters?.issueIds,
      filters?.assigneeIds,
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
        const activeLabels = filters.labels.filter(l => l !== 'ALL');
        labels.push(...activeLabels);
      }

      let assigneeId: number | string | null | undefined = undefined;
      let assigneeIds: string | undefined = undefined;

      const activeAssigneeIds = (filters.assigneeIds || []).filter(id => id !== 'ALL');
      if (activeAssigneeIds.length > 0) {
        const ids = activeAssigneeIds.map(id => {
          if (id === 'ME' && currentUser) return currentUser.id;
          return id;
        });

        if (ids.length === 1) {
          assigneeId = ids[0];
        } else {
          assigneeIds = ids.join(',');
        }
      } else if (filters.quickFilters?.assignedToMe && currentUser) {
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
        assignee_ids: assigneeIds,
        author_id: authorId,
      };

      if (filters.issueIds && filters.issueIds.length > 0) {
        params.issue_ids = filters.issueIds.join(',');
      }

      const projectIds = (filters.projectIds || []).filter(id => id !== 'ALL');
      if (projectIds.length > 0) {
        if (projectIds.length === 1) {
          return getProjectIssues(Number(projectIds[0]), params);
        } else {
          return getIssues({
            ...params,
            project_ids: projectIds.join(','),
          });
        }
      } else {
        return getIssues({
          ...params,
          project_id: undefined,
        });
      }
    },
    enabled: true,
  });

  return {
    ...query,
    data: query.data?.data || [],
  };
}
