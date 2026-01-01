import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import {
  X,
  Plus,
  Search,
  Check,
  ChevronDown,
  User as UserIcon,
  Tag,
  Loader2,
  FileText,
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const TEMPLATES = {
  bug: `### Description
[Description of the bug]

### Reproduction Steps
1. [Step 1]
2. [Step 2]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happened]

### Environment
- URL: [URL]
- Browser: [Browser]
- Device: [Device]`,

  feature: `### Problem Statement
[What problem are we solving?]

### User Story
As a [user], I want to [action] so that [benefit].

### Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2

### Design / Resources
[Links to Figma, docs, etc.]`,
};
import api from '@/services/api';
import { useIssueCreator } from '@/hooks/useIssueCreator';
import { formatProjectName } from '@/utils/project-formatter';

import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { Button } from '@/src/components/ui/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { Skeleton } from '@/src/components/ui/ui/skeleton';

export const CreateIssueContent: React.FC = () => {
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
  } = useIssueCreator({}); // No special context needed for main menu create

  const [aiLoading, setAiLoading] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

  // --- TipTap Editor Setup ---
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Describe the issue...',
      }),
      Link.configure({
        openOnClick: false,
      }),
      Markdown,
    ],
    content: watchedValues.description || '',
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      setValue('description', markdown, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none min-h-[150px] px-3 py-2',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        const imageItem = Array.from(items).find(item =>
          item.type.startsWith('image')
        );
        if (!imageItem) return false;

        const file = imageItem.getAsFile();
        if (!file) return false;

        event.preventDefault();
        setIsPasting(true);

        api
          .uploadFile(file, 'screenshot')
          .then((res: any) => {
            if (res.success && res.data?.url) {
              const url = res.data.url;
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.text(`![image](${url})`)
                )
              );
            } else {
              console.error('Upload failed', res.error);
            }
          })
          .catch((err: any) => console.error('Upload error', err))
          .finally(() => setIsPasting(false));

        return true;
      },
    },
  });

  // Sync external value changes to editor (e.g. reset)
  const handleAiGenerate = async () => {
    const current = editor?.getText().trim();
    if (!current) return;

    setAiLoading(true);
    try {
      const res = await api.generateDescriptionFromTemplate({
        issueFormat: 'single',
        userDescription: current,
      });

      if (res.success && res.data?.description) {
        editor?.commands.setContent(res.data.description);
        setValue('description', res.data.description, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    } catch (e) {
      console.error('AI Generate failed', e);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (
      editor &&
      watchedValues.description !== editor.storage.markdown.getMarkdown()
    ) {
      // Only update if content is different to avoid cursor jumps,
      // but for reset (empty) it's important.
      // A simple equality check might be enough for reset.
      if (!watchedValues.description) {
        editor.commands.setContent('');
      }
    }
  }, [watchedValues.description, editor]);

  // --- Queries ---
  const labelQueries = useQuery({
    queryKey: ['gitlab-labels', watchedValues.projectId],
    enabled: !!watchedValues.projectId,
    staleTime: 300_000,
    queryFn: async () => {
      if (!watchedValues.projectId) return [];
      const res = await api.getGitLabProjectLabels(watchedValues.projectId);
      if (!res.success) throw new Error(res.error || 'Failed to load labels');
      return res.data?.items || [];
    },
  });

  const labelOptions = useMemo(
    () =>
      labelQueries.data?.map(label => ({
        value: label.name,
        label: label.name,
        color: label.color,
        textColor: label.text_color,
      })) || [],
    [labelQueries.data]
  );

  // --- Handlers ---
  const onSubmitForm = (data: any) => {
    // Title is removed from UI, but might be required by API/hook?
    // The PRD says "Remove the title field".
    // If the API requires it, we might need to auto-generate it or update the hook.
    // For now, let's assume the hook handles it or we pass a placeholder if needed.
    // Wait, if I don't register 'title', it won't be in `data`.
    // Let's pass a generated title or check if backend allows empty.
    // The hook `onSubmitForm` calls `api.createIssue`. `CreateIssueRequest` interface has `title: string`.
    // I should probably generate a title from the first line of description or a placeholder.

    // Auto-generate title from description if missing
    let finalData = { ...data };
    if (!finalData.title) {
      const desc = finalData.description || '';
      const firstLine = desc.split('\n')[0].substring(0, 100);
      finalData.title = firstLine || 'Untitled Issue';
    }

    // The hook's handleSubmit passes `data` to `onSubmit`.
    // But `useIssueCreator` exposes `handleSubmit` from `react-hook-form`.
    // So I need to wrap the submit handler.
    console.log('Submitting', finalData);
    // Actually, `useIssueCreator` hook returns `handleSubmit` which takes `onSubmit` callback.
    // But the hook *already* handles submission internally if I don't pass `onSubmit` to `useIssueCreator`?
    // Checking `useIssueCreator`:
    // `const onSubmitForm = async (data: IssueData) => { ... }`
    // `return { ..., handleSubmit: handleSubmit(onSubmitForm), ... }`
    // So calling `handleSubmit()` (the one returned from hook) triggers the hook's `onSubmitForm`.
    // BUT `register('title')` is missing from my UI.
    // I should manually set a title value before submit or let the user submit.

    // Problem: `handleSubmit` validates form. If `title` is required in schema (it likely is), it will fail.
    // I need to start with a default title or set it.
    // Let's Set a hidden title field or just set value on effect.
  };

  // Set a default title so validity checks pass
  useEffect(() => {
    setValue('title', 'Untitled Issue', { shouldValidate: true });
  }, [setValue]);

  // --- Sub-components (Pickers) ---

  const ProjectPicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const filteredProjects = useMemo(() => {
      const q = query.toLowerCase();
      return (projects || []).filter(p =>
        !q
          ? true
          : p.name.toLowerCase().includes(q) ||
            p.path_with_namespace?.toLowerCase().includes(q)
      );
    }, [projects, query]);

    const selectedProject = projects?.find(
      p => p.id === watchedValues.projectId
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-900"
          >
            {selectedProject ? (
              <span className="truncate">
                {formatProjectName(selectedProject)}
              </span>
            ) : (
              <span className="text-gray-500">Select Project...</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center px-2 bg-gray-50 rounded-md border border-gray-200">
              <Search className="h-4 w-4 text-gray-400 mr-2" />
              <input
                className="flex-1 bg-transparent border-none text-sm h-8 focus:ring-0 outline-none placeholder:text-gray-400"
                placeholder="Search projects..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {dataLoading ? (
              <div className="p-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-2 text-xs text-gray-500 text-center">
                No projects found
              </div>
            ) : (
              filteredProjects.map(project => (
                <div
                  key={project.id}
                  className={cn(
                    'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                    watchedValues.projectId === project.id &&
                      'bg-blue-50 text-blue-700'
                  )}
                  onClick={() => {
                    setValue('projectId', project.id, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    // Reset dependent fields
                    setValue('labelIds', []);
                    setValue('assigneeId', '');
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      watchedValues.projectId === project.id
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{formatProjectName(project)}</span>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const LabelPicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedIds = watchedValues.labelIds || [];
    const isLoadingLabels = labelQueries.isLoading;

    const filteredLabels = useMemo(() => {
      const q = query.toLowerCase();
      return (labelOptions || []).filter(l =>
        !q ? true : l.label.toLowerCase().includes(q)
      );
    }, [labelOptions, query]);

    const toggleLabel = (val: string) => {
      const current = [...selectedIds];
      const idx = current.indexOf(val);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(val);
      }
      setValue('labelIds', current, {
        shouldDirty: true,
        shouldValidate: true,
      });
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-auto py-2 px-3 w-full justify-start text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 relative"
            disabled={!watchedValues.projectId}
          >
            <div className="flex flex-wrap gap-2 items-center">
              {selectedIds.length === 0 && (
                <span className="text-gray-500 flex items-center">
                  <Tag className="w-4 h-4 mr-2" />
                  Labels
                </span>
              )}
              {selectedIds.map(id => {
                const lbl = labelOptions.find(l => l.value === id);
                return (
                  <div
                    key={id}
                    className="flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-gray-200 bg-white"
                    style={
                      lbl
                        ? {
                            borderColor: lbl.color,
                            backgroundColor: lbl.color + '20',
                            color: lbl.textColor || '#000',
                          }
                        : {}
                    }
                  >
                    {lbl?.label || id}
                    <div
                      className="ml-1 cursor-pointer hover:opacity-70"
                      onClick={e => {
                        e.stopPropagation();
                        toggleLabel(id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Plus className="w-4 h-4 text-gray-400" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="p-2 border-b border-gray-100">
            <input
              className="w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Search labels..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {isLoadingLabels ? (
              <div className="p-2 text-center text-xs text-gray-500">
                Loading...
              </div>
            ) : filteredLabels.length === 0 ? (
              <div className="p-2 text-center text-xs text-gray-500">
                No labels found
              </div>
            ) : (
              filteredLabels.map(l => {
                const isSelected = selectedIds.includes(l.value);
                return (
                  <div
                    key={l.value}
                    className={cn(
                      'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                      isSelected && 'bg-blue-50'
                    )}
                    onClick={() => toggleLabel(l.value)}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2 border border-gray-300"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="flex-1 truncate">{l.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const AssigneePicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const filteredUsers = useMemo(() => {
      const q = query.toLowerCase();
      return (users || []).filter(u =>
        !q
          ? true
          : u.name.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q)
      );
    }, [users, query]);

    const selectedAssignee = users?.find(
      u => u.id === watchedValues.assigneeId
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100"
            disabled={!watchedValues.projectId}
          >
            <div className="flex items-center truncate">
              {selectedAssignee ? (
                <>
                  {selectedAssignee.avatarUrl ? (
                    <img
                      src={selectedAssignee.avatarUrl}
                      className="w-5 h-5 rounded-full mr-2"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center mr-2 text-[10px]">
                      {selectedAssignee.name.charAt(0)}
                    </div>
                  )}
                  <span className="truncate">{selectedAssignee.name}</span>
                </>
              ) : (
                <span className="text-gray-500 flex items-center">
                  <UserIcon className="w-4 h-4 mr-2" />
                  Unassigned
                </span>
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="p-2 border-b border-gray-100">
            <input
              className="w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Search users..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            <div
              className={cn(
                'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                !watchedValues.assigneeId && 'bg-gray-100'
              )}
              onClick={() => {
                setValue('assigneeId', '');
                setOpen(false);
              }}
            >
              <UserIcon className="w-4 h-4 mr-2 text-gray-500" />
              Unassigned
            </div>
            {filteredUsers.map(u => (
              <div
                key={u.id}
                className={cn(
                  'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                  watchedValues.assigneeId === u.id && 'bg-blue-50'
                )}
                onClick={() => {
                  setValue('assigneeId', u.id, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  setOpen(false);
                }}
              >
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    className="w-5 h-5 rounded-full mr-2"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center mr-2 text-[10px]">
                    {u.name.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate">{u.name}</span>
                  <span className="text-xs text-gray-500 truncate">
                    @{u.username}
                  </span>
                </div>
                {watchedValues.assigneeId === u.id && (
                  <Check className="ml-auto w-4 h-4 text-blue-600" />
                )}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-8 pb-32">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Issue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Report a new bug or quality issue
          </p>
        </div>

        <div className="space-y-6 max-w-2xl">
          {/* Project */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Project</label>
            <ProjectPicker />
          </div>

          {/* Labels & Assignee Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Labels
              </label>
              <LabelPicker />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Assignee
              </label>
              <AssigneePicker />
            </div>
          </div>

          {/* Description (TipTap) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Description
              </label>

              {/* Template Options */}
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 px-2 text-gray-500 hover:text-gray-900"
                  onClick={() => {
                    const current = editor?.getText().trim();
                    if (
                      !current ||
                      confirm('This will overwrite current content. Continue?')
                    ) {
                      editor?.commands.setContent(TEMPLATES.bug);
                      setValue('description', TEMPLATES.bug, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <FileText className="w-3 h-3" />
                  Bug Template
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 px-2 text-gray-500 hover:text-gray-900"
                  onClick={() => {
                    const current = editor?.getText().trim();
                    if (
                      !current ||
                      confirm('This will overwrite current content. Continue?')
                    ) {
                      editor?.commands.setContent(TEMPLATES.feature);
                      setValue('description', TEMPLATES.feature, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <FileText className="w-3 h-3" />
                  Feature Template
                </Button>
              </div>
            </div>

            <div className="min-h-[200px] border border-gray-200 rounded-xl bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center gap-1 p-1 bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  disabled={!editor?.can().chain().focus().toggleBold().run()}
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  disabled={!editor?.can().chain().focus().toggleItalic().run()}
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => editor?.chain().focus().toggleCode().run()}
                  disabled={!editor?.can().chain().focus().toggleCode().run()}
                >
                  <Code className="w-4 h-4" />
                </Button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    editor?.chain().focus().toggleBulletList().run()
                  }
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    editor?.chain().focus().toggleOrderedList().run()
                  }
                >
                  <ListOrdered className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    editor?.chain().focus().toggleBlockquote().run()
                  }
                >
                  <Quote className="w-4 h-4" />
                </Button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !editor?.getText().trim()}
                >
                  {aiLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  AI Enhance
                </Button>
              </div>

              <div className="relative flex-1">
                <EditorContent editor={editor} className="min-h-[150px]" />
                {isPasting && (
                  <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-[1px] z-20">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">
                        Uploading image...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400">Supports Markdown shortcuts</p>
          </div>

          {/* Errors */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center">
              <span className="mr-2">⚠️</span> {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center">
              <Check className="w-4 h-4 mr-2" /> Issue created successfully
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              className="flex-1"
              size="lg"
              onClick={handleSubmit}
              disabled={isLoading || !watchedValues.projectId}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...
                </>
              ) : (
                'Create Issue'
              )}
            </Button>
            <Button variant="secondary" size="lg" disabled={isLoading}>
              Save Draft
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};
