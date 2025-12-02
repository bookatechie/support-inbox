/**
 * Rich Text Editor Component
 * Uses TipTap for WYSIWYG editing
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ResizableImage from 'tiptap-extension-resize-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo,
  Redo,
  X,
  Paperclip,
  Loader2,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CannedResponse } from '@/types';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  cannedResponses?: CannedResponse[];
  variables?: Record<string, string>;
  showVariablesBar?: boolean;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading?: boolean;
  onAiSuggest?: () => void;
  isGeneratingAi?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Type your reply here...',
  disabled = false,
  className,
  cannedResponses = [],
  variables = {},
  showVariablesBar = false,
  onFileUpload,
  isUploading = false,
  onAiSuggest,
  isGeneratingAi = false,
}: RichTextEditorProps) {
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashPosition, setSlashPosition] = useState<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Debounced onChange to avoid expensive HTML conversion on every keystroke
  const debouncedOnChange = useCallback((html: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onChange(html);
    }, 300); // 300ms debounce - fast enough to feel responsive, slow enough to reduce updates
  }, [onChange]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Convert file to base64 data URL
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-primary underline cursor-pointer',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      ResizableImage.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded',
        },
      }),
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    editable: !disabled,
    editorProps: {
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItems = items.filter((item) => item.type.startsWith('image/'));

        if (imageItems.length > 0) {
          event.preventDefault();

          imageItems.forEach((item) => {
            const file = item.getAsFile();
            if (file && editor) {
              // Convert to base64 and insert immediately
              fileToDataURL(file).then((dataURL) => {
                editor.chain().focus().setImage({ src: dataURL }).run();
              });
            }
          });

          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const { from } = editor.state.selection;

      // Check if user just typed "/" (keep this immediate for real-time slash command detection)
      const beforeCursor = text.substring(0, from);
      const lastSlashIndex = beforeCursor.lastIndexOf('/');

      if (lastSlashIndex !== -1) {
        const afterSlash = beforeCursor.substring(lastSlashIndex + 1);
        // Only show menu if "/" is at start of line or after whitespace
        const charBeforeSlash = beforeCursor[lastSlashIndex - 1];
        if (!charBeforeSlash || charBeforeSlash === ' ' || charBeforeSlash === '\n') {
          setSlashPosition(lastSlashIndex);
          setSearchQuery(afterSlash);
          setShowTemplateMenu(true);
          setSelectedIndex(0);
        } else {
          setShowTemplateMenu(false);
        }
      } else {
        setShowTemplateMenu(false);
      }

      // Use debounced onChange to avoid expensive HTML conversion on every keystroke
      debouncedOnChange(editor.getHTML());
    },
  });

  // Sync editor content when content prop changes (e.g., after clearing)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Filter canned responses based on search query
  const filteredResponses = cannedResponses.filter((response) => {
    return response.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Replace variables in template content
  const replaceVariables = (content: string): string => {
    let result = content;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  };

  // Handle template selection
  const insertTemplate = (response: CannedResponse) => {
    if (!editor || slashPosition === null) return;

    // Delete the "/" and search query
    const { from } = editor.state.selection;
    editor.commands.deleteRange({
      from: slashPosition,
      to: from,
    });

    // Replace variables and insert the template content
    const processedContent = replaceVariables(response.content);
    editor.commands.insertContent(processedContent);

    // Close menu
    setShowTemplateMenu(false);
    setSlashPosition(null);
    setSearchQuery('');

    // Focus editor
    editor.commands.focus();
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showTemplateMenu) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredResponses.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredResponses.length) % filteredResponses.length);
      } else if ((e.key === 'Enter' || e.key === 'Tab') && filteredResponses.length > 0) {
        e.preventDefault();
        insertTemplate(filteredResponses[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowTemplateMenu(false);
      }
    };

    if (editor) {
      editor.view.dom.addEventListener('keydown', handleKeyDown);
      return () => {
        editor.view.dom.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showTemplateMenu, filteredResponses, selectedIndex, editor]);

  // Handle link toggle
  const setLink = () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;

    // If already a link, remove it
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    // Prompt for URL
    const url = window.prompt('Enter URL:', previousUrl || 'https://');

    // If cancelled or empty, do nothing
    if (!url) return;

    // Set the link
    editor.chain().focus().setLink({ href: url }).run();
  };

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('border rounded-md relative', className)}>
      {/* Template Menu */}
      {showTemplateMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
          <div className="bg-background border rounded-lg shadow-xl backdrop-blur-sm max-h-[300px] flex flex-col">
            {/* Fixed Header */}
            <div className="px-3 py-2 flex items-center justify-between border-b flex-shrink-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Templates {searchQuery && `· "${searchQuery}"`}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowTemplateMenu(false)}
                type="button"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {/* Scrollable Content */}
            {filteredResponses.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No templates found
              </div>
            ) : (
              <div className="py-1 overflow-y-auto">
                {filteredResponses.map((response, index) => (
                  <button
                    key={response.id}
                    className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                      index === selectedIndex
                        ? 'bg-accent border-l-primary'
                        : 'border-l-transparent hover:bg-accent/50'
                    }`}
                    onClick={() => insertTemplate(response)}
                    type="button"
                  >
                    <div className="font-medium text-sm">{response.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1 shrink-0 rounded-t-md overflow-hidden">
        {/* Text Formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run() || disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('bold') && 'bg-accent'
          )}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run() || disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('italic') && 'bg-accent'
          )}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run() || disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('underline') && 'bg-accent'
          )}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run() || disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('code') && 'bg-accent'
          )}
          title="Code"
        >
          <Code className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={setLink}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('link') && 'bg-accent'
          )}
          title={editor.isActive('link') ? 'Remove Link' : 'Add Link'}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-8 bg-border mx-1" />

        {/* Text Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive({ textAlign: 'left' }) && 'bg-accent'
          )}
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive({ textAlign: 'center' }) && 'bg-accent'
          )}
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive({ textAlign: 'right' }) && 'bg-accent'
          )}
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        {/* Text Color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-8 w-8 p-0"
              title="Text Color"
            >
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="grid grid-cols-5 gap-1 p-2">
              {[
                { color: '#000000', label: 'Black' },
                { color: '#DC2626', label: 'Red' },
                { color: '#EA580C', label: 'Orange' },
                { color: '#CA8A04', label: 'Yellow' },
                { color: '#16A34A', label: 'Green' },
                { color: '#2563EB', label: 'Blue' },
                { color: '#9333EA', label: 'Purple' },
                { color: '#DB2777', label: 'Pink' },
                { color: '#64748B', label: 'Gray' },
                { color: '#ffffff', label: 'White' },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  className={cn(
                    'h-8 w-8 rounded border-2 transition-all hover:scale-110',
                    editor.isActive('textStyle', { color }) ? 'border-primary' : 'border-transparent'
                  )}
                  style={{ backgroundColor: color }}
                  title={label}
                />
              ))}
            </div>
            <DropdownMenuItem
              onClick={() => editor.chain().focus().unsetColor().run()}
              className="text-sm"
            >
              Reset Color
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-8 bg-border mx-1" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('bulletList') && 'bg-accent'
          )}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('orderedList') && 'bg-accent'
          )}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
          className={cn(
            'h-8 w-8 p-0',
            editor.isActive('blockquote') && 'bg-accent'
          )}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </Button>

        <div className="w-px h-8 bg-border mx-1" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run() || disabled}
          className="h-8 w-8 p-0"
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run() || disabled}
          className="h-8 w-8 p-0"
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </Button>

        {/* Attach Files */}
        {onFileUpload && (
          <>
            <div className="w-px h-8 bg-border mx-1" />
            <div>
              <input
                type="file"
                id="editor-file-upload"
                multiple
                onChange={onFileUpload}
                className="hidden"
                disabled={isUploading || disabled}
              />
              <label htmlFor="editor-file-upload">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isUploading || disabled}
                  className="h-8 w-8 p-0"
                  title="Attach files"
                  asChild
                >
                  <span className="cursor-pointer flex items-center justify-center">
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </span>
                </Button>
              </label>
            </div>
          </>
        )}

        {/* AI Suggest */}
        {onAiSuggest && (
          <>
            <div className="w-px h-8 bg-border mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAiSuggest}
              disabled={isGeneratingAi || disabled}
              className="h-8 px-2 gap-1"
              title="AI Suggest"
            >
              {isGeneratingAi ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="text-xs hidden sm:inline">AI</span>
            </Button>
          </>
        )}
      </div>

      {/* Editor Content */}
      <div className={cn(
        'p-4 min-h-[200px] overflow-hidden',
        !showVariablesBar || Object.keys(variables).length === 0 ? 'rounded-b-md' : ''
      )}>
        <EditorContent
          editor={editor}
          className="prose prose-sm dark:prose-invert max-w-none focus-visible:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[150px]"
        />
      </div>

      {/* Available Variables Helper */}
      {showVariablesBar && Object.keys(variables).length > 0 && (
        <div className="px-4 py-3 bg-muted/30 border-t text-xs text-muted-foreground rounded-b-md">
          <div className="font-semibold mb-1.5">Available variables (click to copy):</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(variables).map((key) => (
              <code
                key={key}
                className="bg-background border px-2 py-1 rounded font-mono text-xs cursor-pointer hover:bg-accent transition-colors"
                onClick={async () => {
                  const variableText = `{{${key}}}`;
                  try {
                    await navigator.clipboard.writeText(variableText);
                    // Optional: Show a toast notification
                  } catch (err) {
                    console.error('Failed to copy to clipboard:', err);
                  }
                }}
                title={`Click to copy {{${key}}}`}
              >
                {`{{${key}}}`}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
