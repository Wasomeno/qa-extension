import { useMemo } from 'react';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import api, { ListIssuesParams, ListIssuesResponse, IssueListItem } from '@/services/api';

export interface UseInfiniteIssuesParams extends Omit<ListIssuesParams, 'cursor'> {}

export const useInfiniteIssues = (params: UseInfiniteIssuesParams): {
  items: IssueListItem[];
  fetchNextPage: () => Promise<InfiniteData<{ items: IssueListItem[]; nextCursor?: string | null }> | undefined>;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
  data: InfiniteData<{ items: IssueListItem[]; nextCursor?: string | null }> | undefined;
} => {
  const queryKey = useMemo(() => [
    'issues',
    {
      search: params.search || '',
      projectId: params.projectId || '',
      labels: (params.labels || []).slice().sort().join(','),
      assigneeId: params.assigneeId || '',
      createdBy: params.createdBy || 'me',
      status: params.status || '',
      limit: params.limit || 5,
      sort: params.sort || 'newest',
    },
  ], [params.search, params.projectId, params.labels, params.assigneeId, params.createdBy, params.status, params.limit, params.sort]);

  const query = useInfiniteQuery(
    {
      queryKey,
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }: { pageParam?: string | null }) => {
        try {
          const cursor = typeof pageParam === 'string' ? pageParam : null;
          // If a projectId is provided, prefer GitLab issues proxy
          const res = params.projectId
            ? await api.listGitLabIssues(params.projectId, { ...params, cursor })
            : await api.listGitLabIssuesGlobal({ ...params, cursor });
          if (!res.success || !res.data) {
            // eslint-disable-next-line no-console
            console.error('Issues fetch failed', res.error);
            return { items: [], nextCursor: null };
          }
          const items = Array.isArray(res.data.items) ? (res.data.items as IssueListItem[]) : [];
          const nextCursor = (res.data as ListIssuesResponse).nextCursor ?? null;
          return { items, nextCursor };
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Issues fetch error', e);
          return { items: [], nextCursor: null };
        }
      },
      getNextPageParam: (lastPage: { items: IssueListItem[]; nextCursor?: string | null }) => lastPage.nextCursor ?? undefined,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    }
  ) as any as {
    data: InfiniteData<{ items: IssueListItem[]; nextCursor?: string | null }> | undefined;
    fetchNextPage: () => Promise<InfiniteData<{ items: IssueListItem[]; nextCursor?: string | null }> | undefined>;
    hasNextPage: boolean | undefined;
    isFetchingNextPage: boolean;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
    isFetching: boolean;
  };

  const flatItems: IssueListItem[] = useMemo(
    () => (query.data?.pages || []).flatMap((p: { items: IssueListItem[] }) => p.items),
    [query.data]
  );

  return { ...query, items: flatItems };
};

export default useInfiniteIssues;
