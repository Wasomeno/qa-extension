import { getIssue } from '@/api/issue';
import { useQuery } from '@tanstack/react-query';

export function useGetIssue(projectId: number, id: number) {
  const query = useQuery({
    queryKey: ['issues', projectId, id],
    queryFn: () => getIssue(projectId, id),
  });

  return { ...query };
}
