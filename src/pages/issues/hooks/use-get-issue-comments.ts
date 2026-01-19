import { getIssueComments } from '@/api/issue';
import { useQuery } from '@tanstack/react-query';

export function useGetIssueComments(projectId: number, id: number) {
  const query = useQuery({
    queryKey: ['issues', projectId, id],
    queryFn: () => getIssueComments(projectId, id),
  });

  return query;
}
