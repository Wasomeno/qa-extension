import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/src/components/ui/ui/dialog';
import { Badge } from '@/src/components/ui/ui/badge';
import AvatarGroup from '@/components/issue-list/AvatarGroup';

interface IssueDetailDialogProps {
  issue: any | null;
  onOpenChange: (open: boolean) => void;
  portalContainer?: Element | null;
}

export const IssueDetailDialog: React.FC<IssueDetailDialogProps> = ({
  issue,
  onOpenChange,
  portalContainer,
}) => {
  const renderAssigneesSection = (issue: any) => {
    if (!issue) return null;

    const anyItem: any = issue as any;
    const assignees = Array.isArray(anyItem.assignees)
      ? anyItem.assignees
      : issue.assignee
        ? [issue.assignee]
        : [];

    return assignees.length ? (
      <div>
        <div className="text-xs font-medium text-gray-700 mb-1">Assignees</div>
        <AvatarGroup
          users={assignees as any}
          size={28}
          portalContainer={portalContainer || undefined}
        />
      </div>
    ) : null;
  };

  return (
    <Dialog open={!!issue} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" container={portalContainer || undefined}>
        {issue && (
          <div>
            <DialogHeader>
              <DialogTitle className="text-base leading-snug">
                {issue.title}
              </DialogTitle>
              <DialogDescription className="text-xs">
                #{issue.number ?? '—'} ·{' '}
                {issue.project?.name ?? 'Unknown project'} · by{' '}
                {issue.author?.name ?? 'Unknown'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 space-y-3">
              {renderAssigneesSection(issue)}

              {issue.labels?.length ? (
                <div>
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Labels
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {issue.labels.map((l: string) => (
                      <Badge
                        key={l}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0.5"
                      >
                        {l}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="text-xs text-gray-500">
                Created {new Date(issue.createdAt).toLocaleString()}
              </div>

              {issue.description ? (
                <div>
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Description
                  </div>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-800">
                    {issue.description}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};