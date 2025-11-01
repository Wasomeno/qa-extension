import React from 'react';
import api, { GitLabIssueNote, IssueListItem } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/ui/button';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/src/components/ui/ui/accordion';
import { useUsersInProjectQuery } from '@/hooks/use-users-in-project-query';
import { useProjectLabelsQuery } from '@/hooks/use-project-labels-query';
import IssueLabelsSelect from './issue-labels-select';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/ui/radio-group';
import { Textarea } from '@/src/components/ui/ui/textarea';
import { Alert } from '@/src/components/ui/ui/alert';
import { Label } from '@/src/components/ui/ui/label';
import { cn } from '@/lib/utils';

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

  const issueQuery = useQuery({
    queryKey: ['issue', projectId, iid],
    queryFn: () => api.getGitLabIssue(projectId, iid),
    enabled: !!projectId && !!iid,
  });
  const issueNotesQuery = useQuery<GitLabIssueNote[]>({
    queryKey: ['issue', projectId, iid, 'notes'],
    queryFn: async () => {
      const resp = await api.getGitLabIssueNotes(
        projectId as string | number,
        iid as number
      );
      if (!resp.success) {
        throw new Error(resp.error || 'Failed to load comments');
      }
      const payload = resp.data;
      const notes: GitLabIssueNote[] = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as any)?.items)
          ? ((payload as any)?.items as GitLabIssueNote[])
          : Array.isArray((payload as any)?.notes)
            ? ((payload as any)?.notes as GitLabIssueNote[])
            : [];
      return notes.filter(
        note => note && typeof note.id !== 'undefined' && !note.system
      );
    },
    enabled: !!projectId && !!iid,
  });
  const usersInProjectQuery = useUsersInProjectQuery(projectId);
  const projectLabels = useProjectLabelsQuery(projectId);

  const issueDetail = issueQuery.data?.data;
  const issueNotes = React.useMemo(() => {
    const notes = issueNotesQuery.data ?? [];
    return [...notes].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [issueNotesQuery.data]);
  const issueNotesError =
    issueNotesQuery.error instanceof Error
      ? issueNotesQuery.error.message
      : issueNotesQuery.error
        ? String(issueNotesQuery.error)
        : null;
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
  const [evidenceAccordionValue, setEvidenceAccordionValue] = React.useState<
    string | undefined
  >(undefined);

  // Evidence state
  const [evidenceStatus, setEvidenceStatus] = React.useState<
    'passed' | 'not_passed'
  >('passed');
  const [evidenceMessage, setEvidenceMessage] = React.useState('');
  const [evidenceSubmitting, setEvidenceSubmitting] = React.useState(false);
  const [evidenceError, setEvidenceError] = React.useState<string | null>(null);
  const [evidenceSuccess, setEvidenceSuccess] = React.useState<string | null>(
    null
  );
  const evidenceMessageRef = React.useRef<HTMLTextAreaElement>(null);
  const [pastingImage, setPastingImage] = React.useState(false);
  const [pasteError, setPasteError] = React.useState<string | null>(null);
  const [issueDescription, setIssueDescription] = React.useState<string>('');
  const [descriptionSaving, setDescriptionSaving] = React.useState(false);
  const [descriptionError, setDescriptionError] = React.useState<string | null>(
    null
  );
  const descriptionRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (issueDetail?.labels) {
      setSelectedLabels(issueDetail.labels);
    }
  }, [issueDetail?.labels]);

  React.useEffect(() => {
    if (
      (evidenceError || evidenceSuccess) &&
      evidenceAccordionValue !== 'evidence'
    ) {
      setEvidenceAccordionValue('evidence');
    }
  }, [evidenceAccordionValue, evidenceError, evidenceSuccess]);

  React.useEffect(() => {
    if (typeof issueDetail?.description === 'string') {
      setIssueDescription(issueDetail.description);
    } else {
      setIssueDescription('');
    }
  }, [issueDetail?.description]);

  const evidenceSummary = React.useMemo(() => {
    if (evidenceSuccess) {
      return 'Submitted';
    }
    return evidenceStatus === 'not_passed' ? 'Not passed' : '';
  }, [evidenceStatus, evidenceSuccess]);

  const handleLabelsChange = (newLabels: string[]) => {
    setSelectedLabels(newLabels);
    setLabelsChanged(true);
  };

  const handleSaveLabels = async () => {
    if (!projectId || !iid) return;
    setSavingLabels(true);
    try {
      await api.updateGitLabIssue(projectId, iid, {
        labels: selectedLabels,
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

  // Evidence handlers
  const handleEvidenceClear = () => {
    setEvidenceMessage('');
    setEvidenceError(null);
    setEvidenceSuccess(null);
    setPasteError(null);
  };

  // Clipboard paste handler for evidence textarea: uploads image and inserts Markdown
  const handleEvidencePaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    try {
      const cd = e.clipboardData;
      if (!cd) return;
      const files: File[] = [];
      if (cd.items && cd.items.length) {
        for (const item of Array.from(cd.items)) {
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f && f.type && f.type.startsWith('image/')) files.push(f);
          }
        }
      }
      if (!files.length && cd.files && cd.files.length) {
        for (const f of Array.from(cd.files)) {
          if (f.type && f.type.startsWith('image/')) files.push(f);
        }
      }
      if (!files.length) return; // let default paste proceed

      // Intercept paste to upload image
      e.preventDefault();
      setPastingImage(true);
      setPasteError(null);

      const file = files[0];
      const resp = await api.uploadFile(file, 'screenshot');
      if (resp.success && (resp.data as any)?.url) {
        const url = (resp.data as any).url as string;
        const el = evidenceMessageRef.current;
        const v = evidenceMessage || '';
        const start = el?.selectionStart ?? v.length;
        const end = el?.selectionEnd ?? start;
        const before = v.slice(0, start);
        const after = v.slice(end);
        const insertion =
          (before.endsWith('\n') ? '' : '\n') +
          `![pasted-image](${url})` +
          '\n';
        const newText = before + insertion + after;
        setEvidenceMessage(newText);
        setTimeout(() => {
          try {
            el?.focus();
            const pos = before.length + insertion.length;
            el?.setSelectionRange(pos, pos);
          } catch {}
        }, 0);
      } else {
        setPasteError((resp as any)?.error || 'Image upload failed');
      }
    } catch (err: any) {
      setPasteError(err?.message || 'Image upload failed');
    } finally {
      setPastingImage(false);
    }
  };

  const handleEvidenceSubmit = async () => {
    if (!projectId || !iid || evidenceSubmitting) return;

    setEvidenceSubmitting(true);
    setEvidenceError(null);

    try {
      const prefix =
        evidenceStatus === 'passed'
          ? '✅ Evidence (Passed):'
          : '❌ Evidence (Not Passed):';

      // Format message with images on new lines for better GitLab rendering
      const message = evidenceMessage || '';
      const body = message.trim() ? `${prefix} ${message}`.trim() : prefix;

      const resp = await api.addGitLabIssueNote(projectId, iid, body);

      if (!resp.success) {
        throw new Error(resp.error || 'Failed to add evidence');
      }

      const statusText = evidenceStatus === 'passed' ? 'Passed' : 'Not Passed';
      setEvidenceSuccess(`Evidence submitted successfully (${statusText})`);
      issueNotesQuery.refetch();

      // Clear form after successful submission
      setTimeout(() => {
        setEvidenceMessage('');
        setEvidenceSuccess(null);
        setPasteError(null);
      }, 2000);
    } catch (err) {
      console.error('Add evidence failed:', err);
      setEvidenceError(
        err instanceof Error ? err.message : 'Failed to add evidence'
      );
    } finally {
      setEvidenceSubmitting(false);
    }
  };

  const md = React.useMemo(() => {
    const inst = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
    try {
      (inst as any).use(taskLists as any, {
        label: true,
        labelAfter: true,
        enabled: true,
      });
    } catch {}
    inst.renderer.rules.hr = () =>
      '<hr class="border-neutral-200 opacity-60 rounded-full" />';
    inst.renderer.rules.table_open = () =>
      '<div class="rounded-md border border-neutral-200 overflow-hidden"><table class="w-full rounded-md text-xs border-collapse">';
    inst.renderer.rules.table_close = () => '</table></div>';
    inst.renderer.rules.thead_open = () =>
      '<thead class="bg-neutral-50 text-neutral-600 font-medium">';
    inst.renderer.rules.tbody_open = () =>
      '<tbody class="divide-y divide-neutral-200">';
    inst.renderer.rules.tr_open = () =>
      '<tr class="hover:bg-neutral-50 transition-colors">';
    inst.renderer.rules.th_open = () =>
      '<th class="px-3 py-2 text-left font-medium border border-neutral-200 bg-neutral-100">';
    inst.renderer.rules.td_open = () =>
      '<td class="px-3 py-2 align-top border border-neutral-200">';
    inst.renderer.rules.bullet_list_open = (
      tokens,
      idx,
      options,
      env,
      self
    ) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const classes = existing.split(/\s+/).filter(Boolean);
      const isTaskList =
        classes.includes('task-list') || classes.includes('contains-task-list');
      const base = classes.join(' ');
      const className = [
        base,
        isTaskList
          ? 'list-none pl-0 space-y-1 text-[12px] text-neutral-700'
          : 'list-disc pl-5 space-y-1 text-[12px] text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };
    inst.renderer.rules.ordered_list_open = (
      tokens,
      idx,
      options,
      env,
      self
    ) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const base = existing.split(/\s+/).filter(Boolean).join(' ');
      const className = [
        base,
        'list-decimal pl-5 space-y-1 text-[12px] text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };
    inst.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const classes = existing.split(/\s+/).filter(Boolean);
      const base = classes.join(' ');
      const isTaskItem = classes.includes('task-list-item');
      const className = [
        base,
        isTaskItem
          ? 'flex items-center gap-2 text-neutral-700'
          : 'text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };
    return inst;
  }, []);

  const toggleTaskInMarkdown = React.useCallback(
    (markdown: string, taskIndex: number, checked: boolean) => {
      if (!markdown) return markdown;
      let occurrence = -1;
      return markdown.replace(
        /^(\s*[-*+]\s+)\[( |x|X)\]/gm,
        (match, prefix, marker) => {
          occurrence += 1;
          if (occurrence === taskIndex) {
            return `${prefix}${checked ? '[x]' : '[ ]'}`;
          }
          return `${prefix}[${marker}]`;
        }
      );
    },
    []
  );

  const handleChecklistCheckboxChange = React.useCallback(
    async (event: Event) => {
      if (descriptionSaving) return;

      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox') return;

      event.stopPropagation();

      const index = Number(target.dataset.taskIndex);
      if (!Number.isFinite(index) || index < 0) return;
      if (projectId == null || typeof iid !== 'number') return;

      const currentDescription = issueDescription ?? '';
      const nextDescription = toggleTaskInMarkdown(
        currentDescription,
        index,
        target.checked
      );

      if (nextDescription === currentDescription) {
        return;
      }

      setIssueDescription(nextDescription);
      setDescriptionSaving(true);
      setDescriptionError(null);

      try {
        const resp = await api.updateGitLabIssue(projectId, iid, {
          description: nextDescription,
        });
        if (!resp.success) {
          throw new Error(resp.error || 'Failed to update description');
        }
        issueQuery.refetch();
      } catch (err) {
        console.error('Failed to update GitLab description:', err);
        target.checked = !target.checked;
        setIssueDescription(currentDescription);
        setDescriptionError(
          err instanceof Error
            ? err.message
            : 'Failed to update checklist state'
        );
      } finally {
        setDescriptionSaving(false);
      }
    },
    [
      descriptionSaving,
      iid,
      issueDescription,
      issueQuery,
      projectId,
      toggleTaskInMarkdown,
    ]
  );

  React.useEffect(() => {
    const container = descriptionRef.current;
    if (!container) return;

    const checkboxes = Array.from(
      container.querySelectorAll('input[type="checkbox"]')
    ) as HTMLInputElement[];

    checkboxes.forEach((checkbox, index) => {
      checkbox.dataset.taskIndex = String(index);
      if (descriptionSaving) {
        checkbox.setAttribute('disabled', 'true');
      } else {
        checkbox.removeAttribute('disabled');
      }
      checkbox.disabled = descriptionSaving;
      checkbox.addEventListener('change', handleChecklistCheckboxChange);
    });

    return () => {
      checkboxes.forEach(checkbox => {
        checkbox.removeEventListener('change', handleChecklistCheckboxChange);
      });
    };
  }, [handleChecklistCheckboxChange, descriptionSaving, issueDescription]);

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
    <div className="px-6">
      <Accordion type="single" className="py-2" collapsible>
        <AccordionItem value="assignees" className="border-none">
          <AccordionTrigger className="px-0 py-2 text-xs font-medium text-gray-700 hover:no-underline">
            <div className="flex items-center justify-between w-full pr-2">
              <span>Assignees</span>
              <div className="flex items-center gap-1.5">
                {issueDetail?.assignees?.[0] ? (
                  <>
                    {issueDetail.assignees[0].avatar_url ? (
                      <img
                        src={issueDetail.assignees[0].avatar_url}
                        alt={issueDetail.assignees[0].name}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-neutral-300 flex items-center justify-center text-[8px] font-medium text-neutral-600">
                        {issueDetail.assignees[0].name
                          ?.substring(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] text-neutral-700">
                      {issueDetail.assignees[0].name}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-neutral-500">
                    No assignees
                  </span>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <hr className="m-0 border-neutral-100" />
      <Accordion type="single" className="py-2" collapsible>
        <AccordionItem value="labels" className="border-none">
          <AccordionTrigger className="px-0 py-2 text-xs font-medium text-gray-700 hover:no-underline">
            <div className="flex items-center justify-between w-full pr-2">
              <span>Labels</span>
              <div className="flex items-center gap-1.5">
                {selectedLabels.length > 0 ? (
                  <>
                    {(() => {
                      const firstLabel = labelOptions.find(
                        l => l.name === selectedLabels[0]
                      );
                      return (
                        <>
                          {firstLabel?.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: firstLabel.color }}
                            />
                          )}
                          <span className="text-[11px] text-neutral-700">
                            {selectedLabels[0]}
                          </span>
                          {selectedLabels.length > 1 && (
                            <span className="text-[11px] text-neutral-500">
                              +{selectedLabels.length - 1}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <span className="text-[11px] text-neutral-500">
                    No labels
                  </span>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2" onClick={e => e.stopPropagation()}>
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <hr className="m-0 border-neutral-100" />
      <Accordion
        type="single"
        defaultChecked={false}
        collapsible
        value={evidenceAccordionValue}
        onValueChange={value => setEvidenceAccordionValue(value || undefined)}
        className="py-2"
      >
        <AccordionItem value="evidence" className="border-none">
          <AccordionTrigger className="px-0 py-2 text-xs font-medium text-gray-700 hover:no-underline">
            <span>Add Evidence</span>
            {evidenceSummary ? (
              <span className="text-[11px] font-normal text-neutral-500">
                {evidenceSummary}
              </span>
            ) : null}
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pt-0">
            {evidenceError && (
              <Alert variant="destructive">
                <div className="text-xs">{evidenceError}</div>
              </Alert>
            )}

            {evidenceSuccess && (
              <Alert className="bg-green-50 border-green-200 text-green-800">
                <div className="text-xs flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
                    <span className="text-neutral-800 text-[8px] leading-none">
                      ✓
                    </span>
                  </div>
                  {evidenceSuccess}
                </div>
              </Alert>
            )}

            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1 block">
                Result
              </Label>
              <RadioGroup
                className="flex items-start gap-2"
                value={evidenceStatus}
                onValueChange={(v: any) => setEvidenceStatus(v)}
                disabled={!!evidenceSuccess}
              >
                <div
                  className={cn(
                    'rounded border border-neutral-200 px-2 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors',
                    evidenceStatus === 'passed'
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'hover:bg-gray-50'
                  )}
                >
                  <RadioGroupItem
                    id="evidence-pass"
                    value="passed"
                    className={cn(
                      'w-3 h-3',
                      evidenceStatus === 'passed'
                        ? 'border-emerald-500 text-emerald-500'
                        : 'border-neutral-300 text-neutral-400'
                    )}
                  />
                  <Label
                    htmlFor="evidence-pass"
                    className={cn(
                      'text-xs cursor-pointer',
                      evidenceStatus === 'passed'
                        ? 'text-emerald-600 font-medium'
                        : 'text-gray-700'
                    )}
                  >
                    Passed
                  </Label>
                </div>
                <div
                  className={cn(
                    'rounded border border-neutral-200 px-2 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors',
                    evidenceStatus === 'not_passed'
                      ? 'bg-rose-50 border-rose-200'
                      : 'hover:bg-gray-50'
                  )}
                >
                  <RadioGroupItem
                    id="evidence-npass"
                    value="not_passed"
                    className={cn(
                      'w-3 h-3',
                      evidenceStatus === 'not_passed'
                        ? 'border-rose-500 text-rose-500'
                        : 'border-neutral-300 text-neutral-400'
                    )}
                  />
                  <Label
                    htmlFor="evidence-npass"
                    className={cn(
                      'text-xs cursor-pointer',
                      evidenceStatus === 'not_passed'
                        ? 'text-rose-600 font-medium'
                        : 'text-gray-700'
                    )}
                  >
                    Not passed
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1 block">
                Message
              </Label>
              <Textarea
                className="h-16 resize-none text-xs"
                placeholder="Add a short note, paste a link, or paste an image"
                value={evidenceMessage}
                onChange={e => setEvidenceMessage(e.target.value)}
                onPaste={handleEvidencePaste}
                ref={evidenceMessageRef}
                disabled={!!evidenceSuccess || pastingImage}
              />
              {pastingImage && (
                <div className="mt-2 text-xs text-neutral-600 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                  Uploading image…
                </div>
              )}
              {pasteError && (
                <div className="mt-2 text-xs text-red-600">{pasteError}</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={handleEvidenceClear}
                disabled={evidenceSubmitting || !!evidenceSuccess}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={handleEvidenceSubmit}
                disabled={
                  evidenceSubmitting || !!evidenceSuccess || !projectId || !iid
                }
              >
                {evidenceSubmitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {issueQuery.isLoading && (
        <div className="text-xs text-neutral-500">Loading issue details…</div>
      )}
      {issueDescription && (
        <>
          <hr className="mb-4 border-neutral-100" />
          {descriptionError && (
            <Alert variant="destructive">
              <div className="text-xs">{descriptionError}</div>
            </Alert>
          )}
          {descriptionSaving && (
            <div className="text-[11px] text-neutral-400 mb-2">
              Updating checklist…
            </div>
          )}
          <div
            ref={descriptionRef}
            className="tiptap leading-5 space-y-4 text-[12px] focus:outline-none"
            dangerouslySetInnerHTML={{
              __html: md.render(issueDescription),
            }}
          />
        </>
      )}
      <div className="space-y-3 mt-4">
        <div className="text-xs font-medium text-gray-700">Comments</div>
        {issueNotesQuery.isLoading ? (
          <div className="text-xs text-neutral-500">Loading comments…</div>
        ) : issueNotesQuery.isError ? (
          <Alert variant="destructive">
            <div className="text-xs">
              {issueNotesError || 'Failed to load comments'}
            </div>
          </Alert>
        ) : issueNotes.length === 0 ? (
          <div className="text-xs text-neutral-500">
            No comments on this issue yet.
          </div>
        ) : (
          <div className="space-y-3">
            {issueNotes.map(note => (
              <div
                key={note.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-medium text-gray-700">
                    {note.author?.name ||
                      note.author?.username ||
                      'Unknown user'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {new Date(note.created_at).toLocaleString()}
                  </div>
                </div>
                <div
                  className="tiptap mt-2 leading-5 space-y-2 text-[12px]"
                  dangerouslySetInnerHTML={{
                    __html: md.render(note.body || ''),
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IssueDetail;
