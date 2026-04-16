import { getIssueComments } from '@/api/issue';
import { useQuery } from '@tanstack/react-query';

export function useGetIssueComments(projectId: number, id: number) {
  const query = useQuery({
    queryKey: ['issues', projectId, id, 'comments'],
    queryFn: () => getIssueComments(projectId, id),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return query;
}
