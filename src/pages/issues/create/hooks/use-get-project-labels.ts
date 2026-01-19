import { getProjectLabels } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetProjectLabels(projectId?: number) {
  const query = useQuery({
    queryKey: ['project-labels', projectId],
    queryFn: () => getProjectLabels(projectId!),
    enabled: !!projectId,
  });

  const labels = query.data?.data || [];

  return { ...query, data: labels };
}
