import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiLoader,
  FiAlertTriangle,
  FiCheckCircle,
  FiZap,
  FiExternalLink,
} from 'react-icons/fi';
import {
  Bold as IconBold,
  Italic as IconItalic,
  Code as IconInlineCode,
  Link as IconLink,
  Eye as IconEye,
  ChevronRight,
} from 'lucide-react';

import { MergeRequestData } from '@/types/messages';
import { LuFolderGit2, LuGitBranch } from 'react-icons/lu';
import { useMergeRequestCreator } from '@/hooks/useMergeRequestCreator';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { Button } from '@/src/components/ui/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/src/components/ui/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/src/components/ui/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Switch } from '@/src/components/ui/ui/switch';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import { Label } from '@/src/components/ui/ui/label';
import { useQuery } from '@tanstack/react-query';
import { IoPersonOutline } from 'react-icons/io5';
import { PiSlackLogoLight } from 'react-icons/pi';
import { apiService } from '@/services/api';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { getLastUsedPreset } from '@/utils/mrPresets';

const PLACEHOLDER_FEATURES = new Set(['Feature A', 'Feature B', 'Feature C']);

export function extractFeatureList(description?: string): string[] {
  if (!description) return [];

  const lines = description.split('\n');
  const features: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!inSection) {
      if (trimmed.toLowerCase().includes('feature updated')) {
        inSection = true;
      }
      continue;
    }

    if (trimmed.startsWith('---')) {
      break;
    }

    const taskMatch = rawLine.match(/^- \[[ xX]\]\s*(.*)$/);
    if (taskMatch) {
      const text = taskMatch[1].trim();
      if (text && !PLACEHOLDER_FEATURES.has(text)) {
        features.push(text);
      }
    }
  }

  if (features.length > 5) {
    const overflow = features.length - 5;
    return [...features.slice(0, 5), `...and ${overflow} more`];
  }

  return features;
}

interface CompactMergeRequestCreatorProps {
  initialData?: Partial<MergeRequestData>;
  onSubmit?: (mr: MergeRequestData) => void;
  onCancel?: () => void;
  portalContainer?: Element | null;
  resetTrigger?: number; // Increment this to trigger form reset
}

export const CompactMergeRequestCreator: React.FC<
  CompactMergeRequestCreatorProps
> = ({
  initialData = {},
  onSubmit,
  onCancel,
  portalContainer,
  resetTrigger,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const descriptionTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [slackEnabled, setSlackEnabled] = React.useState(
    !!(initialData as any)?.slackChannelId
  );

  // AI description generation state
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [pastingImage, setPastingImage] = React.useState(false);
  const [pasteError, setPasteError] = React.useState<string | null>(null);

  // Markdown editor state
  const [mdTab, setMdTab] = React.useState<'write' | 'preview'>('write');

  // Track open state for each pill popover
  const [openProject, setOpenProject] = React.useState(false);
  const [openSourceBranch, setOpenSourceBranch] = React.useState(false);
  const [openTargetBranch, setOpenTargetBranch] = React.useState(false);
  const [openAssignees, setOpenAssignees] = React.useState(false);
  const [openReviewers, setOpenReviewers] = React.useState(false);
  const [openSlack, setOpenSlack] = React.useState(false);

  const anyPillOpen =
    openProject ||
    openSourceBranch ||
    openTargetBranch ||
    openAssignees ||
    openReviewers ||
    openSlack;

  const suppressOpenRef = React.useRef({
    project: false,
    sourceBranch: false,
    targetBranch: false,
    assignees: false,
    reviewers: false,
    slack: false,
  });

  const closeAllPills = () => {
    setOpenProject(false);
    setOpenSourceBranch(false);
    setOpenTargetBranch(false);
    setOpenAssignees(false);
    setOpenReviewers(false);
    setOpenSlack(false);
  };

  const handleTriggerPointerDown = (
    event: React.PointerEvent,
    openState: boolean,
    key:
      | 'project'
      | 'sourceBranch'
      | 'targetBranch'
      | 'assignees'
      | 'reviewers'
      | 'slack',
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!openState) return;
    event.preventDefault();
    suppressOpenRef.current[key] = true;
    setter(false);
  };

  const createOnOpenChange =
    (
      key:
        | 'project'
        | 'sourceBranch'
        | 'targetBranch'
        | 'assignees'
        | 'reviewers'
        | 'slack',
      setter: React.Dispatch<React.SetStateAction<boolean>>
    ) =>
    (next: boolean) => {
      if (next && suppressOpenRef.current[key]) {
        suppressOpenRef.current[key] = false;
        return;
      }
      suppressOpenRef.current[key] = false;
      setter(next);
    };

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    errors,
    watchedValues,
    isLoading,
    projects,
    branches,
    users,
    error,
    success,
    usedPreset,
    lastCreatedMr,
    slackNotification,
  } = useMergeRequestCreator({
    initialData,
    onSubmit,
    onCancel,
  });

  // Reset form after successful creation
  React.useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        reset();
      }, 1500); // Wait 1.5s to show success message before resetting
      return () => clearTimeout(timer);
    }
  }, [success, reset]);

  // Reset form when resetTrigger changes (navigating away from this feature)
  React.useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      reset();
    }
  }, [resetTrigger, reset]);

  const descriptionField = register('description');
  const [selectedProjectName, setSelectedProjectName] =
    React.useState<string>('');

  React.useEffect(() => {
    if (!watchedValues.projectId) {
      setSelectedProjectName('');
      return;
    }
    const match = projects.find(p => p.id === watchedValues.projectId);
    if (match) {
      setSelectedProjectName(match.name);
      return;
    }
    try {
      const preset = getLastUsedPreset(watchedValues.projectId);
      if (preset?.projectName) {
        setSelectedProjectName(preset.projectName);
        return;
      }
    } catch (error) {
      console.warn('Failed to load MR preset for project name:', error);
    }
    setSelectedProjectName(watchedValues.projectId);
  }, [projects, watchedValues.projectId]);

  // Markdown helpers for toolbar
  const getSel = () => {
    const el = descriptionTextareaRef.current;
    if (!el) return null;
    const v = (watchedValues.description || '') as string;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    return { el, v, start, end };
  };

  const wrapSelection = (left: string, right: string) => {
    const s = getSel();
    if (!s) return;
    const { el, v, start, end } = s;
    const sel = v.slice(start, end) || '';
    const before = v.slice(0, start);
    const after = v.slice(end);
    const placeholder = sel || 'text';
    const snippet = `${left}${placeholder}${right}`;
    const newText = before + snippet + after;
    const caretStart = before.length + left.length;
    const caretEnd = caretStart + placeholder.length;
    setValue('description', newText, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caretStart, caretEnd);
    }, 0);
  };

  const prefixLine = (prefix: string) => {
    const s = getSel();
    if (!s) return;
    const { el, v, start } = s;
    const lineStart = v.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const newText = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    const caret = start + prefix.length;
    setValue('description', newText, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const insertCodeBlock = () => {
    const s = getSel();
    if (!s) return;
    const { el, v, start, end } = s;
    const selected = v.slice(start, end);
    const before = v.slice(0, start);
    const after = v.slice(end);
    const snippet = '```\n' + selected + '\n```';
    const newText = before + snippet + after;
    const caret = before.length + 4 + selected.length;
    setValue('description', newText, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const insertTable = () => {
    const s = getSel();
    if (!s) return;
    const { el, v, start } = s;
    const tpl = '\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n';
    const newText = v.slice(0, start) + tpl + v.slice(start);
    const caret = start + tpl.length - 6;
    setValue('description', newText, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const insertLink = () => {
    const s = getSel();
    if (!s) return;
    const { el, v, start, end } = s;
    const url = window.prompt('Enter URL') || 'https://';
    const selected = v.slice(start, end) || 'link text';
    const before = v.slice(0, start);
    const after = v.slice(end);
    const snippet = `[${selected}](${url})`;
    const newText = before + snippet + after;
    const caret = before.length + snippet.length;
    setValue('description', newText, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  // Slack data (optional)
  const slackChannelsQuery = useQuery({
    queryKey: ['slack-channels'],
    queryFn: async () => {
      const res = await apiService.getSlackChannels();
      if (!res.success) throw new Error(res.error || 'Failed to load channels');
      return res.data || [];
    },
    staleTime: 300_000,
  });

  const slackUsersQuery = useQuery({
    queryKey: ['slack-users'],
    queryFn: async () => {
      const res = await apiService.getSlackUsers();
      if (!res.success) throw new Error(res.error || 'Failed to load users');
      return res.data || [];
    },
    staleTime: 300_000,
  });

  const getSlackChannelName = React.useCallback(
    (channelId?: string | null) => {
      if (!channelId) return '';
      const channel = (slackChannelsQuery.data || []).find(
        (c: any) => c.id === channelId
      );
      return channel ? `#${channel.name}` : `#${channelId}`;
    },
    [slackChannelsQuery.data]
  );

  const slackPreview = React.useMemo(() => {
    if (!slackEnabled || !watchedValues.slackChannelId) {
      return null;
    }

    const projectName =
      selectedProjectName ||
      projects.find(p => p.id === watchedValues.projectId)?.name ||
      watchedValues.projectId;

    const channelName = getSlackChannelName(watchedValues.slackChannelId);

    const selectedSlackUsers = (watchedValues.slackUserIds || []).map(id => {
      const slackUser = (slackUsersQuery.data || []).find(
        (u: any) => u.id === id
      );
      return slackUser ? `@${slackUser.name}` : `<@${id}>`;
    });

    const fallbackReviewers = (watchedValues.reviewerIds || [])
      .map(id => {
        const gitlabUser = users.find((u: any) => Number(u.id) === Number(id));
        if (!gitlabUser) return null;
        if (gitlabUser.username) {
          return `@${gitlabUser.username}`;
        }
        return gitlabUser.name || null;
      })
      .filter(Boolean) as string[];

    const mentions =
      selectedSlackUsers.length > 0 ? selectedSlackUsers : fallbackReviewers;

    const features = extractFeatureList(watchedValues.description || '');

    return {
      projectName,
      channelName,
      mentions,
      features,
      title: watchedValues.title || 'Unnamed merge request',
      branches:
        watchedValues.sourceBranch && watchedValues.targetBranch
          ? `${watchedValues.sourceBranch} → ${watchedValues.targetBranch}`
          : null,
    };
  }, [
    slackEnabled,
    watchedValues.slackChannelId,
    watchedValues.slackUserIds,
    watchedValues.description,
    watchedValues.title,
    watchedValues.sourceBranch,
    watchedValues.targetBranch,
    watchedValues.projectId,
    watchedValues.reviewerIds,
    projects,
    selectedProjectName,
    slackUsersQuery.data,
    users,
    getSlackChannelName,
  ]);

  const handleDescriptionPaste = React.useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      let handledImagePaste = false;
      try {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return;
        }

        const imageFiles: File[] = [];

        if (clipboard.items && clipboard.items.length) {
          for (const item of Array.from(clipboard.items)) {
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file && file.type && file.type.startsWith('image/')) {
                imageFiles.push(file);
              }
            }
          }
        }

        if (!imageFiles.length && clipboard.files && clipboard.files.length) {
          for (const file of Array.from(clipboard.files)) {
            if (file.type && file.type.startsWith('image/')) {
              imageFiles.push(file);
            }
          }
        }

        if (!imageFiles.length) {
          return;
        }

        event.preventDefault();
        handledImagePaste = true;
        setPastingImage(true);
        setPasteError(null);

        const file = imageFiles[0];
        const response = await apiService.uploadFile(file, 'screenshot');

        if (response.success && (response.data as any)?.url) {
          const url = (response.data as any).url as string;
          const textarea = descriptionTextareaRef.current;
          const currentValue =
            textarea?.value || watchedValues.description || '';
          const selectionStart =
            textarea?.selectionStart ?? currentValue.length;
          const selectionEnd = textarea?.selectionEnd ?? selectionStart;

          const before = currentValue.slice(0, selectionStart);
          const after = currentValue.slice(selectionEnd);
          const needsNewline = before.length > 0 && !before.endsWith('\n');
          const insertion = `${needsNewline ? '\n' : ''}![pasted-image](${url})\n`;
          const nextValue = before + insertion + after;

          setValue('description', nextValue, {
            shouldDirty: true,
            shouldValidate: true,
          });

          requestAnimationFrame(() => {
            try {
              textarea?.focus();
              const caret = before.length + insertion.length;
              textarea?.setSelectionRange(caret, caret);
            } catch {}
          });
        } else {
          setPasteError((response as any)?.error || 'Image upload failed');
        }
      } catch (error: any) {
        setPasteError(error?.message || 'Image upload failed');
      } finally {
        if (handledImagePaste) {
          setPastingImage(false);
        }
      }
    },
    [setValue, watchedValues.description]
  );

  const isSubmitDisabled = React.useMemo(() => {
    return (
      isLoading ||
      !watchedValues.projectId ||
      !watchedValues.sourceBranch ||
      !watchedValues.targetBranch ||
      !watchedValues.title?.trim()
    );
  }, [
    isLoading,
    watchedValues.projectId,
    watchedValues.sourceBranch,
    watchedValues.targetBranch,
    watchedValues.title,
  ]);

  // AI description generation handler
  const handleGenerateAIDescription = async () => {
    // Validate required fields
    if (!watchedValues.projectId) {
      setAiError('Please select a project first');
      return;
    }
    if (!watchedValues.sourceBranch) {
      setAiError('Please select a source branch first');
      return;
    }
    if (!watchedValues.targetBranch) {
      setAiError('Please select a target branch first');
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const mrTemplate = `**Related Issue:**

---

**Technical Requirement:**

> Example: need run \`npm install\`

---

**Feature Updated**

- [ ] Feature A
- [ ] Feature B
- [ ] Feature C

---

**Screen Capture / Video:**

---

**Checklist**

- [ ] I have tested this code
- [ ] There is no dead code`;

      const result = await apiService.generateMergeRequestDescription(
        watchedValues.projectId,
        {
          source_branch: watchedValues.sourceBranch,
          target_branch: watchedValues.targetBranch,
          template: mrTemplate,
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate description');
      }

      // Set the AI-generated description
      setValue('description', result.data?.description || '', {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (err: any) {
      console.error('AI generation failed:', err);
      setAiError(err.message || 'Failed to generate AI description');
    } finally {
      setAiLoading(false);
    }
  };

  // Inline picker contents
  function ProjectPickerContent() {
    const [query, setQuery] = React.useState('');
    const [debouncedQuery, setDebouncedQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Debounce search query
    React.useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedQuery(query);
      }, 300);
      return () => clearTimeout(timer);
    }, [query]);

    // Server-side search
    const projectsQuery = useQuery({
      queryKey: ['projects-search', debouncedQuery],
      queryFn: async () => {
        const res = await apiService.searchProjects({
          search: debouncedQuery || undefined,
          limit: 100,
        });
        if (!res.success)
          throw new Error(res.error || 'Failed to load projects');
        return res.data || [];
      },
      staleTime: 60_000,
    });

    const list = projectsQuery.data || [];

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    React.useEffect(() => {
      setHighlight(0);
    }, [list.length]);

    const selectAt = (idx: number) => {
      const p = list[idx];
      if (!p) return;
      setValue('projectId', p.id, { shouldDirty: true, shouldValidate: true });
      setSelectedProjectName(p.name ?? '');
      setQuery('');
      setDebouncedQuery('');
      setHighlight(0);
      setOpenProject(false);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, Math.max(0, list.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectAt(highlight);
      } else if (e.key === 'Escape') {
        setOpenProject(false);
      }
    };

    const isSearching = projectsQuery.isLoading || projectsQuery.isFetching;

    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          className="text-sm w-full glass-input px-2 py-1.5 h-8"
          placeholder="Search projects"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
        />
        <div className="max-h-56 overflow-auto">
          {isSearching && list.length === 0 ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : list.length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : (
            <ul role="listbox" aria-label="Projects" className="text-sm">
              {list.map((p, idx) => (
                <li key={p.id} role="option" aria-selected={idx === highlight}>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100',
                      idx === highlight ? 'bg-neutral-100' : ''
                    )}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => selectAt(idx)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function BranchPickerContent({
    field,
  }: {
    field: 'sourceBranch' | 'targetBranch';
  }) {
    const [query, setQuery] = React.useState('');
    const [debouncedQuery, setDebouncedQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Debounce search query
    React.useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedQuery(query);
      }, 300);
      return () => clearTimeout(timer);
    }, [query]);

    // Server-side search
    const branchesQuery = useQuery({
      queryKey: ['branches-search', watchedValues.projectId, debouncedQuery],
      queryFn: async () => {
        if (!watchedValues.projectId) return [];
        const res = await apiService.getProjectBranches(
          watchedValues.projectId,
          {
            search: debouncedQuery || undefined,
            per_page: 100,
          }
        );
        if (!res.success)
          throw new Error(res.error || 'Failed to load branches');
        return res.data?.items || [];
      },
      enabled: !!watchedValues.projectId,
      staleTime: 60_000,
    });

    const list = branchesQuery.data || [];

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    React.useEffect(() => {
      setHighlight(0);
    }, [list.length]);

    const selectAt = (idx: number) => {
      const b = list[idx];
      if (!b) return;
      setValue(field, b.name, { shouldDirty: true, shouldValidate: true });
      if (field === 'sourceBranch') setOpenSourceBranch(false);
      else setOpenTargetBranch(false);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, Math.max(0, list.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectAt(highlight);
      } else if (e.key === 'Escape') {
        if (field === 'sourceBranch') setOpenSourceBranch(false);
        else setOpenTargetBranch(false);
      }
    };

    const isSearching = branchesQuery.isLoading || branchesQuery.isFetching;

    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          className="text-sm w-full glass-input px-2 py-1.5 h-8"
          placeholder="Search branches"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading || !watchedValues.projectId}
        />
        <div className="max-h-56 overflow-auto">
          {isSearching && list.length === 0 ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : list.length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : (
            <ul role="listbox" aria-label="Branches" className="text-sm">
              {list.map((b, idx) => (
                <li
                  key={b.name}
                  role="option"
                  aria-selected={idx === highlight}
                >
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2',
                      idx === highlight ? 'bg-neutral-100' : ''
                    )}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => selectAt(idx)}
                  >
                    <LuGitBranch className="h-3 w-3 text-neutral-500" />
                    <span>{b.name}</span>
                    {b.default && (
                      <span className="text-xs text-neutral-500">
                        (default)
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function UserPickerContent({ field }: { field: 'assignees' | 'reviewers' }) {
    const [query, setQuery] = React.useState('');
    const [debouncedQuery, setDebouncedQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Debounce search query
    React.useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedQuery(query);
      }, 300);
      return () => clearTimeout(timer);
    }, [query]);

    // Server-side search
    const usersQuery = useQuery({
      queryKey: ['users-search', watchedValues.projectId, debouncedQuery],
      queryFn: async () => {
        if (!watchedValues.projectId) return [];
        const res = await apiService.searchUsersInProject(
          watchedValues.projectId,
          {
            search: debouncedQuery || undefined,
            limit: 100,
          }
        );
        if (!res.success) throw new Error(res.error || 'Failed to load users');
        return res.data || [];
      },
      enabled: !!watchedValues.projectId,
      staleTime: 60_000,
    });

    const computed = usersQuery.data || [];

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    React.useEffect(() => {
      setHighlight(0);
    }, [computed.length]);

    const toggleUser = (userId: number) => {
      const current =
        field === 'assignees'
          ? watchedValues.assigneeIds || []
          : watchedValues.reviewerIds || [];
      const updated = current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId];

      if (field === 'assignees') {
        setValue('assigneeIds', updated, {
          shouldDirty: true,
          shouldValidate: true,
        });
      } else {
        setValue('reviewerIds', updated, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, Math.max(0, computed.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const u = computed[highlight];
        if (u) toggleUser(Number(u.id));
      } else if (e.key === 'Escape') {
        if (field === 'assignees') setOpenAssignees(false);
        else setOpenReviewers(false);
      }
    };

    const isSearching = usersQuery.isLoading || usersQuery.isFetching;
    const selectedIds =
      field === 'assignees'
        ? watchedValues.assigneeIds || []
        : watchedValues.reviewerIds || [];

    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          className="text-sm w-full glass-input px-2 py-1.5 h-8"
          placeholder={`Search ${field}`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading || !watchedValues.projectId}
        />
        <div className="max-h-56 overflow-auto">
          {isSearching && computed.length === 0 ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : computed.length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : (
            <ul role="listbox" aria-label={field} className="text-sm">
              {computed.map((u: any, idx: number) => {
                const selected = selectedIds.includes(Number(u.id));
                return (
                  <li
                    key={u.id || idx}
                    role="option"
                    aria-selected={idx === highlight}
                  >
                    <button
                      type="button"
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2',
                        idx === highlight ? 'bg-neutral-100' : ''
                      )}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => toggleUser(Number(u.id))}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        readOnly
                        className="pointer-events-none"
                      />
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt={u.name}
                          className="w-4 h-4 rounded-full"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display =
                              'none';
                          }}
                        />
                      ) : (
                        <span className="w-4 h-4 inline-block rounded-full bg-neutral-200" />
                      )}
                      <span>{u.name}</span>
                      {u.username && (
                        <span className="text-gray-500">(@{u.username})</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function SkeletonRow() {
    return (
      <div className="flex items-center gap-2 px-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  // Sync local slack-enabled state
  React.useEffect(() => {
    const enabled = !!watchedValues.slackChannelId;
    if (enabled !== slackEnabled) setSlackEnabled(enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.slackChannelId]);

  // Markdown renderer for Preview (GFM-like)
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
    <div
      ref={containerRef}
      className="w-full space-y-3 relative border-0 pt-4"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      {...keyboardIsolation}
    >
      <div className="px-4">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 rounded-xl p-3"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-center gap-2">
                <FiAlertTriangle className="h-3 w-3 text-red-500" />
                <p className="text-sm text-red-700">
                  {typeof error === 'string'
                    ? error
                    : (error as any)?.message || JSON.stringify(error)}
                </p>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-green-50 border border-green-200 rounded-xl p-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="h-3 w-3 text-green-500" />
                  <p className="text-sm text-green-700">{success}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {lastCreatedMr?.web_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.open(
                            lastCreatedMr.web_url,
                            '_blank',
                            'noopener,noreferrer'
                          );
                        }
                      }}
                    >
                      <FiExternalLink className="h-3 w-3" />
                      View in GitLab
                    </Button>
                  )}
                  {slackNotification && (
                    <span
                      className={cn(
                        'text-xs',
                        slackNotification.status === 'sent'
                          ? 'text-green-700'
                          : 'text-amber-600'
                      )}
                    >
                      {slackNotification.status === 'sent'
                        ? `Shared to ${getSlackChannelName(slackNotification.channel)}`
                        : `Slack notification failed${slackNotification.error ? `: ${slackNotification.error}` : ''}`}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          {usedPreset && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-blue-50 border border-blue-200 rounded-xl p-2"
            >
              <p className="text-xs text-blue-600">
                ✨ Auto-filled with your last used settings
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit(e);
        }}
      >
        {/* Pointer blocker overlay */}
        {anyPillOpen && (
          <div
            className="fixed inset-0 z-[9999998] bg-transparent"
            onMouseDown={closeAllPills}
            onClick={closeAllPills}
          />
        )}

        <div className="space-y-4 px-4">
          {/* Context bar: compact pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Project pill */}
            <Popover
              open={openProject}
              onOpenChange={createOnOpenChange('project', setOpenProject)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading}
                  title="Select project"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openProject,
                      'project',
                      setOpenProject
                    )
                  }
                >
                  <LuFolderGit2 />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Project</span>
                    {(() => {
                      const p = projects.find(
                        p => p.id === watchedValues.projectId
                      );
                      return (
                        <span className="text-neutral-900 truncate max-w-[140px]">
                          {selectedProjectName ||
                            p?.name ||
                            watchedValues.projectId ||
                            'Select'}
                        </span>
                      );
                    })()}
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openProject && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-64"
                container={portalContainer || undefined}
                align="start"
              >
                <ProjectPickerContent />
              </PopoverContent>
            </Popover>

            {/* Source Branch pill */}
            <Popover
              open={openSourceBranch}
              onOpenChange={createOnOpenChange(
                'sourceBranch',
                setOpenSourceBranch
              )}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Select source branch"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openSourceBranch,
                      'sourceBranch',
                      setOpenSourceBranch
                    )
                  }
                >
                  <LuGitBranch />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Source</span>
                    <span className="text-neutral-900 truncate max-w-[120px]">
                      {watchedValues.sourceBranch || 'Select'}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openSourceBranch && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-64"
                container={portalContainer || undefined}
                align="start"
              >
                <BranchPickerContent field="sourceBranch" />
              </PopoverContent>
            </Popover>

            {/* Target Branch pill */}
            <Popover
              open={openTargetBranch}
              onOpenChange={createOnOpenChange(
                'targetBranch',
                setOpenTargetBranch
              )}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Select target branch"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openTargetBranch,
                      'targetBranch',
                      setOpenTargetBranch
                    )
                  }
                >
                  <LuGitBranch />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Target</span>
                    <span className="text-neutral-900 truncate max-w-[120px]">
                      {watchedValues.targetBranch || 'Select'}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openTargetBranch && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-64"
                container={portalContainer || undefined}
                align="start"
              >
                <BranchPickerContent field="targetBranch" />
              </PopoverContent>
            </Popover>

            {/* Assignees pill */}
            <Popover
              open={openAssignees}
              onOpenChange={createOnOpenChange('assignees', setOpenAssignees)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Select assignees"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openAssignees,
                      'assignees',
                      setOpenAssignees
                    )
                  }
                >
                  <IoPersonOutline />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Assignees</span>
                    <span className="text-neutral-900 truncate max-w-[100px]">
                      {(watchedValues.assigneeIds || []).length > 0
                        ? `${(watchedValues.assigneeIds || []).length} selected`
                        : 'None'}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openAssignees && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-72"
                container={portalContainer || undefined}
                align="start"
              >
                <UserPickerContent field="assignees" />
              </PopoverContent>
            </Popover>

            {/* Reviewers pill */}
            <Popover
              open={openReviewers}
              onOpenChange={createOnOpenChange('reviewers', setOpenReviewers)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Select reviewers"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openReviewers,
                      'reviewers',
                      setOpenReviewers
                    )
                  }
                >
                  <IoPersonOutline />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Reviewers</span>
                    <span className="text-neutral-900 truncate max-w-[100px]">
                      {(watchedValues.reviewerIds || []).length > 0
                        ? `${(watchedValues.reviewerIds || []).length} selected`
                        : 'None'}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openReviewers && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-72"
                container={portalContainer || undefined}
                align="start"
              >
                <UserPickerContent field="reviewers" />
              </PopoverContent>
            </Popover>

            {/* Slack pill */}
            <Popover
              open={openSlack}
              onOpenChange={createOnOpenChange('slack', setOpenSlack)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading}
                  title="Slack notification"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openSlack,
                      'slack',
                      setOpenSlack
                    )
                  }
                >
                  <PiSlackLogoLight />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Slack</span>
                    {(() => {
                      const enabled = slackEnabled;
                      const chLabel = getSlackChannelName(
                        watchedValues.slackChannelId
                      );
                      return (
                        <span className="text-neutral-900 truncate max-w-[120px]">
                          {enabled ? chLabel || 'On' : 'Off'}
                        </span>
                      );
                    })()}
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openSlack && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-3 w-80 space-y-3"
                container={portalContainer || undefined}
                align="start"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-neutral-600">
                    Notify on Slack
                  </div>
                  <Switch
                    checked={slackEnabled}
                    onCheckedChange={(checked: boolean) => {
                      setSlackEnabled(checked);
                      if (!checked) {
                        setValue('slackChannelId', '');
                        setValue('slackUserIds', []);
                      }
                    }}
                  />
                </div>
                <div>
                  <div className="text-sm mb-1 text-neutral-500">Channel</div>
                  <Select
                    value={watchedValues.slackChannelId || ''}
                    onValueChange={(value: any) =>
                      setValue('slackChannelId', value)
                    }
                    disabled={isLoading || slackChannelsQuery.isLoading}
                  >
                    <SelectTrigger
                      className="text-sm glass-input h-8"
                      disabled={!slackEnabled}
                    >
                      <SelectValue
                        placeholder={
                          slackChannelsQuery.isLoading ? 'Loading…' : 'Select'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="text-sm rounded-lg bg-white"
                      container={portalContainer || undefined}
                      sideOffset={8}
                      avoidCollisions={false}
                    >
                      {(slackChannelsQuery.data || []).map((c: any) => (
                        <SelectItem
                          key={c.id}
                          className="cursor-pointer text-sm"
                          value={c.id}
                        >
                          #{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-sm mb-1 text-neutral-500">
                    Notify user
                  </div>
                  <Select
                    value={
                      (watchedValues.slackUserIds &&
                        (watchedValues.slackUserIds as string[])[0]) ||
                      ''
                    }
                    onValueChange={(value: any) =>
                      setValue('slackUserIds', value ? [value] : [], {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    disabled={isLoading || slackUsersQuery.isLoading}
                  >
                    <SelectTrigger
                      className="text-sm glass-input h-8"
                      disabled={!slackEnabled}
                    >
                      <SelectValue
                        placeholder={
                          slackUsersQuery.isLoading ? 'Loading…' : 'Select'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="text-sm rounded-lg bg-white"
                      container={portalContainer || undefined}
                      sideOffset={8}
                      avoidCollisions={false}
                    >
                      {(slackUsersQuery.data || []).map(
                        (u: { id: string; name: string }) => (
                          <SelectItem
                            key={u.id}
                            className="cursor-pointer text-sm"
                            value={u.id}
                          >
                            {u.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {slackEnabled && slackPreview && (
                  <div className="border border-neutral-200 rounded-lg bg-neutral-50 p-3 space-y-2">
                    <div className="text-xs font-medium uppercase text-neutral-500">
                      Slack Preview
                    </div>
                    <div className="space-y-1 text-xs text-neutral-600">
                      <div className="text-sm font-semibold text-neutral-800">
                        🔀 {slackPreview.title}
                      </div>
                      {slackPreview.branches && (
                        <div>Branches: {slackPreview.branches}</div>
                      )}
                      {slackPreview.projectName && (
                        <div>Project: {slackPreview.projectName}</div>
                      )}
                      <div>Channel: {slackPreview.channelName}</div>
                    </div>
                    {slackPreview.features.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-neutral-500">Changes</div>
                        <ul className="list-disc pl-4 text-xs text-neutral-700 space-y-1">
                          {slackPreview.features.map(feature => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {slackPreview.mentions.length > 0 && (
                      <div className="text-xs text-neutral-600">
                        Mentions: {slackPreview.mentions.join(', ')}
                      </div>
                    )}
                    <div className="text-[11px] text-neutral-400">
                      GitLab link is added after the merge request is created.
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Title */}
          <div className="space-y-3">
            <Label htmlFor="title" className="mb-2">
              <div className="flex items-center gap-2">Title *</div>
            </Label>
            <input
              {...register('title', { required: 'Title is required' })}
              type="text"
              className="text-sm w-full glass-input px-3 py-2"
              placeholder="Brief, descriptive title for the merge request"
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-sm text-red-600">
                {(errors as any).title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="description" className="flex items-center gap-2">
                Description
              </Label>
            </div>
            {/* Editor */}
            <div
              className={cn(
                'w-full rounded-md border border-neutral-200 glass-input p-0 focus-within:ring-1 focus-within:ring-blue-300',
                isLoading ? 'opacity-60 pointer-events-none' : ''
              )}
            >
              {/* Toolbar (compact) */}
              <div className="flex flex-wrap items-center justify-between gap-1 border-b border-neutral-200 glass-nav dark:bg-neutral-800/60 px-2 py-1 text-sm">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={mdTab === 'preview' ? 'secondary' : 'ghost'}
                    className="h-7 px-2"
                    title="Preview"
                    onClick={() =>
                      setMdTab(mdTab === 'preview' ? 'write' : 'preview')
                    }
                  >
                    <IconEye className="h-3.5 w-3.5" />
                  </Button>
                  <span className="mx-1 h-5 w-px bg-neutral-200" />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Bold"
                    onClick={() => wrapSelection('**', '**')}
                  >
                    <IconBold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Italic"
                    onClick={() => wrapSelection('*', '*')}
                  >
                    <IconItalic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Inline code"
                    onClick={() => wrapSelection('`', '`')}
                  >
                    <IconInlineCode className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Link"
                    onClick={() => insertLink()}
                  >
                    <IconLink className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        title="More"
                      >
                        ⋯
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      container={portalContainer || undefined}
                    >
                      <DropdownMenuLabel>Insert</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => prefixLine('- ')}>
                        Bulleted list
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => prefixLine('1. ')}>
                        Numbered list
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => prefixLine('- [ ] ')}>
                        Task list
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => prefixLine('> ')}>
                        Quote
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => insertTable()}>
                        Table
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => insertCodeBlock()}>
                        Code block
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title="Generate with AI"
                          disabled={
                            aiLoading ||
                            isLoading ||
                            !watchedValues.projectId ||
                            !watchedValues.sourceBranch ||
                            !watchedValues.targetBranch
                          }
                          onClick={handleGenerateAIDescription}
                        >
                          {aiLoading ? (
                            <FiLoader className="h-3 w-3 animate-spin" />
                          ) : (
                            <FiZap className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipPortal container={portalContainer || undefined}>
                        <TooltipContent>
                          Generate AI description from commits
                        </TooltipContent>
                      </TooltipPortal>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              {mdTab === 'preview' ? (
                <div className="px-3 py-2 text-sm max-h-[520px] overflow-y-auto overflow-x-visible bg-white">
                  <div
                    className="tiptap text-sm leading-5 focus:outline-none"
                    dangerouslySetInnerHTML={{
                      __html: md.render(watchedValues.description || ''),
                    }}
                  />
                </div>
              ) : (
                <div className="px-3 py-2 text-sm">
                  <textarea
                    ref={element => {
                      descriptionTextareaRef.current = element;
                      if (descriptionField.ref) {
                        descriptionField.ref(element);
                      }
                    }}
                    className="w-full min-h-[220px] font-mono text-sm leading-5 outline-none bg-transparent resize-y"
                    placeholder="Describe the changes in this merge request..."
                    value={watchedValues.description || ''}
                    onChange={e => {
                      setValue('description', e.target.value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                      if (pasteError) {
                        setPasteError(null);
                      }
                    }}
                    onPaste={handleDescriptionPaste}
                  />
                  {pastingImage && (
                    <div className="mt-2 text-sm text-neutral-600 flex items-center gap-1">
                      <FiLoader className="h-3 w-3 animate-spin" /> Uploading
                      image…
                    </div>
                  )}
                  {pasteError && (
                    <div className="mt-2 text-sm text-red-600">
                      {pasteError}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Keep form validation errors */}
            {(errors as any).description && (
              <p className="text-sm text-red-600">
                {(errors as any).description?.message}
              </p>
            )}
            {aiError && <p className="text-sm text-red-600">{aiError}</p>}
          </div>

          {/* Options */}
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('removeSourceBranch')}
                disabled={isLoading}
              />
              <span>Remove source branch after merge</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('squash')}
                disabled={isLoading}
              />
              <span>Squash commits</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isLoading}
                className="pointer-events-auto"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitDisabled}
              className="pointer-events-auto glass-button text-black"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <FiLoader className="animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Merge Request'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CompactMergeRequestCreator;
