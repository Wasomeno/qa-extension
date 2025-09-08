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
} from 'lucide-react';

import { IssueData } from '@/types/messages';
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
import { Switch } from '@/src/components/ui/ui/switch';
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
// pill icons removed to match requested format

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
  className?: string;
  portalContainer?: Element | null;
}

export const CompactIssueCreator: React.FC<CompactIssueCreatorProps> = ({
  initialData = {},
  context,
  onSubmit,
  onCancel,
  onSaveDraft,
  onBack,
  className = '',
  portalContainer,
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
  const closeAllPills = () => {
    setOpenProject(false);
    setOpenLabels(false);
    setOpenFormat(false);
    setOpenAssignee(false);
    setOpenSlack(false);
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
    errors,
    watchedValues,
    isLoading,
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
    value: label.id,
    label: label.name,
    color: label.color,
  }));

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

  // Initialize TipTap editor for description (keeps value in Markdown)
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
      className={cn('w-full space-y-3', className)}
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      {...keyboardIsolation}
    >
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
              <p className="text-xs text-red-700">
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
              <p className="text-xs text-green-700">{success}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Pointer blocker overlay to prevent clicking covered pills */}
        {anyPillOpen && (
          <div
            className="fixed inset-0 z-[9999998] bg-transparent"
            onMouseDown={closeAllPills}
            onClick={closeAllPills}
          />
        )}
        {/* Context bar: compact pills for key fields */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project pill */}
          <Popover open={openProject} onOpenChange={setOpenProject}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 glass-input"
                disabled={isLoading}
                title="Select project"
              >
                <span className="text-[12px] text-neutral-600">
                  Project <span className="text-neutral-400">▾</span>
                </span>
                {(() => {
                  const p = projects.find(
                    p => p.id === watchedValues.projectId
                  );
                  return (
                    <span className="ml-2 text-[12px] text-neutral-900 truncate max-w-[140px]">
                      {p ? p.name : 'Select Project'}
                    </span>
                  );
                })()}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-2 w-64"
              container={portalContainer || undefined}
              align="start"
            >
              <div className="text-xs mb-2 text-neutral-500">Project *</div>
              <Select
                value={watchedValues.projectId}
                onValueChange={(value: any) => setValue('projectId', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="text-sm glass-input h-8">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent
                  className="text-sm rounded-lg bg-white"
                  container={portalContainer || undefined}
                  sideOffset={8}
                  avoidCollisions={false}
                >
                  {projects.length === 0 ? (
                    <SelectItem style={{ cursor: 'pointer' }} value="#">
                      No projects
                    </SelectItem>
                  ) : (
                    projects.map(project => (
                      <SelectItem
                        style={{ cursor: 'pointer' }}
                        key={project.id}
                        value={project.id}
                      >
                        {project.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          {/* Label(s) pill */}
          <Popover open={openLabels} onOpenChange={setOpenLabels}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 glass-input"
                disabled={isLoading || !watchedValues.projectId}
                title="Select label"
              >
                <span className="text-[12px] text-neutral-600">
                  Labels <span className="text-neutral-400">▾</span>
                </span>
                {(() => {
                  const selected = labelOptions?.find(
                    l => l.value.toString() === (watchedValues.labelId || '')
                  );
                  return (
                    <span className="ml-2 inline-flex items-center gap-1 text-[12px] text-neutral-900 truncate max-w-[180px]">
                      {selected ? (
                        <>
                          <span
                            className="inline-block w-2 h-2 rounded-full border"
                            style={{ backgroundColor: selected.color }}
                          />
                          <span className="truncate">{selected.label}</span>
                        </>
                      ) : (
                        <span className="text-neutral-900">Select Label</span>
                      )}
                    </span>
                  );
                })()}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-2 w-64"
              container={portalContainer || undefined}
              align="start"
            >
              <div className="text-xs mb-2 text-neutral-500">Label *</div>
              <Select
                value={watchedValues.labelId}
                onValueChange={(value: any) => setValue('labelId', value)}
                disabled={isLoading || !watchedValues.projectId}
              >
                <SelectTrigger className="text-sm glass-input h-8">
                  <SelectValue placeholder="Select a label" />
                </SelectTrigger>
                <SelectContent
                  className="text-sm rounded-lg bg-white"
                  container={portalContainer || undefined}
                  sideOffset={8}
                  avoidCollisions={false}
                >
                  {labelOptions?.length === 0 ? (
                    <SelectItem style={{ cursor: 'pointer' }} value="#">
                      No Labels
                    </SelectItem>
                  ) : (
                    labelOptions?.map(label => (
                      <SelectItem
                        style={{ cursor: 'pointer' }}
                        key={label.value}
                        value={label.value.toString()}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                            style={{
                              backgroundColor: label.color,
                            }}
                          />
                          {label.label}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          {/* Format pill */}
          <Popover open={openFormat} onOpenChange={setOpenFormat}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 glass-input"
                disabled={isLoading}
                title="Issue format"
              >
                <span className="text-[12px] text-neutral-600">
                  Format <span className="text-neutral-400">▾</span>
                </span>
                <span className="ml-2 text-[12px] text-neutral-900 truncate max-w-[140px]">
                  {(() => {
                    const f = watchedValues.issueFormat;
                    if (!f) return 'Select Format';
                    if (f === 'single') return 'Single';
                    if (f === 'multiple') return 'Multiple';
                    return String(f);
                  })()}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-2 w-56"
              container={portalContainer || undefined}
              align="start"
            >
              <div className="text-xs mb-2 text-neutral-500">Format *</div>
              <Select
                value={watchedValues.issueFormat}
                onValueChange={(value: any) => setValue('issueFormat', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="text-sm glass-input h-8">
                  <SelectValue placeholder="Select a format" />
                </SelectTrigger>
                <SelectContent
                  className="text-sm rounded-lg bg-white"
                  container={portalContainer || undefined}
                  sideOffset={8}
                  avoidCollisions={false}
                >
                  <SelectItem style={{ cursor: 'pointer' }} value="single">
                    Single
                  </SelectItem>
                  <SelectItem style={{ cursor: 'pointer' }} value="multiple">
                    Multiple
                  </SelectItem>
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>

          {/* Assignee pill */}
          <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 glass-input"
                disabled={isLoading || !watchedValues.projectId}
                title="Assign"
              >
                <span className="text-[12px] text-neutral-600">
                  Assignee <span className="text-neutral-400">▾</span>
                </span>
                {(() => {
                  const u = users.find(u => u.id === watchedValues.assigneeId);
                  return (
                    <span className="ml-2 text-[12px] text-neutral-900 truncate max-w-[140px]">
                      {u ? u.name : 'Unassigned'}
                    </span>
                  );
                })()}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-2 w-72"
              container={portalContainer || undefined}
              align="start"
            >
              <div className="text-xs mb-2 text-neutral-500">Assignee</div>
              <Select
                value={watchedValues.assigneeId || ''}
                onValueChange={(value: any) =>
                  setValue('assigneeId', value === 'unassigned' ? '' : value)
                }
                disabled={isLoading || !watchedValues.projectId}
              >
                <SelectTrigger className="text-sm glass-input h-8">
                  <SelectValue placeholder="Select an assignee (optional)" />
                </SelectTrigger>
                <SelectContent
                  className="text-sm rounded-lg bg-white"
                  container={portalContainer || undefined}
                >
                  <SelectItem style={{ cursor: 'pointer' }} value="unassigned">
                    Unassigned
                  </SelectItem>
                  {users.length === 0 ? (
                    <SelectItem
                      style={{ cursor: 'pointer' }}
                      value="#"
                      disabled
                    >
                      {watchedValues.projectId
                        ? 'Loading users...'
                        : 'Select a project first'}
                    </SelectItem>
                  ) : (
                    users.map(user => (
                      <SelectItem
                        style={{ cursor: 'pointer' }}
                        key={user.id}
                        value={user.id}
                      >
                        <div className="flex items-center gap-2">
                          {user.avatarUrl && (
                            <img
                              src={user.avatarUrl}
                              alt={user.name}
                              className="w-4 h-4 rounded-full"
                              onError={e => {
                                (e.target as HTMLImageElement).style.display =
                                  'none';
                              }}
                            />
                          )}
                          <span>{user.name}</span>
                          <span className="text-gray-500">
                            (@{user.username})
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>
          {/* Slack pill */}
          <Popover open={openSlack} onOpenChange={setOpenSlack}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 glass-input"
                disabled={isLoading}
                title="Slack notification"
              >
                <span className="text-[12px] text-neutral-600">
                  Slack <span className="text-neutral-400">▾</span>
                </span>
                {(() => {
                  const enabled = slackEnabled;
                  const ch = (slackChannelsQuery.data || []).find(
                    (c: any) => c.id === watchedValues.slackChannelId
                  );
                  return (
                    <span className="ml-2 text-[12px] text-neutral-900 truncate max-w-[160px]">
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
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-3 w-80 space-y-3"
              container={portalContainer || undefined}
              align="start"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-600">Notify on Slack</div>
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
              {slackEnabled && (
                <>
                  <div>
                    <div className="text-xs mb-1 text-neutral-500">Channel</div>
                    <Select
                      value={watchedValues.slackChannelId || ''}
                      onValueChange={(value: any) =>
                        setValue('slackChannelId', value)
                      }
                      disabled={isLoading || slackChannelsQuery.isLoading}
                    >
                      <SelectTrigger className="text-sm glass-input h-8">
                        <SelectValue
                          placeholder={
                            slackChannelsQuery.isLoading
                              ? 'Loading…'
                              : 'Select a channel'
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
                            style={{ cursor: 'pointer' }}
                            value={c.id}
                          >
                            #{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs mb-1 text-neutral-500">
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
                      <SelectTrigger className="text-sm glass-input h-8">
                        <SelectValue
                          placeholder={
                            slackUsersQuery.isLoading
                              ? 'Loading…'
                              : 'Select a user to notify'
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
                            style={{ cursor: 'pointer' }}
                            value={u.id}
                          >
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
        {/* Title */}
        <div className="space-y-3">
          <Label htmlFor="title" className="mb-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded bg-gray-500"></div>
              </div>
              Title *
            </div>
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
              <div className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded bg-purple-500"></div>
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-neutral-200 glass-nav dark:bg-neutral-800/60 px-2 py-1 text-[12px]">
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
                              await apiService.generateDescriptionFromTemplate({
                                issueFormat: watchedValues.issueFormat,
                                userDescription: watchedValues.description,
                              });
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
                    <TooltipContent>
                      Use AI template on description
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            {mdTab === 'preview' ? (
              <div className="px-3 py-2 text-sm max-h-[520px] overflow-y-auto overflow-x-visible bg-white">
                <div
                  className="tiptap text-[13px] leading-5 focus:outline-none"
                  dangerouslySetInnerHTML={{
                    __html: md.render(watchedValues.description || ''),
                  }}
                />
              </div>
            ) : (
              <div className="px-3 py-2 text-sm">
                <textarea
                  ref={mdTextareaRef}
                  className="w-full min-h-[220px] font-mono text-[13px] leading-5 outline-none bg-transparent resize-y"
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
                  <div className="mt-2 text-xs text-neutral-600 flex items-center gap-1">
                    <FiLoader className="h-3 w-3 animate-spin" /> Uploading
                    image…
                  </div>
                )}
                {pasteError && (
                  <div className="mt-2 text-xs text-red-600">{pasteError}</div>
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
          {aiError && <p className="text-xs text-red-600">{aiError}</p>}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Button
            type="submit"
            variant="outline"
            disabled={
              isLoading ||
              !watchedValues.description ||
              !watchedValues.title ||
              !watchedValues.projectId
            }
            className="text-center flex-1 border-neutral-200"
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
