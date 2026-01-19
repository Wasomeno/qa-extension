import { getProjectLabels } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetLabels(projectId?: string | number) {
  // If no project selected ('ALL'), we might want global labels or empty.
  // For now, let's assume we only show labels if a project is selected,
  // OR if the backend supports a global label endpoint.
  // User said "replace with label options".
  // Often labels are project specific.
  // If projectId is 'ALL' or undefined, we might skip fetching.

  const isProjectSelected = projectId && projectId !== 'ALL';
  const numericId = Number(projectId);

  const query = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getProjectLabels(numericId),
    enabled: !!isProjectSelected && !isNaN(numericId),
  });

  return {
    ...query,
    // Existing api/project.ts uses { labels: ... } wrapper for return type?
    // Let's verify that in next steps.
    // Assuming api.get<Label[]> for consistency with recent changes.
    data: query.data?.data || [],
  };
}
