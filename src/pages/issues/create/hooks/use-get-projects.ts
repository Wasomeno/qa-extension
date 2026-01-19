import { getProjects } from '@/api/project';
import { useQuery } from '@tanstack/react-query';

export function useGetProjects() {
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const projects = query.data?.data?.projects || [];

  return { ...query, data: projects };
}
