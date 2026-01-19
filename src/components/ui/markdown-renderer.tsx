import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={cn('text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ className, ...props }) => (
            <h1
              className={cn(
                'scroll-m-20 text-2xl font-extrabold tracking-tight lg:text-5xl mb-6',
                className
              )}
              {...props}
            />
          ),
          h2: ({ className, ...props }) => (
            <h2
              className={cn(
                'scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0 mt-10 mb-4',
                className
              )}
              {...props}
            />
          ),
          h3: ({ className, ...props }) => (
            <h3
              className={cn(
                'scroll-m-20 text-xl font-semibold tracking-tight mt-8 mb-4',
                className
              )}
              {...props}
            />
          ),
          h4: ({ className, ...props }) => (
            <h4
              className={cn(
                'scroll-m-20 text-base font-semibold tracking-tight mt-6 mb-4',
                className
              )}
              {...props}
            />
          ),
          h5: ({ className, ...props }) => (
            <h5
              className={cn(
                'scroll-m-20 text-base font-semibold tracking-tight mt-6 mb-4',
                className
              )}
              {...props}
            />
          ),
          h6: ({ className, ...props }) => (
            <h6
              className={cn(
                'scroll-m-20 text-xs font-semibold tracking-tight mt-6 mb-4',
                className
              )}
              {...props}
            />
          ),
          p: ({ className, ...props }) => (
            <p
              className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}
              {...props}
            />
          ),
          a: ({ className, ...props }) => (
            <a
              className={cn(
                'font-medium underline underline-offset-4 decoration-primary hover:text-primary transition-colors',
                className
              )}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: ({ className, ...props }) => (
            <ul className={cn('[&>li]:mt-2', className)} {...props} />
          ),
          ol: ({ className, ...props }) => (
            <ol
              className={cn('my-6 ml-6 list-decimal [&>li]:mt-2', className)}
              {...props}
            />
          ),
          li: ({ className, ...props }) => (
            <li className={cn('leading-7', className)} {...props} />
          ),
          blockquote: ({ className, ...props }) => (
            <blockquote
              className={cn(
                'mt-6 border-l-2 border-primary/30 pl-6 italic text-muted-foreground',
                className
              )}
              {...props}
            />
          ),
          img: ({ className, alt, ...props }) => (
            <img
              className={cn(
                'rounded-md border my-6 max-w-full h-auto',
                className
              )}
              alt={alt}
              {...props}
            />
          ),
          hr: ({ className, ...props }) => (
            <hr className={cn('my-8 border-border', className)} {...props} />
          ),
          table: ({ className, ...props }) => (
            <div className="my-6 w-full overflow-y-auto">
              <table
                className={cn('w-full border-collapse text-sm', className)}
                {...props}
              />
            </div>
          ),
          tr: ({ className, ...props }) => (
            <tr
              className={cn('m-0 border-t p-0 even:bg-muted', className)}
              {...props}
            />
          ),
          th: ({ className, ...props }) => (
            <th
              className={cn(
                'border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right',
                className
              )}
              {...props}
            />
          ),
          td: ({ className, ...props }) => (
            <td
              className={cn(
                'border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right',
                className
              )}
              {...props}
            />
          ),
          pre: ({ className, ...props }) => (
            <pre
              className={cn(
                'mb-4 mt-6 overflow-x-auto rounded-lg border bg-muted p-4',
                className
              )}
              {...props}
            />
          ),
          code: ({ className, ...props }) => {
            // Check if it's an inline code block (no 'pre' parent usually, but ReactMarkdown structure varies)
            // Actually, ReactMarkdown passes `inline` prop to code component if configured, but default components might not receive it cleanly in all versions.
            // However, standard logic: if it has a match in `className` like `language-` it is block, otherwise inline-ish.
            // But `pre` handles the block container. `code` is inside `pre`.
            // If `code` is NOT inside `pre`, it's inline.
            // We can't easily know parent here without context, but we can rely on styling.
            // Tailwind `pre` styles handle the block.
            // We will style `code` generically, but overrides for block are handled by `pre code` selectors if needed,
            // or we just trust that `pre` gives the background for blocks, and we give background for inline.
            // A common trick:
            return (
              <code
                className={cn(
                  'relative rounded bg-muted/50 px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-foreground',
                  // If it's inside a pre, we might want to remove the background/padding to let pre handle it,
                  // but usually `pre` provides the block padding and background.
                  // We'll trust the Shadcn typography pattern:
                  // "code": "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
                  className
                )}
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
