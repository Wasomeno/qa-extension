import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiLoader,
  FiAlertTriangle,
  FiCheckCircle,
  FiZap,
} from 'react-icons/fi';
import {
  Bold as IconBold,
  Italic as IconItalic,
  Code as IconInlineCode,
  Link as IconLink,
  Eye as IconEye,
  ChevronRight,
} from 'lucide-react';

import { IssueData } from '@/types/messages';
import { LuFolderGit2 } from 'react-icons/lu';
import { useIssueCreator } from '@/hooks/useIssueCreator';
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
// (no multi-select dropdown needed)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import { Label } from '@/src/components/ui/ui/label';
import api, { apiService } from '@/services/api';
// TipTap imports
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { useQuery } from '@tanstack/react-query';
import { IoPricetagsOutline, IoPersonOutline } from 'react-icons/io5';
import { CgNotes } from 'react-icons/cg';
import { PiSlackLogoLight } from 'react-icons/pi';
import { formatProjectName } from '@/utils/project-formatter';

interface CompactIssueCreatorProps {
  initialData?: Partial<IssueData>;
  context?: {
    url: string;
    title: string;
    screenshot?: string;
    elementInfo?: any;
    recordingId?: string;
  };
  onSubmit?: (issue: IssueData) => void;
  onCancel?: () => void;
  onSaveDraft?: (draft: IssueData) => void;
  onBack?: () => void;
  portalContainer?: Element | null;
  resetTrigger?: number; // Increment this to trigger form reset
}

export const CompactIssueCreator: React.FC<CompactIssueCreatorProps> = ({
  initialData = {},
  context,
  onSubmit,
  onCancel,
  onSaveDraft,
  portalContainer,
  resetTrigger,
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [editorMode] = React.useState<'markdown' | 'rich'>('markdown');
  const editorModeRef = React.useRef<'markdown' | 'rich'>(editorMode);
  const mdTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mdTab, setMdTab] = React.useState<'write' | 'preview'>('write');
  const [pastingImage, setPastingImage] = React.useState(false);
  const [pasteError, setPasteError] = React.useState<string | null>(null);
  const [slackEnabled, setSlackEnabled] = React.useState(
    !!(initialData as any)?.slackChannelId
  );

  // Track open state for each pill popover to prevent click-through
  const [openProject, setOpenProject] = React.useState(false);
  const [openLabels, setOpenLabels] = React.useState(false);
  const [openFormat, setOpenFormat] = React.useState(false);
  const [openAssignee, setOpenAssignee] = React.useState(false);
  const [openSlack, setOpenSlack] = React.useState(false);
  const anyPillOpen =
    openProject || openLabels || openFormat || openAssignee || openSlack;
  const suppressOpenRef = React.useRef({
    project: false,
    labels: false,
    format: false,
    assignee: false,
    slack: false,
  });
  const closeAllPills = () => {
    setOpenProject(false);
    setOpenLabels(false);
    setOpenFormat(false);
    setOpenAssignee(false);
    setOpenSlack(false);
  };

  const handleTriggerPointerDown = (
    event: React.PointerEvent,
    openState: boolean,
    key: 'project' | 'labels' | 'format' | 'assignee' | 'slack',
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!openState) return;
    event.preventDefault();
    suppressOpenRef.current[key] = true;
    setter(false);
  };

  const createOnOpenChange =
    (
      key: 'project' | 'labels' | 'format' | 'assignee' | 'slack',
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

  // Markdown helpers for toolbar
  const getSel = () => {
    const el = mdTextareaRef.current;
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
  React.useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  // Clipboard paste handler for Markdown textarea: uploads image and inserts Markdown
  const handleMarkdownPaste = async (
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
      const resp = await apiService.uploadFile(file, 'screenshot');
      if (resp.success && (resp.data as any)?.url) {
        const url = (resp.data as any).url as string;
        const el = mdTextareaRef.current;
        const v = (watchedValues.description || '') as string;
        const start = el?.selectionStart ?? v.length;
        const end = el?.selectionEnd ?? start;
        const before = v.slice(0, start);
        const after = v.slice(end);
        const insertion =
          (before.endsWith('\n') ? '' : '\n') +
          `![pasted-image](${url})` +
          '\n';
        const newText = before + insertion + after;
        setValue('description', newText, {
          shouldDirty: true,
          shouldValidate: true,
        });
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

  // editor will be initialized after we have setValue and register from the hook

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    errors,
    watchedValues,
    isLoading,
    dataLoading,
    projects,
    users,
    error,
    success,
  } = useIssueCreator({
    initialData,
    context,
    onSubmit,
    onCancel,
    onSaveDraft,
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

  const labelQueries = useQuery({
    queryKey: ['gitlab-labels', watchedValues.projectId],
    enabled: !!watchedValues.projectId,
    staleTime: 300_000,
    queryFn: async () => {
      if (!watchedValues.projectId) return;
      const res = await api.getGitLabProjectLabels(watchedValues.projectId);
      if (!res.success) throw new Error(res.error || 'Failed to load labels');
      return res.data?.items || [];
    },
  });

  const labelOptions = labelQueries.data?.map(label => ({
    value: label.name,
    label: label.name,
    color: label.color,
  }));

  // Inline picker contents rendered within respective Popovers
  function ProjectPickerContent() {
    const [query, setQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const list = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      return (projects || []).filter(p =>
        !q
          ? true
          : p.name.toLowerCase().includes(q) ||
            (p.path_with_namespace &&
              p.path_with_namespace.toLowerCase().includes(q))
      );
    }, [projects, query]);

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    const selectAt = (idx: number) => {
      const p = list[idx];
      if (!p) return;
      setValue('projectId', p.id, { shouldDirty: true, shouldValidate: true });
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

    return (
      <div className="space-y-2">
        {/* Search */}
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
          {dataLoading ? (
            <div className="space-y-2">
              <SkeletonRow />
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
                    {formatProjectName(p)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function LabelsPickerContent() {
    const [query, setQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const list = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      return (labelOptions || []).filter(l =>
        !q ? true : l.label.toLowerCase().includes(q)
      );
    }, [labelOptions, query]);

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    const selectAt = (idx: number) => {
      const l = list[idx];
      if (!l) return;
      setValue('labelIds', [l.value], {
        shouldDirty: true,
        shouldValidate: true,
      });
      setOpenLabels(false);
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
        setOpenLabels(false);
      }
    };

    const loading = labelQueries.isLoading || labelQueries.isFetching;

    return (
      <div className="space-y-2">
        {/* Search */}
        <input
          ref={inputRef}
          className="text-sm w-full glass-input px-2 py-1.5 h-8"
          placeholder="Search labels"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading || !watchedValues.projectId}
        />
        <div className="max-h-56 overflow-auto">
          {loading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (labelOptions || []).length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : list.length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : (
            <ul role="listbox" aria-label="Labels" className="text-sm">
              {list.map((l, idx) => (
                <li
                  key={l.value}
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
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  function FormatPickerContent() {
    const options = [
      { value: 'single', label: 'Single' },
      { value: 'multiple', label: 'Multiple' },
    ] as const;
    const [highlight, setHighlight] = React.useState(() => {
      const idx = options.findIndex(o => o.value === watchedValues.issueFormat);
      return idx >= 0 ? idx : 0;
    });

    const selectAt = (idx: number) => {
      const o = options[idx];
      if (!o) return;
      setValue('issueFormat', o.value as any, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setOpenFormat(false);
    };

    const listRef = React.useRef<HTMLUListElement>(null);
    React.useEffect(() => {
      // focus list to enable keyboard navigation
      listRef.current?.focus();
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectAt(highlight);
      } else if (e.key === 'Escape') {
        setOpenFormat(false);
      }
    };

    return (
      <div className="max-h-56 overflow-auto">
        <ul
          role="listbox"
          aria-label="Format"
          className="text-sm"
          tabIndex={0}
          ref={listRef}
          onKeyDown={onKeyDown}
        >
          {options.map((o, idx) => (
            <li key={o.value} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100',
                  idx === highlight ? 'bg-neutral-100' : ''
                )}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectAt(idx)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function AssigneePickerContent() {
    const [query, setQuery] = React.useState('');
    const [highlight, setHighlight] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const unassigned = {
      id: 'unassigned',
      name: 'Unassigned',
      username: '',
    } as any;
    const computed = React.useMemo(() => {
      const base = [unassigned, ...(users || [])];
      const q = query.trim().toLowerCase();
      const filtered = base.filter(u =>
        !q
          ? true
          : u.name?.toLowerCase().includes(q) ||
            u.username?.toLowerCase().includes(q)
      );
      return filtered;
    }, [users, query]);

    React.useEffect(() => {
      inputRef.current?.focus();
      setHighlight(0);
      setQuery('');
    }, []);

    const selectAt = (idx: number) => {
      const u = computed[idx];
      if (!u) return;
      setValue('assigneeId', u.id === 'unassigned' ? '' : u.id, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setOpenAssignee(false);
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
        selectAt(highlight);
      } else if (e.key === 'Escape') {
        setOpenAssignee(false);
      }
    };

    const loadingUsers = !!watchedValues.projectId && users.length === 0;

    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          className="text-sm w-full glass-input px-2 py-1.5 h-8"
          placeholder="Search assignee"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading || !watchedValues.projectId}
        />
        <div className="max-h-56 overflow-auto">
          {loadingUsers ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : computed.length === 0 ? (
            <div className="text-xs text-neutral-500 px-1 py-2">
              No options found
            </div>
          ) : (
            <ul role="listbox" aria-label="Assignee" className="text-sm">
              {computed.map((u: any, idx: number) => (
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
                    onClick={() => selectAt(idx)}
                  >
                    {u.avatarUrl && u.id !== 'unassigned' ? (
                      <img
                        src={u.avatarUrl}
                        alt={u.name}
                        className="w-4 h-4 rounded-full"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="w-4 h-4 inline-block rounded-full bg-neutral-200" />
                    )}
                    <span>{u.name}</span>
                    {u.username ? (
                      <span className="text-gray-500">(@{u.username})</span>
                    ) : null}
                  </button>
                </li>
              ))}
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

  // sync local slack-enabled state with form value
  React.useEffect(() => {
    const enabled = !!watchedValues.slackChannelId;
    if (enabled !== slackEnabled) setSlackEnabled(enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.slackChannelId]);

  // Slack data (optional)
  const slackChannelsQuery = useQuery({
    queryKey: ['slack-channels'],
    queryFn: async () => {
      const res = await apiService.getSlackChannels();
      console.log('Res', res);
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        // Leave others as default by omitting or passing empty option objects
        blockquote: {},
        bulletList: {},
        orderedList: {},
        listItem: {},
        codeBlock: {},
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
      }),
      Placeholder.configure({
        placeholder:
          'Describe the issue, steps to reproduce, expected vs actual behavior...',
      }),
      // Capture and emit Markdown so GitLab gets Markdown-compatible content
      Markdown,
    ],
    content: '',
    editorProps: {
      attributes: {
        // Ensure a larger editing area similar to GitLab
        class: 'min-h-[280px] outline-none',
      },
      handlePaste: (view, event) => {
        try {
          const e = event as ClipboardEvent;
          const cd = e.clipboardData;
          if (!cd) return false;
          const files: File[] = [];
          // Prefer items (gives us getAsFile)
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
          if (!files.length) return false;
          e.preventDefault();
          const file = files[0];
          setPastingImage(true);
          setPasteError(null);
          // Upload via API service
          (async () => {
            const resp = await apiService.uploadFile(file, 'screenshot');
            if (resp.success && (resp.data as any)?.url) {
              const url = (resp.data as any).url as string;
              // Insert Markdown image at current selection (keeps source in Markdown)
              const mdImage = `![pasted-image](${url})`;
              try {
                // Insert as plain text so Markdown extension can manage value
                (view as any).dispatch(
                  (view as any).state.tr.insertText(mdImage)
                );
              } catch {
                // Fallback: try commands API if available
                try {
                  (editor as any)?.commands?.insertContent?.(mdImage);
                } catch {}
              }
            } else {
              setPasteError((resp as any)?.error || 'Image upload failed');
            }
          })()
            .catch(err => setPasteError(err?.message || 'Image upload failed'))
            .finally(() => setPastingImage(false));
          return true;
        } catch {
          return false;
        }
      },
    },
    onCreate: ({ editor }: any) => {
      // Load initial description (assume Markdown if present)
      const initial = (initialData as any)?.description || '';
      if (initial) {
        try {
          (editor as any).commands.setMarkdown?.(initial);
        } catch {
          try {
            editor.commands.setContent(initial);
          } catch {}
        }
      }
    },
    onUpdate: ({ editor }: any) => {
      if (editorModeRef.current !== 'rich') return;
      try {
        const md = (editor.storage as any)?.markdown?.getMarkdown?.();
        if (typeof md === 'string') {
          setValue('description', md, {
            shouldValidate: true,
            shouldDirty: true,
          });
          return;
        }
      } catch {}
      // Fallback to HTML/text if Markdown storage not available
      const html = editor.getHTML();
      setValue('description', html, {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
  });

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

  // Keep preview content in sync when switching to preview
  React.useEffect(() => {
    if (mdTab === 'preview' && editor) {
      const current = watchedValues.description || '';
      try {
        (editor as any)?.commands?.setMarkdown?.(current);
      } catch {
        try {
          editor.commands.setContent(current);
        } catch {}
      }
      try {
        editor.setEditable(false);
      } catch {}
    } else if (editor) {
      try {
        editor.setEditable(true);
      } catch {}
    }
  }, [mdTab, editor, watchedValues.description]);

  // Ensure RHF validation for description still applies
  React.useEffect(() => {
    try {
      (register as any)('description', { required: 'Description is required' });
    } catch {}
  }, [register]);

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
            >
              <div className="flex items-center gap-2">
                <FiCheckCircle className="h-3 w-3 text-green-500" />
                <p className="text-sm text-green-700">{success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <form onSubmit={handleSubmit}>
        {/* Pointer blocker overlay to prevent clicking covered pills */}
        {anyPillOpen && (
          <div
            className="fixed inset-0 z-[9999998] bg-transparent"
            onMouseDown={closeAllPills}
            onClick={closeAllPills}
          />
        )}
        <div className="space-y-4 px-4">
          {/* Context bar: compact pills for key fields */}
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
                  <LuFolderGit2 className="text-blue-600" />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Project</span>
                    {(() => {
                      const p = projects.find(
                        p => p.id === watchedValues.projectId
                      );
                      return (
                        <span className="text-neutral-900 truncate max-w-[140px]">
                          {p ? formatProjectName(p) : 'Select'}
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
                {/* Search */}
                <ProjectPickerContent />
              </PopoverContent>
            </Popover>

            {/* Label(s) pill */}
            <Popover
              open={openLabels}
              onOpenChange={createOnOpenChange('labels', setOpenLabels)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Select label"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openLabels,
                      'labels',
                      setOpenLabels
                    )
                  }
                >
                  <IoPricetagsOutline className="text-purple-600" />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Labels</span>
                    {(() => {
                      const selectedIds = watchedValues.labelIds || [];
                      const selected =
                        selectedIds.length > 0
                          ? labelOptions?.find(l => l.value === selectedIds[0])
                          : null;
                      return (
                        <span className="inline-flex items-center gap-1 text-neutral-900 truncate max-w-[160px]">
                          {selected ? (
                            <>
                              <span
                                className="inline-block w-2 h-2 rounded-full border"
                                style={{ backgroundColor: selected.color }}
                              />
                              <span className="truncate">{selected.label}</span>
                            </>
                          ) : (
                            <span className="text-neutral-900">Select</span>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openLabels && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-64"
                container={portalContainer || undefined}
                align="start"
              >
                <LabelsPickerContent />
              </PopoverContent>
            </Popover>

            {/* Format pill */}
            <Popover
              open={openFormat}
              onOpenChange={createOnOpenChange('format', setOpenFormat)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading}
                  title="Issue format"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openFormat,
                      'format',
                      setOpenFormat
                    )
                  }
                >
                  <CgNotes className="text-orange-600" />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Format</span>
                    <span className="text-neutral-900 truncate max-w-[120px]">
                      {(() => {
                        const f = watchedValues.issueFormat;
                        if (!f) return 'Select';
                        if (f === 'single') return 'Single';
                        if (f === 'multiple') return 'Multiple';
                        return String(f);
                      })()}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openFormat && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-56"
                container={portalContainer || undefined}
                align="start"
              >
                <FormatPickerContent />
              </PopoverContent>
            </Popover>

            {/* Assignee pill */}
            <Popover
              open={openAssignee}
              onOpenChange={createOnOpenChange('assignee', setOpenAssignee)}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 glass-input"
                  disabled={isLoading || !watchedValues.projectId}
                  title="Assign"
                  onPointerDown={event =>
                    handleTriggerPointerDown(
                      event,
                      openAssignee,
                      'assignee',
                      setOpenAssignee
                    )
                  }
                >
                  <IoPersonOutline className="text-teal-600" />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Assignee</span>
                    {(() => {
                      const u = users.find(
                        u => u.id === watchedValues.assigneeId
                      );
                      return (
                        <span className="text-neutral-900 truncate max-w-[140px]">
                          {u ? u.name : 'Me'}
                        </span>
                      );
                    })()}
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                      openAssignee && 'rotate-90'
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-72"
                container={portalContainer || undefined}
                align="start"
              >
                <AssigneePickerContent />
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
                  <PiSlackLogoLight className="text-[#E01E5A]" />
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <span>Slack</span>
                    {(() => {
                      const enabled = slackEnabled;
                      const ch = (slackChannelsQuery.data || []).find(
                        (c: any) => c.id === watchedValues.slackChannelId
                      );
                      return (
                        <span className="text-neutral-900 truncate max-w-[150px]">
                          {enabled ? (
                            ch ? (
                              <>
                                On <span className="text-neutral-400">•</span> #
                                {ch.name}
                              </>
                            ) : (
                              'On'
                            )
                          ) : (
                            'Off'
                          )}
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
                          slackUsersQuery.isLoading ? 'Loading…' : 'Select '
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="text-sm rounded-lg bg-white"
                      container={portalContainer || undefined}
                      sideOffset={8}
                      avoidCollisions={false}
                    >
                      {(slackUsersQuery.data || []).map((u: any) => (
                        <SelectItem
                          key={u.id}
                          className="cursor-pointer text-sm"
                          value={u.id}
                        >
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              placeholder="Brief, descriptive title"
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
                Description *
              </Label>
              {/* Moved AI generate to toolbar as an icon */}
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
                            aiLoading || isLoading || !watchedValues.description
                          }
                          onClick={async () => {
                            setAiError(null);
                            setAiLoading(true);
                            try {
                              const resp =
                                await apiService.generateDescriptionFromTemplate(
                                  {
                                    issueFormat: watchedValues.issueFormat,
                                    userDescription: watchedValues.description,
                                  }
                                );
                              if (resp.success && resp.data?.description) {
                                setValue('description', resp.data.description);
                                if (mdTab === 'preview') {
                                  try {
                                    (editor as any)?.commands?.setMarkdown?.(
                                      resp.data.description
                                    );
                                  } catch {
                                    try {
                                      editor?.commands.setContent(
                                        resp.data.description
                                      );
                                    } catch {}
                                  }
                                }
                              } else {
                                const errVal: any = (resp as any)?.error;
                                const msg =
                                  typeof errVal === 'string'
                                    ? errVal
                                    : errVal?.message ||
                                      'Failed to generate description';
                                throw new Error(msg);
                              }
                            } catch (e: any) {
                              setAiError(
                                e?.message || 'Failed to generate description'
                              );
                            } finally {
                              setAiLoading(false);
                            }
                          }}
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
                          Use AI template on description
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
                    ref={mdTextareaRef}
                    className="w-full min-h-[220px] font-mono text-sm leading-5 outline-none bg-transparent resize-y"
                    placeholder="Use Markdown: steps, expected vs actual, links, code…"
                    value={watchedValues.description || ''}
                    onChange={e =>
                      setValue('description', e.target.value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    onPaste={handleMarkdownPaste}
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
        </div>
        <div className="sticky bottom-0 py-4 px-2 flex gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={
              isLoading ||
              !watchedValues.description ||
              !watchedValues.title ||
              !watchedValues.projectId
            }
            className="text-center flex-1 border-neutral-200 bg-white disabled:opacity-100 disabled:bg-neutral-50 disabled:text-neutral-300"
            style={{ borderRadius: 'var(--radius)' }}
            size="sm"
          >
            {isLoading ? (
              <>
                <FiLoader className="h-3 w-3 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              <>Create</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CompactIssueCreator;
