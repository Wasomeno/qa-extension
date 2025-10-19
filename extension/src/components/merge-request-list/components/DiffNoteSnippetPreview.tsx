import React from 'react';
import type { DiffSnippetState } from './mr-detail-types';
import { formatRangeLabel } from './mr-detail-utils';

interface DiffNoteSnippetPreviewProps {
  state?: DiffSnippetState;
}

export const DiffNoteSnippetPreview: React.FC<DiffNoteSnippetPreviewProps> = ({
  state,
}) => {
  if (!state) {
    return null;
  }

  const { snippet, isLoading, isError, error, request, lineType } = state;

  const pathLabel = snippet?.path ?? request?.filePath;
  const highlightStart = snippet?.highlightStart ?? request?.startLine;
  const highlightEnd = snippet?.highlightEnd ?? request?.endLine;
  const rangeLabel = formatRangeLabel(highlightStart, highlightEnd);
  const lineTypeLabel =
    lineType === 'new' ? 'Head' : lineType === 'old' ? 'Base' : null;

  if (isLoading) {
    return (
      <div className="mt-3 text-[11px] text-neutral-500">
        Loading code snippet…
      </div>
    );
  }

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Please try again later.';
    return (
      <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
        Failed to load code snippet{message ? `: ${message}` : '.'}
      </div>
    );
  }

  if (!snippet) {
    return (
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-600">
        Code snippet unavailable for this comment.
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 text-[10px] font-medium text-neutral-500">
        <div className="flex min-w-0 items-center gap-2">
          {lineTypeLabel && (
            <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
              {lineTypeLabel}
            </span>
          )}
          {pathLabel && (
            <span className="truncate font-mono text-neutral-600">
              {pathLabel}
            </span>
          )}
        </div>
        {rangeLabel && (
          <span className="font-mono text-neutral-500">{rangeLabel}</span>
        )}
      </div>
      <div className="max-h-60 overflow-auto">
        <div className="px-3 py-2 text-[11px] font-mono leading-5 text-neutral-800">
          {snippet.lines.map(line => (
            <div
              key={line.lineNumber}
              className={`flex gap-3 whitespace-pre ${
                line.highlight
                  ? 'bg-yellow-50 border-l-2 border-yellow-200'
                  : ''
              }`}
            >
              <span className="w-12 shrink-0 text-right text-neutral-400 select-none">
                {line.lineNumber}
              </span>
              <span className="flex-1 whitespace-pre">
                {line.content?.length ? line.content : ' '}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
