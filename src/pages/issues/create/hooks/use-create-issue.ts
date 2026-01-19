import { createIssue, CreateIssueRequest } from '@/api/issue';
import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';

export function useCreateIssue(
  options?: UseMutationOptions<any, Error, { projectId: number; request: CreateIssueRequest }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { projectId: number; request: CreateIssueRequest }) =>
      createIssue(data.projectId, data.request),
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      if (options?.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
  });
}
