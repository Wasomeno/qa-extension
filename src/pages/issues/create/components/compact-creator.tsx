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
  FolderGit2,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import { CreateIssueRequest } from '@/api/issue';
import { useGetProjects } from '../hooks/use-get-projects';
import { useCreateIssue } from '../hooks/use-create-issue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { useKeyboardIsolation } from '@/hooks/use-keyboard-isolation';
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

  // Data Fetching
  const { data: projects = [], isLoading: isLoadingProjects } =
    useGetProjects();

  const createIssueMutation = useCreateIssue({
    onSuccess: () => {
      setSuccess('Issue created successfully');
    },
    onError: (err: any) => {
      console.error('Failed to create issue:', err);
      setError(
        'Failed to create issue. Please check your network and try again.'
      );
    },
  });

  // Form state
  const [description, setDescription] = useState(initialData.description || '');
  const [title, setTitle] = useState(initialData.title || '');
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  // Initialize selected project if ID is provided
  useEffect(() => {
    if (initialData.projectId && projects.length > 0 && !selectedProject) {
      const found = projects.find((p: any) => p.id === initialData.projectId);
      if (found) setSelectedProject(found);
    }
  }, [initialData.projectId, projects]);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mdTab, setMdTab] = useState<'write' | 'preview'>('write');
  const [pastingImage, setPastingImage] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Popover states
  const [openProject, setOpenProject] = useState(false);

  // Markdown renderer
  const md = useMemo(() => {
    return new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
  }, []);

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

  const handleCreate = () => {
    if (!selectedProject || !title) {
      setError('Please fill in all required fields');
      return;
    }

    const request: CreateIssueRequest = {
      title,
      description,
      // No labels or assignees for compact mode
      labels: [],
      assignee_ids: [],
    };

    createIssueMutation.mutate({ projectId: selectedProject.id, request });
  };

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

  // Project picker state
  const [projectQuery, setProjectQuery] = useState('');
  const [projectHighlight, setProjectHighlight] = useState(0);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // Filtered project list
  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return (projects || []).filter(
      (p: any) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.path_with_namespace &&
          p.path_with_namespace.toLowerCase().includes(q))
    );
  }, [projects, projectQuery]);

  // Reset picker state when popover opens
  useEffect(() => {
    if (openProject) {
      setProjectQuery('');
      setProjectHighlight(0);
      setTimeout(() => projectInputRef.current?.focus(), 0);
    }
  }, [openProject]);

  // Project picker handlers
  const selectProject = (idx: number) => {
    const p = filteredProjects[idx];
    if (!p) return;
    setSelectedProject(p);
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
      <form
        className="p-3 space-y-3"
        onSubmit={e => {
          e.preventDefault();
          handleCreate();
        }}
      >
        {/* Project selector - full width */}
        <Popover open={openProject} onOpenChange={setOpenProject}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors',
                createIssueMutation.isPending &&
                  'opacity-50 pointer-events-none'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderGit2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-gray-500">Project</span>
                <span className="text-gray-900 font-medium truncate">
                  {selectedProject
                    ? formatProjectName(selectedProject)
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
                {isLoadingProjects ? (
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
                    {filteredProjects.map((p: any, idx) => (
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

        {/* Title Input */}
        <div className="space-y-1">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Issue Title"
            className="w-full"
            disabled={createIssueMutation.isPending}
          />
        </div>

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
                      disabled={
                        aiLoading ||
                        createIssueMutation.isPending ||
                        !description.trim()
                      }
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
                  placeholder="Describe the issue... (Paste images directly)"
                  className="w-full px-3 py-2 min-h-[100px] max-h-[140px] text-sm resize-none outline-none bg-transparent"
                  disabled={createIssueMutation.isPending}
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1 text-xs">
          {/* Removed auto-generated title text */}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={
            createIssueMutation.isPending ||
            !description.trim() ||
            !selectedProject ||
            !title
          }
          className="w-full h-8 text-sm"
        >
          {createIssueMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Creating...
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
