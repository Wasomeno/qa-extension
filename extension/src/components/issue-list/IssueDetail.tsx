import React from 'react';
import api, { IssueListItem } from '@/services/api';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/ui/button';
import { Copy, ChevronRight } from 'lucide-react';
import { RxOpenInNewWindow } from 'react-icons/rx';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/src/components/ui/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import { useUsersInProjectQuery } from '@/hooks/use-users-in-project-query';
import { useProjectLabelsQuery } from '@/hooks/use-project-labels-query';
import IssueLabelsSelect from './issue-labels-select';
import { Skeleton } from '@/src/components/ui/ui/skeleton';

interface IssueDetailProps {
  issue: IssueListItem | any;
  portalContainer?: Element | null;
}

const IssueDetail: React.FC<IssueDetailProps> = ({
  issue,
  portalContainer,
}) => {
  const projectId = issue?.project?.id;
  const iid = issue?.number;

  const checklistQuery = useQuery({
    queryKey: ['checklist', projectId, iid],
    queryFn: () => api.getGitLabIssueChecklist(projectId, iid),
    enabled: !!projectId && !!iid,
  });
  const issueQuery = useQuery({
    queryKey: ['issue', projectId, iid],
    queryFn: () => api.getGitLabIssue(projectId, iid),
    enabled: !!projectId && !!iid,
  });
  const usersInProjectQuery = useUsersInProjectQuery(projectId);
  const projectLabels = useProjectLabelsQuery(projectId);

  const issueDetail = issueQuery.data?.data;
  const userOptions = usersInProjectQuery.data?.data?.map(user => ({
    id: String(user.id),
    avatar: user.avatarUrl,
    name: user.name,
    username: user.username,
  }));
  const labelOptions = projectLabels.data?.data?.items || [];

  const [selectedLabels, setSelectedLabels] = React.useState<string[]>([]);
  const [labelsChanged, setLabelsChanged] = React.useState(false);
  const [savingLabels, setSavingLabels] = React.useState(false);

  React.useEffect(() => {
    if (issueDetail?.labels) {
      setSelectedLabels(issueDetail.labels);
    }
  }, [issueDetail?.labels]);

  const handleLabelsChange = (newLabels: string[]) => {
    setSelectedLabels(newLabels);
    setLabelsChanged(true);
  };

  const handleSaveLabels = async () => {
    if (!projectId || !iid) return;
    setSavingLabels(true);
    try {
      await api.updateGitLabIssue(projectId, iid, {
        labels: selectedLabels
      });
      setLabelsChanged(false);
      // Invalidate queries to refresh data
      issueQuery.refetch();
    } catch (error) {
      console.error('Failed to save labels:', error);
      // Reset to original labels on error
      setSelectedLabels(issueDetail?.labels || []);
      setLabelsChanged(false);
    } finally {
      setSavingLabels(false);
    }
  };

  const handleCancelLabels = () => {
    setSelectedLabels(issueDetail?.labels || []);
    setLabelsChanged(false);
  };

  const md = React.useMemo(() => {
    const inst = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
    try {
      (inst as any).use(taskLists as any, { label: true, labelAfter: true });
    } catch {}
    return inst;
  }, []);

  if (issueQuery.isLoading && !issueDetail) {
    return (
      <div className="py-4 px-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-4">
          <div>
            <Skeleton className="h-3 w-24 rounded-md mb-2" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div>
            <Skeleton className="h-3 w-20 rounded-md mb-2" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-[90%] rounded-md" />
          <Skeleton className="h-3 w-[85%] rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 px-6 ">
      <div className="flex flex-1 justify-between">
        <div className="flex flex-1">
          <div className="space-y-1">
            <div className="text-sm font-semibold leading-snug">
              {issueDetail?.title || issue.title}
            </div>
            <div className="text-[11px] text-neutral-500">
              #{iid ?? '—'} · {issue.project?.name ?? 'Unknown project'} · by{' '}
              {issue.author?.name ?? issueDetail?.author?.name ?? 'Unknown'}
            </div>
          </div>
        </div>
        <div className="flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button size="icon">
                  <Copy className="text-black" size={8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={-2} className="text-xs">
                Copy Link
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button size="icon">
                  <RxOpenInNewWindow className="text-black" size={8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={-2} className="text-xs">
                Open in Gitlab
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <hr className="my-4 border-neutral-100" />
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium mb-1">Assignees</div>
          <Select
            value={String(issueDetail?.assignees?.[0]?.id)}
            disabled={issueQuery.isLoading}
          >
            <SelectTrigger className="text-xs glass-input h-8">
              <SelectValue placeholder="Select an assignee (optional)" />
            </SelectTrigger>
            <SelectContent
              className="text-xs rounded-lg bg-white"
              container={portalContainer || undefined}
            >
              {userOptions?.length === 0 ? (
                <SelectItem
                  className="cursor-pointer text-xs"
                  value="#"
                  disabled
                >
                  {issueDetail?.iid
                    ? 'Loading users...'
                    : 'Select a project first'}
                </SelectItem>
              ) : (
                userOptions?.map(user => (
                  <SelectItem
                    className="cursor-pointer text-xs"
                    key={user.id}
                    value={user.id}
                  >
                    <div className="flex items-center gap-2">
                      {user.avatar && (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-4 h-4 rounded-full"
                        />
                      )}
                      <span>{user.name}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <div className="text-[11px] font-medium text-black/70 mb-1">Labels</div>
          <IssueLabelsSelect
            selectedLabels={selectedLabels}
            labels={labelOptions}
            onChange={handleLabelsChange}
            portalContainer={portalContainer}
            isDirty={labelsChanged}
            onSave={handleSaveLabels}
            onCancel={handleCancelLabels}
            saving={savingLabels}
          />
        </div>
      </div>

      <hr className="my-4 border-neutral-100" />
      {issueQuery.isLoading && (
        <div className="text-xs text-neutral-500">Loading issue details…</div>
      )}
      {checklistQuery.data?.data?.items?.length ? (
        <div>
          <div className="text-xs font-medium mb-1">Checklist</div>
          <div className="space-y-1">
            {checklistQuery.data?.data?.items?.map((c, idx) => (
              <label
                key={`${c.line}-${idx}`}
                className="flex items-start gap-2 text-xs"
              >
                <Checkbox
                  checked={c.checked}
                  className="mt-0.5 h-3.5 w-3.5 border-neutral-200"
                />
                <span className="leading-4">{c.text}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <hr className="my-4 border-neutral-100" />
      {issueDetail?.description && (
        <div
          className="tiptap leading-5 space-y-2 text-[12px] focus:outline-none"
          dangerouslySetInnerHTML={{
            __html: md.render(issueDetail?.description),
          }}
        />
      )}
    </div>
  );
};

export default IssueDetail;
