import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createChildIssue, unlinkChildIssue, Issue } from '@/api/issue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Link as LinkIcon,
  Plus,
  ExternalLink,
  CheckCircle2,
  Circle,
  XCircle,
} from 'lucide-react';
import { AddChildModal } from './add-child-modal';
import { toast } from 'sonner';
import { ChildIssue } from '@/types/issues';
import { cn } from '@/lib/utils';
import { IssueFormState } from '@/pages/issues/create/components/issue-form-fields';

// Hook
import { useGetIssues } from '@/pages/issues/hooks/use-get-issues';

interface ChildIssuesListProps {
  parentIssue: Issue;
  portalContainer?: HTMLElement | null;
}

export const ChildIssuesList: React.FC<ChildIssuesListProps> = ({
  parentIssue,
  portalContainer,
}) => {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Extract child IIDs from the new issue structure
  const childIids = parentIssue.child?.items.map(item => item.iid) || [];

  const { data: childIssues, isLoading } = useGetIssues({
    projectIds: [parentIssue.project_id.toString()],
    issueIds: childIids,
  });

  const createChildMutation = useMutation({
    mutationFn: (targetIid?: number) =>
      createChildIssue(parentIssue.project_id, parentIssue.iid, {
        title: '', // placeholder, will be overridden by existing_child_iid if provided
        existing_child_iid: targetIid,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['issue', parentIssue.iid],
      });
      queryClient.invalidateQueries({
        queryKey: ['issues'],
      });
      toast.success('Child task linked successfully');
      setIsAddModalOpen(false);
    },
    onError: () => {
      toast.error('Failed to link child task');
    },
  });

  const createNewChildMutation = useMutation({
    mutationFn: (formState: IssueFormState) =>
      createChildIssue(parentIssue.project_id, parentIssue.iid, {
        title: formState.title,
        description: formState.description,
        assignee_ids: formState.selectedAssignee
          ? [parseInt(formState.selectedAssignee.id)]
          : [],
        labels: formState.selectedLabels.map(l => l.name),
        issue_type: 'task',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['issue', parentIssue.iid],
      });
      queryClient.invalidateQueries({
        queryKey: ['issues'],
      });
      toast.success('Child task created and linked');
      setIsAddModalOpen(false);
    },
    onError: () => {
      toast.error('Failed to create child task');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (childIid: number) =>
      unlinkChildIssue(parentIssue.project_id, parentIssue.iid, childIid),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['issue', parentIssue.iid],
      });
      queryClient.invalidateQueries({
        queryKey: ['issues'],
      });
      toast.success('Child task unlinked');
    },
    onError: () => {
      toast.error('Failed to unlink child task');
    },
  });

  const handleAddExisting = (issue: Issue) => {
    createChildMutation.mutate(issue.iid);
  };

  const handleCreateNew = (formState: IssueFormState) => {
    createNewChildMutation.mutate(formState);
  };

  const handleUnlink = (childIid: number) => {
    if (confirm('Are you sure you want to unlink this child task?')) {
      unlinkMutation.mutate(childIid);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          Child Tasks
          <span className="text-xs text-gray-400 font-normal">
            {childIssues?.length || 0}
          </span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setIsAddModalOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {childIssues && childIssues.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {childIssues.map((issue: ChildIssue) => (
              <div
                key={issue.id}
                className="group flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex-shrink-0',
                      issue.state === 'opened'
                        ? 'text-green-500'
                        : 'text-blue-500'
                    )}
                  >
                    {issue.state === 'opened' ? (
                      <Circle className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 font-medium truncate">
                        {issue.title}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        #{issue.iid}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                    onClick={() => window.open(issue.web_url, '_blank')}
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                    onClick={() => handleUnlink(issue.iid)}
                    disabled={unlinkMutation.isPending}
                    title="Unlink child task"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center flex flex-col w-full items-center justify-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-50 mb-3">
              <LinkIcon className="w-5 h-5 text-neutral-400" />
            </div>
            <h3 className="text-sm font-medium text-neutral-500">
              No child tasks
            </h3>
            <p className="text-xs text-neutral-400 mt-1 mb-4">
              Break down this issue into smaller tasks
            </p>
          </div>
        )}
      </div>
      <AddChildModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddExisting}
        onCreate={handleCreateNew}
        parentIssue={parentIssue as any}
        portalContainer={portalContainer}
      />
    </div>
  );
};
