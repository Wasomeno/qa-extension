import { getProjects } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

interface UseGetProjectsOptions {
  search?: string;
}

export function useGetProjects(options?: UseGetProjectsOptions) {
  const search = options?.search;
  const query = useQuery({
    queryKey: ['projects', search],
    queryFn: () => getProjects(search),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    ...query,
    data: query.data?.data?.projects || [],
  };
}
