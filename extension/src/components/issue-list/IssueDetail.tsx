import React from 'react';
import api, { IssueListItem } from '@/services/api';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/ui/button';
import { Copy } from 'lucide-react';
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
  const labelOptions = projectLabels.data?.data?.items.map(label => ({
    id: String(label.id),
    name: label.name,
    color: label.color,
  }));

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
      <div className="flex items-center gap-2">
        <div className="w-1/2">
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
        <div className="w-1/2">
          <div className="text-xs font-medium mb-1">Labels</div>
          <Select
            value={issueDetail?.labels?.[0]}
            disabled={projectLabels.isLoading}
          >
            <SelectTrigger className="text-xs glass-input h-8">
              <SelectValue placeholder="Select a label" />
            </SelectTrigger>
            <SelectContent
              className="text-xs rounded-lg bg-white"
              container={portalContainer || undefined}
              sideOffset={8}
              avoidCollisions={false}
            >
              {labelOptions?.length === 0 ? (
                <SelectItem className="text-xs hover:bg-none" value="#">
                  No Available Labels
                </SelectItem>
              ) : (
                labelOptions?.map(label => (
                  <SelectItem
                    className="cursor-pointer text-xs"
                    key={label.id}
                    value={label.id}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                        style={{
                          backgroundColor: label.color,
                        }}
                      />
                      {label.name}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
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
