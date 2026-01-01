import React, { useState } from 'react';
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

import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export const CreateIssueContent: React.FC = () => {
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
    content: '',
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
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
      }
    } catch (e) {
      console.error('AI Generate failed', e);
    } finally {
      setAiLoading(false);
    }
  };

  // --- Sub-components (Pickers) ---

  const ProjectPicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 hover:text-gray-900"
          >
            <span className="text-gray-500">Select Project...</span>
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
          <div className="max-h-[200px] overflow-y-auto p-1"></div>
        </PopoverContent>
      </Popover>
    );
  };

  const LabelPicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-auto py-2 px-3 w-full justify-start text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 relative"
          >
            <div className="flex flex-wrap gap-2 items-center"></div>
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
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1"></div>
        </PopoverContent>
      </Popover>
    );
  };

  const AssigneePicker = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100"
          >
            <div className="flex items-center truncate"></div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="p-2 border-b border-gray-100">
            <input
              className="w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Search users..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            <div
              className={cn(
                'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100'
              )}
            >
              <UserIcon className="w-4 h-4 mr-2 text-gray-500" />
              Unassigned
            </div>
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

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button className="flex-1" size="lg">
              Create Issue
            </Button>
            <Button variant="secondary" size="lg">
              Save Draft
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};
