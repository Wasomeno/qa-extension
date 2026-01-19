import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Minus,
  Link as LinkIcon,
  Terminal,
  Undo,
  Redo,
  Zap,
  Loader2,
  FileText,
  Table as TableIcon,
  Plus,
  Trash2,
  Columns,
  Rows,
} from 'lucide-react';

import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DescriptionEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  onAIRequest?: () => void;
  aiLoading?: boolean;
  templates?: Record<string, string>;
  placeholder?: string;
  className?: string;
  portalContainer?: HTMLElement | null;
}

export const DescriptionEditor = ({
  content,
  onChange,
  onAIRequest,
  aiLoading = false,
  templates,
  placeholder = 'Describe the issue...',
  className,
  portalContainer,
}: DescriptionEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 hover:underline cursor-pointer',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[150px] px-4 py-3',
          className
        ),
      },
    },
  });

  // Watch for external content resets (only if editor is empty or explicit reset needed)
  useEffect(() => {
    if (editor && content && editor.isEmpty) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden flex flex-col shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-1.5 bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10 backdrop-blur-sm">
        {/* History */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={Undo}
            label="Undo"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={Redo}
            label="Redo"
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1.5" />

        {/* Headings */}
        <div className="flex items-center gap-0.5">
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 1 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            icon={Heading1}
            label="Heading 1"
          />
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 2 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            icon={Heading2}
            label="Heading 2"
          />
          <ToolbarToggle
            pressed={editor.isActive('heading', { level: 3 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            icon={Heading3}
            label="Heading 3"
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1.5" />

        {/* Basic Styles */}
        <div className="flex items-center gap-0.5">
          <ToolbarToggle
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            icon={Bold}
            label="Bold"
          />
          <ToolbarToggle
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            icon={Italic}
            label="Italic"
          />
          <ToolbarToggle
            pressed={editor.isActive('strike')}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
            icon={Strikethrough}
            label="Strikethrough"
          />
          <ToolbarToggle
            pressed={editor.isActive('code')}
            onPressedChange={() => editor.chain().focus().toggleCode().run()}
            icon={Code}
            label="Inline Code"
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1.5" />

        {/* Lists & Blocks */}
        <div className="flex items-center gap-0.5">
          <ToolbarToggle
            pressed={editor.isActive('bulletList')}
            onPressedChange={() =>
              editor.chain().focus().toggleBulletList().run()
            }
            icon={List}
            label="Bullet List"
          />
          <ToolbarToggle
            pressed={editor.isActive('orderedList')}
            onPressedChange={() =>
              editor.chain().focus().toggleOrderedList().run()
            }
            icon={ListOrdered}
            label="Ordered List"
          />
          <ToolbarToggle
            pressed={editor.isActive('blockquote')}
            onPressedChange={() =>
              editor.chain().focus().toggleBlockquote().run()
            }
            icon={Quote}
            label="Quote"
          />
          <ToolbarToggle
            pressed={editor.isActive('codeBlock')}
            onPressedChange={() =>
              editor.chain().focus().toggleCodeBlock().run()
            }
            icon={Terminal}
            label="Code Block"
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1.5" />

        {/* Insert */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={setLink}
            isActive={editor.isActive('link')}
            icon={LinkIcon}
            label="Link"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={editor.isActive('table') ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 w-8 p-0 hover:bg-gray-100',
                  editor.isActive('table') && 'bg-blue-100 text-blue-700'
                )}
              >
                <TableIcon className="w-4 h-4" />
                <span className="sr-only">Table</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" container={portalContainer}>
              <DropdownMenuItem
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
              >
                <TableIcon className="w-4 h-4 mr-2" />
                Insert Table
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!editor.can().addColumnBefore()}
              >
                <Columns className="w-4 h-4 mr-2" />
                Add Column Before
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!editor.can().addColumnAfter()}
              >
                <Columns className="w-4 h-4 mr-2" />
                Add Column After
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!editor.can().deleteColumn()}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!editor.can().addRowBefore()}
              >
                <Rows className="w-4 h-4 mr-2" />
                Add Row Before
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!editor.can().addRowAfter()}
              >
                <Rows className="w-4 h-4 mr-2" />
                Add Row After
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!editor.can().deleteRow()}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Row
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!editor.can().deleteTable()}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1" />

        {/* Templates & AI */}
        <div className="flex items-center gap-2">
          {templates && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-gray-500 hover:text-gray-900 font-normal"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Templates</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" container={portalContainer}>
                {Object.entries(templates).map(([key, value]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => {
                      editor.chain().focus().setContent(value).run();
                      onChange(value);
                    }}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)} Template
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {onAIRequest && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              onClick={onAIRequest}
              disabled={aiLoading || editor.isEmpty}
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-500" />
              )}
              AI Enhance
            </Button>
          )}
        </div>
      </div>

      {/* 
        Inject essential styles for Tiptap content. 
        Since we are in a Shadow DOM or isolated environment, 
        global styles might not apply correctly. 
      */}
      <style>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror p {
          margin-bottom: 0.5rem;
        }
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1rem;
          color: #4b5563;
          margin-left: 0;
          margin-right: 0;
        }
        .ProseMirror pre {
          background-color: #f3f4f6;
          border-radius: 0.375rem;
          padding: 0.75rem;
          font-family: monospace;
          margin-bottom: 0.5rem;
        }
        .ProseMirror code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: monospace;
          font-size: 0.875em;
        }
        .ProseMirror a {
          color: #2563eb;
          text-decoration: underline;
        }
        
        /* Table Styles */
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 0;
          overflow: hidden;
        }
        .ProseMirror td,
        .ProseMirror th {
          min-width: 1em;
          border: 2px solid #ced4da;
          padding: 3px 5px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .ProseMirror th {
          font-weight: bold;
          text-align: left;
          background-color: #f1f3f5;
        }
        .ProseMirror .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(200, 200, 255, 0.4);
          pointer-events: none;
        }
      `}</style>

      <EditorContent editor={editor} />
    </div>
  );
};

// Helper components for Toolbar
interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  isActive?: boolean;
}

const ToolbarButton = ({
  onClick,
  icon: Icon,
  label,
  disabled,
  isActive,
}: ToolbarButtonProps) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-8 w-8 p-0 hover:bg-gray-100',
            isActive && 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          )}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="w-4 h-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface ToolbarToggleProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}

const ToolbarToggle = ({
  pressed,
  onPressedChange,
  icon: Icon,
  label,
  disabled,
}: ToolbarToggleProps) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={pressed}
          onPressedChange={onPressedChange}
          size="sm"
          className={cn(
            'h-8 w-8 p-0 hover:bg-gray-100 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700 data-[state=on]:hover:bg-blue-200'
          )}
          disabled={disabled}
        >
          <Icon className="w-4 h-4" />
          <span className="sr-only">{label}</span>
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
