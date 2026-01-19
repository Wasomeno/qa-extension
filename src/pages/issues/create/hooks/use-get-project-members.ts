import { getProjectMembers } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetProjectMembers(projectId?: number) {
  const query = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId!),
    enabled: !!projectId,
  });

  const members = query.data?.data?.members || [];

  return { ...query, data: members };
}
