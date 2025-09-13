import apiService from '@/services/api';
import { useQuery } from '@tanstack/react-query';

export function useUsersInProjectQuery(projectId: string) {
  const query = useQuery({
    queryKey: ['users', projectId],
    queryFn: () => apiService.getUsersInProject(projectId),
  });

  return query;
}
