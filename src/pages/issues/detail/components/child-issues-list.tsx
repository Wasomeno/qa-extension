import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIssueLink, Issue, createIssue } from '@/api/issue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Link as LinkIcon,
  Plus,
  ExternalLink,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { AddChildModal } from './add-child-modal';
import { toast } from 'sonner';
import { ChildIssue } from '@/types/issues';
import { cn } from '@/lib/utils';
import { IssueFormState } from '@/pages/issues/create/components/issue-form-fields';
// MockIssue was removed from types/issues.ts, using Issue from api/issue instead
// check if AddChildModal can handle it

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
    projectId: parentIssue.project_id.toString(),
    issueIds: childIids,
  });

  const createLinkMutation = useMutation({
    mutationFn: (targetIid: string) =>
      createIssueLink(parentIssue.project_id, parentIssue.iid, targetIid),
    onSuccess: () => {
      // We need to invalidate the parent issue because the 'child' field is on it
      queryClient.invalidateQueries({
        queryKey: ['issue', parentIssue.iid],
      });
      // Also invalidate child issues list (which uses 'issues' key)
      // Actually useGetIssues uses 'issues' key.
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

  const createIssueMutation = useMutation({
    mutationFn: (formState: IssueFormState) =>
      createIssue(parentIssue.project_id, {
        title: formState.title,
        description: formState.description,
        assignee_ids: formState.selectedAssignee
          ? [parseInt(formState.selectedAssignee.id)]
          : [],
        labels: formState.selectedLabels.map(l => l.name),
      }),
    onSuccess: async newIssue => {
      if (newIssue.data && newIssue.data.iid) {
        await createIssueLink(
          parentIssue.project_id,
          parentIssue.iid,
          newIssue.data.iid.toString()
        );
        // We need to invalidate the parent issue because the 'child' field is on it
        queryClient.invalidateQueries({
          queryKey: ['issue', parentIssue.iid],
        });
        queryClient.invalidateQueries({
          queryKey: ['child-issues', parentIssue.project_id, parentIssue.iid],
        });
        toast.success('Child task created and linked');
        setIsAddModalOpen(false);
      }
    },
    onError: () => {
      toast.error('Failed to create child task');
    },
  });

  const handleAddExisting = (issue: Issue) => {
    createLinkMutation.mutate(issue.iid.toString());
  };

  const handleCreateNew = (formState: IssueFormState) => {
    createIssueMutation.mutate(formState);
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

  // no derivation needed, hook provides data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          Child Tasks
          <span className="text-xs text-gray-400 font-normal">
            {childIssues.length}
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
        {childIssues.length > 0 ? (
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
                      // 'state' might differ in Issue vs IssueLink, but Issue has 'state'
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
                  {/* Unlink removed as we don't have link ID anymore */}
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
