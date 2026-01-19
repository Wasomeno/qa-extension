import { getProjects } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetProjects() {
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(),
  });

  return {
    ...query,
    data: query.data?.data?.projects || [],
  };
}
