import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createIssueComment,
  updateIssueComment,
  deleteIssueComment,
  CreateIssueCommentRequest,
  UpdateIssueCommentRequest,
} from '@/api/issue';
import { toast } from 'sonner';

export function useIssueCommentMutations(projectId: number, issueIid: number) {
  const queryClient = useQueryClient();
  const queryKey = ['issues', projectId, issueIid, 'comments'];

  const createMutation = useMutation({
    mutationFn: (data: CreateIssueCommentRequest) =>
      createIssueComment(projectId, issueIid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Comment added');
    },
    onError: () => {
      toast.error('Failed to add comment');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      commentId,
      data,
    }: {
      commentId: number;
      data: UpdateIssueCommentRequest;
    }) => updateIssueComment(projectId, issueIid, commentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Comment updated');
    },
    onError: () => {
      toast.error('Failed to update comment');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: number) =>
      deleteIssueComment(projectId, issueIid, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });

  return {
    createComment: createMutation.mutateAsync,
    updateComment: updateMutation.mutateAsync,
    deleteComment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
