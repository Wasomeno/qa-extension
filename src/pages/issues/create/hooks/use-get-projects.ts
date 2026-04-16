import { getProjects } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetProjects() {
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const projects = query.data?.data?.projects || [];

  return { ...query, data: projects };
}
