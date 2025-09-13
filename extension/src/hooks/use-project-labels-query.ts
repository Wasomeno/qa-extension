import apiService from '@/services/api';
import { useQuery } from '@tanstack/react-query';

export function useProjectLabelsQuery(projectId: string) {
  const query = useQuery({
    queryKey: ['projectLabels', projectId],
    queryFn: () => apiService.getGitLabProjectLabels(projectId),
  });

  return query;
}
