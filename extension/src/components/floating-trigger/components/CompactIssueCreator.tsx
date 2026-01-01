import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import {
  X,
  Loader2,
  Bold,
  Italic,
  Code,
  Link as LinkIcon,
  Eye,
  List,
  ListOrdered,
  Quote,
  Table,
  CheckSquare,
  Zap,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  FolderGit2,
  Tags,
} from 'lucide-react';
import { Button } from '@/src/components/ui/ui/button';
import { Label } from '@/src/components/ui/ui/label';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
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
import { apiService } from '@/services/api';
import api from '@/services/api';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { formatProjectName } from '@/utils/project-formatter';
import { cn } from '@/lib/utils';
import MarkdownIt from 'markdown-it';

interface CompactIssueCreatorProps {
  onClose: () => void;
  portalContainer: HTMLElement | null;
  initialData?: {
    title?: string;
    description?: string;
    projectId?: number;
    labelIds?: string[];
  };
  context?: {
    url?: string;
    title?: string;
    screenshot?: string;
  };
}

interface LabelOption {
  value: string;
  label: string;
  color: string;
}

const CompactIssueCreator: React.FC<CompactIssueCreatorProps> = ({
  onClose,
  portalContainer,
  initialData = {},
}) => {
  const keyboardIsolation = useKeyboardIsolation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mdTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Track mounted state for portal container
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    // Set portal ready after mount so containerRef.current is available
    setPortalReady(true);
  }, []);

  // Use containerRef as portal container if portalContainer is null (for Shadow DOM compatibility)
  const getPortalContainer = useCallback((): HTMLElement | undefined => {
    if (portalContainer) return portalContainer;
    if (containerRef.current) return containerRef.current;
    return undefined;
  }, [portalContainer, portalReady]);

  // Form state
  const [description, setDescription] = useState(initialData.description || '');
  const [selectedProject, setSelectedProject] = useState<
    string | number | null
  >(initialData.projectId || null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    initialData.labelIds || []
  );
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);

  // Data state
  const [projects, setProjects] = useState<any[]>([]);
  const [labelOptions, setLabelOptions] = useState<LabelOption[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mdTab, setMdTab] = useState<'write' | 'preview'>('write');
  const [pastingImage, setPastingImage] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<'idle' | 'title' | 'creating'>(
    'idle'
  );

  // Popover states
  const [openProject, setOpenProject] = useState(false);
  const [openLabels, setOpenLabels] = useState(false);

  // Markdown renderer
  const md = useMemo(() => {
    return new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
  }, []);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      setDataLoading(true);
      try {
        const result = await apiService.getProjects();
        if (result.success && result.data) {
          setProjects(result.data);
          if (!selectedProject && result.data.length > 0) {
            setSelectedProject(result.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setDataLoading(false);
      }
    };
    loadProjects();
  }, []);

  // Load labels when project changes
  useEffect(() => {
    if (!selectedProject) {
      setLabelOptions([]);
      return;
    }

    const loadLabels = async () => {
      setLabelsLoading(true);
      try {
        const res = await api.getGitLabProjectLabels(selectedProject);
        if (res.success && res.data?.items) {
          setLabelOptions(
            res.data.items.map(label => ({
              value: label.name,
              label: label.name,
              color: label.color,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load labels:', err);
      } finally {
        setLabelsLoading(false);
      }
    };
    loadLabels();
  }, [selectedProject]);

  // Clear success message after delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [success, onClose]);

  // Markdown toolbar helpers
  const getSel = useCallback(() => {
    const el = mdTextareaRef.current;
    if (!el) return null;
    const v = description;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    return { el, v, start, end };
  }, [description]);

  const wrapSelection = useCallback(
    (left: string, right: string) => {
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
      setDescription(newText);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(caretStart, caretEnd);
      }, 0);
    },
    [getSel]
  );

  const prefixLine = useCallback(
    (prefix: string) => {
      const s = getSel();
      if (!s) return;
      const { el, v, start } = s;
      const lineStart = v.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const newText = v.slice(0, lineStart) + prefix + v.slice(lineStart);
      const caret = start + prefix.length;
      setDescription(newText);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      }, 0);
    },
    [getSel]
  );

  const insertCodeBlock = useCallback(() => {
    const s = getSel();
    if (!s) return;
    const { el, v, start, end } = s;
    const selected = v.slice(start, end);
    const before = v.slice(0, start);
    const after = v.slice(end);
    const snippet = '```\n' + selected + '\n```';
    const newText = before + snippet + after;
    const caret = before.length + 4 + selected.length;
    setDescription(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }, [getSel]);

  const insertTable = useCallback(() => {
    const s = getSel();
    if (!s) return;
    const { el, v, start } = s;
    const tpl = '\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n';
    const newText = v.slice(0, start) + tpl + v.slice(start);
    const caret = start + tpl.length - 6;
    setDescription(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }, [getSel]);

  const insertLink = useCallback(() => {
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
    setDescription(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  }, [getSel]);

  // Image paste handler
  const handleMarkdownPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
        if (!files.length) return;

        e.preventDefault();
        setPastingImage(true);
        setPasteError(null);

        const file = files[0];
        const resp = await apiService.uploadFile(file, 'screenshot');
        if (resp.success && (resp.data as any)?.url) {
          const url = (resp.data as any).url as string;
          const el = mdTextareaRef.current;
          const v = description;
          const start = el?.selectionStart ?? v.length;
          const end = el?.selectionEnd ?? start;
          const before = v.slice(0, start);
          const after = v.slice(end);
          const insertion =
            (before.endsWith('\n') ? '' : '\n') +
            `![pasted-image](${url})` +
            '\n';
          const newText = before + insertion + after;
          setDescription(newText);
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
    },
    [description]
  );

  // AI description generation
  const handleAiGenerate = useCallback(async () => {
    if (!description.trim()) return;
    setAiError(null);
    setAiLoading(true);
    try {
      const resp = await apiService.generateDescriptionFromTemplate({
        issueFormat: 'single',
        userDescription: description,
      });
      if (resp.success && resp.data?.description) {
        setDescription(resp.data.description);
      } else {
        const errVal: any = (resp as any)?.error;
        const msg =
          typeof errVal === 'string'
            ? errVal
            : errVal?.message || 'Failed to generate description';
        throw new Error(msg);
      }
    } catch (e: any) {
      setAiError(e?.message || 'Failed to generate description');
    } finally {
      setAiLoading(false);
    }
  }, [description]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !description.trim()) return;

    setLoading(true);
    setError(null);
    setTitleError(null);
    setSuccess(null);
    try {
      setSubmitStage('title');
      const projectMeta = projects.find(p => p.id === selectedProject);
      const titleResp = await apiService.generateGitLabIssueTitle(
        selectedProject,
        {
          description: description.trim(),
          projectPath:
            projectMeta?.path_with_namespace ||
            projectMeta?.full_path ||
            projectMeta?.name,
        }
      );
      if (!titleResp.success || !titleResp.data?.title) {
        throw new Error(
          (titleResp as any)?.error || 'Failed to generate a title'
        );
      }
      const autoTitle = (titleResp.data.title || '').trim();
      if (!autoTitle) {
        throw new Error('Generated title was empty');
      }
      setGeneratedTitle(autoTitle);

      setSubmitStage('creating');
      await apiService.createGitLabIssue(
        selectedProject,
        {
          title: autoTitle,
          description: description.trim(),
          labels: selectedLabels,
        },
        undefined
      );

      setSuccess('Issue created successfully!');
      setDescription('');
      setSelectedLabels([]);
      setGeneratedTitle(null);
      setSubmitStage('idle');
    } catch (err: any) {
      const message = err?.message || 'Failed to create issue';
      setTitleError(message.toLowerCase().includes('title') ? message : null);
      setError(message);
      setSubmitStage('idle');
    } finally {
      setLoading(false);
    }
  };

  // Project picker state
  const [projectQuery, setProjectQuery] = useState('');
  const [projectHighlight, setProjectHighlight] = useState(0);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Labels picker state
  const [labelQuery, setLabelQuery] = useState('');
  const [labelHighlight, setLabelHighlight] = useState(0);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Filtered project list
  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return (projects || []).filter(
      p =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.path_with_namespace &&
          p.path_with_namespace.toLowerCase().includes(q))
    );
  }, [projects, projectQuery]);

  // Filtered labels list
  const filteredLabels = useMemo(() => {
    const q = labelQuery.trim().toLowerCase();
    return (labelOptions || []).filter(
      l => !q || l.label.toLowerCase().includes(q)
    );
  }, [labelOptions, labelQuery]);

  // Reset picker state when popover opens
  useEffect(() => {
    if (openProject) {
      setProjectQuery('');
      setProjectHighlight(0);
      setTimeout(() => projectInputRef.current?.focus(), 0);
    }
  }, [openProject]);

  useEffect(() => {
    if (openLabels) {
      setLabelQuery('');
      setLabelHighlight(0);
      setTimeout(() => labelInputRef.current?.focus(), 0);
    }
  }, [openLabels]);

  // Project picker handlers
  const selectProject = (idx: number) => {
    const p = filteredProjects[idx];
    if (!p) return;
    setSelectedProject(p.id);
    setSelectedLabels([]);
    setOpenProject(false);
  };

  const handleProjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProjectHighlight(h =>
        Math.min(h + 1, Math.max(0, filteredProjects.length - 1))
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProjectHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectProject(projectHighlight);
    } else if (e.key === 'Escape') {
      setOpenProject(false);
    }
  };

  // Labels picker handlers
  const toggleLabel = (labelValue: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelValue)
        ? prev.filter(l => l !== labelValue)
        : [...prev, labelValue]
    );
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLabelHighlight(h =>
        Math.min(h + 1, Math.max(0, filteredLabels.length - 1))
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLabelHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const l = filteredLabels[labelHighlight];
      if (l) toggleLabel(l.value);
    } else if (e.key === 'Escape') {
      setOpenLabels(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full relative"
      onMouseDown={e => e.stopPropagation()}
      onMouseUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      {...keyboardIsolation}
    >
      {/* Close button - top right */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded-full transition-colors z-10"
      >
        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
      </button>

      {/* Status banners */}
      {(error || success) && (
        <div className="px-3 pt-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="p-0.5 hover:bg-red-100 rounded"
              >
                <X className="w-3 h-3 text-red-500" />
              </button>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <p className="text-xs text-green-700">{success}</p>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-3 space-y-3">
        {/* Project selector - full width */}
        <Popover open={openProject} onOpenChange={setOpenProject}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors',
                loading && 'opacity-50 pointer-events-none'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderGit2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-gray-500">Project</span>
                <span className="text-gray-900 font-medium truncate">
                  {selectedProject
                    ? formatProjectName(
                        projects.find(p => p.id === selectedProject) || {
                          name: 'Select',
                        }
                      )
                    : 'Select project'}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-gray-400 flex-shrink-0 transition-transform',
                  openProject && 'rotate-180'
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-2 w-[var(--radix-popover-trigger-width)]"
            container={getPortalContainer()}
            align="start"
          >
            <div className="space-y-2">
              <input
                ref={projectInputRef}
                className="text-sm w-full px-2 py-1.5 h-8 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search projects..."
                value={projectQuery}
                onChange={e => setProjectQuery(e.target.value)}
                onKeyDown={handleProjectKeyDown}
              />
              <div className="max-h-48 overflow-auto">
                {dataLoading ? (
                  <div className="space-y-2 p-1">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-xs text-gray-500 px-2 py-3 text-center">
                    No projects found
                  </div>
                ) : (
                  <ul role="listbox" className="text-sm">
                    {filteredProjects.map((p, idx) => (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={idx === projectHighlight}
                      >
                        <button
                          type="button"
                          className={cn(
                            'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                            idx === projectHighlight
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50'
                          )}
                          onMouseEnter={() => setProjectHighlight(idx)}
                          onClick={() => selectProject(idx)}
                        >
                          {formatProjectName(p)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Labels selector - full width */}
        <Popover open={openLabels} onOpenChange={setOpenLabels}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors',
                (loading || !selectedProject) &&
                  'opacity-50 pointer-events-none'
              )}
              disabled={!selectedProject}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Tags className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-gray-500">Labels</span>
                {selectedLabels.length > 0 ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    {selectedLabels.slice(0, 3).map(labelName => {
                      const labelOpt = labelOptions.find(
                        l => l.value === labelName
                      );
                      return (
                        <span
                          key={labelName}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: labelOpt?.color }}
                          />
                          <span className="truncate max-w-[80px]">
                            {labelName}
                          </span>
                        </span>
                      );
                    })}
                    {selectedLabels.length > 3 && (
                      <span className="text-gray-500 text-xs">
                        +{selectedLabels.length - 3}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">Select labels</span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-gray-400 flex-shrink-0 transition-transform',
                  openLabels && 'rotate-180'
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-2 w-[var(--radix-popover-trigger-width)]"
            container={getPortalContainer()}
            align="start"
          >
            <div className="space-y-2">
              <input
                ref={labelInputRef}
                className="text-sm w-full px-2 py-1.5 h-8 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search labels..."
                value={labelQuery}
                onChange={e => setLabelQuery(e.target.value)}
                onKeyDown={handleLabelKeyDown}
                disabled={!selectedProject}
              />
              <div className="max-h-48 overflow-auto">
                {labelsLoading ? (
                  <div className="space-y-2 p-1">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                ) : filteredLabels.length === 0 ? (
                  <div className="text-xs text-gray-500 px-2 py-3 text-center">
                    {labelOptions.length === 0
                      ? 'No labels available'
                      : 'No labels found'}
                  </div>
                ) : (
                  <ul role="listbox" className="text-sm">
                    {filteredLabels.map((l, idx) => {
                      const isSelected = selectedLabels.includes(l.value);
                      return (
                        <li
                          key={l.value}
                          role="option"
                          aria-selected={idx === labelHighlight}
                        >
                          <button
                            type="button"
                            className={cn(
                              'w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors',
                              idx === labelHighlight
                                ? 'bg-blue-50'
                                : isSelected
                                  ? 'bg-gray-50'
                                  : 'hover:bg-gray-50'
                            )}
                            onMouseEnter={() => setLabelHighlight(idx)}
                            onClick={() => toggleLabel(l.value)}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0"
                              style={{ backgroundColor: l.color }}
                            />
                            <span className="flex-1 truncate">{l.label}</span>
                            {isSelected && (
                              <CheckCircle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {selectedLabels.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => setSelectedLabels([])}
                  >
                    Clear all ({selectedLabels.length})
                  </button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Description with markdown toolbar */}
        <div className="space-y-1">
          <Label
            htmlFor="description"
            className="text-xs font-medium text-gray-700"
          >
            Description
          </Label>

          <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-shadow">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-1 border-b border-gray-100 bg-gray-50/50 px-2 py-1">
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={mdTab === 'preview' ? 'secondary' : 'ghost'}
                  className="h-6 w-6 p-0"
                  title="Preview"
                  onClick={() =>
                    setMdTab(mdTab === 'preview' ? 'write' : 'preview')
                  }
                >
                  <Eye className="w-3 h-3" />
                </Button>

                <span className="mx-1 h-3 w-px bg-gray-200" />

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Bold"
                  onClick={() => wrapSelection('**', '**')}
                  disabled={mdTab === 'preview'}
                >
                  <Bold className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Italic"
                  onClick={() => wrapSelection('*', '*')}
                  disabled={mdTab === 'preview'}
                >
                  <Italic className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Code"
                  onClick={() => wrapSelection('`', '`')}
                  disabled={mdTab === 'preview'}
                >
                  <Code className="w-3 h-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Link"
                  onClick={insertLink}
                  disabled={mdTab === 'preview'}
                >
                  <LinkIcon className="w-3 h-3" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-xs"
                      title="More"
                      disabled={mdTab === 'preview'}
                    >
                      ⋯
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    container={getPortalContainer()}
                  >
                    <DropdownMenuLabel className="text-xs">
                      Insert
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => prefixLine('- ')}>
                      <List className="w-3.5 h-3.5 mr-2" />
                      Bulleted list
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => prefixLine('1. ')}>
                      <ListOrdered className="w-3.5 h-3.5 mr-2" />
                      Numbered list
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => prefixLine('- [ ] ')}>
                      <CheckSquare className="w-3.5 h-3.5 mr-2" />
                      Task list
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => prefixLine('> ')}>
                      <Quote className="w-3.5 h-3.5 mr-2" />
                      Quote
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={insertTable}>
                      <Table className="w-3.5 h-3.5 mr-2" />
                      Table
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={insertCodeBlock}>
                      <Code className="w-3.5 h-3.5 mr-2" />
                      Code block
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      title="AI enhance"
                      disabled={aiLoading || loading || !description.trim()}
                      onClick={handleAiGenerate}
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 text-amber-500" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipPortal container={getPortalContainer()}>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Enhance with AI</p>
                    </TooltipContent>
                  </TooltipPortal>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Editor/Preview area */}
            {mdTab === 'preview' ? (
              <div className="px-3 py-2 min-h-[100px] max-h-[140px] overflow-y-auto bg-white">
                {description.trim() ? (
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{
                      __html: md.render(description),
                    }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    Nothing to preview
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <textarea
                  ref={mdTextareaRef}
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onPaste={handleMarkdownPaste}
                  placeholder="Describe the issue... (Paste images directly)"
                  className="w-full px-3 py-2 min-h-[100px] max-h-[140px] text-sm resize-none outline-none bg-transparent"
                  disabled={loading}
                />
                {pastingImage && (
                  <div className="absolute bottom-2 left-3 text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>
            )}
          </div>

          {pasteError && <p className="text-xs text-red-600">{pasteError}</p>}
          {aiError && <p className="text-xs text-red-600">{aiError}</p>}
        </div>

        <div className="space-y-1 text-xs">
          <p className="text-gray-600">
            Title will be auto-generated from the project path and description
            when you create the issue.
          </p>
          {generatedTitle && (
            <div className="text-gray-800 border border-gray-200 rounded-md px-2 py-1 bg-gray-50">
              <span className="font-medium">Last generated:</span>{' '}
              <span className="break-words">{generatedTitle}</span>
            </div>
          )}
          {titleError && <p className="text-red-600">{titleError}</p>}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading || !description.trim() || !selectedProject}
          className="w-full h-8 text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {submitStage === 'title' ? 'Generating title...' : 'Creating...'}
            </>
          ) : (
            'Create Issue'
          )}
        </Button>
      </form>
    </div>
  );
};

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-2 px-2 py-1">
    <Skeleton className="h-4 w-4 rounded" />
    <Skeleton className="h-4 w-32" />
  </div>
);

export default CompactIssueCreator;
