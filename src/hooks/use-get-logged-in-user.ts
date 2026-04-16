import { getCurrentUser } from '@/api/user';
import { useQuery } from '@tanstack/react-query';

export function useGetLoggedInUser() {
  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: () => getCurrentUser(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    ...query,
    data: query.data?.data || null,
  };
}
