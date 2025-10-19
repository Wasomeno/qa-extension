import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/src/components/ui/ui/button';
import type { MRNoteSnippet } from '@/types/merge-requests';
import type {
  DiffNoteFixUIState,
  DiffNoteApplyState,
  DiffSnippetRequestParams,
} from './mr-detail-types';

interface DiffNoteFixActionsProps {
  state: DiffNoteFixUIState;
  canGenerate: boolean;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  onGenerate: () => void;
  applyState: DiffNoteApplyState;
  onPreviewApply: () => void;
  onCommitMessageChange: (value: string) => void;
  onConfirmApply: () => void;
  onClosePreview: () => void;
  onUndo: () => void;
  snippet: MRNoteSnippet | null;
  request?: DiffSnippetRequestParams;
}

export const DiffNoteFixActions: React.FC<DiffNoteFixActionsProps> = ({
  state,
  canGenerate,
  instructions,
  onInstructionsChange,
  onGenerate,
  applyState,
  onPreviewApply,
  onCommitMessageChange,
  onConfirmApply,
  onClosePreview,
  onUndo,
  snippet,
  request,
}) => {
  const { status, summary, updatedCode, warnings, errorMessage } = state;
  const showInstructions = status === 'success';
  const isGeneratingFix = status === 'loading';
  const previewBusy =
    applyState.status === 'preview-loading' || applyState.status === 'applying';
  const undoAvailable = Boolean(applyState.undoToken);
  const isUndoing = applyState.status === 'undoing';
  const appliedSuccessfully = applyState.status === 'applied';
  const inlineErrorMessage =
    status === 'error'
      ? errorMessage
      : applyState.status === 'error' && !applyState.showPreview
        ? applyState.errorMessage
        : undefined;

  const controls = (() => {
    if (status === 'loading') {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          disabled
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Preparing suggestion…
        </Button>
      );
    }

    if (status === 'error') {
      return (
        <div className="space-y-2">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
            {inlineErrorMessage || 'Failed to generate fix. Please try again.'}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={onGenerate}
          >
            <Sparkles className="w-3 h-3" />
            Try Again
          </Button>
        </div>
      );
    }

    if (status === 'success') {
      return (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={onGenerate}
            disabled={isUndoing}
          >
            <Sparkles className="w-3 h-3" />
            Reprompt
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={onPreviewApply}
            disabled={previewBusy || isUndoing}
          >
            {previewBusy ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Preparing…</span>
              </>
            ) : (
              'Preview & Apply'
            )}
          </Button>
          {undoAvailable && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onUndo}
              disabled={isUndoing}
            >
              {isUndoing ? 'Undoing…' : 'Undo'}
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {!canGenerate && (
          <div className="text-[11px] text-neutral-500">
            Code snippet is still loading. You can generate a fix once it
            finishes.
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={onGenerate}
          disabled={!canGenerate || isGeneratingFix}
        >
          <Sparkles className="w-3 h-3" />
          Generate Fix
        </Button>
      </div>
    );
  })();

  const renderPreviewPanel = () => {
    if (!applyState.showPreview) {
      return null;
    }

    if (
      applyState.status === 'preview-loading' ||
      applyState.status === 'applying'
    ) {
      return (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-white px-3 py-3 text-[11px] text-neutral-600 w-full max-w-[420px]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {applyState.status === 'applying'
              ? 'Applying changes…'
              : 'Preparing preview…'}
          </div>
        </div>
      );
    }

    if (applyState.status === 'error') {
      return (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-[11px] text-red-600 w-full max-w-[420px]">
          <div>{applyState.errorMessage || 'Failed to prepare preview.'}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClosePreview}>
              Back
            </Button>
            <Button size="sm" onClick={onPreviewApply}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    const isAppliedState = applyState.status === 'applied';
    const canSubmit = applyState.status === 'preview-ready';

    return (
      <div className="space-y-3 rounded-md border border-neutral-200 bg-white px-3 py-3 text-[11px] text-neutral-700 w-full max-w-[420px]">
        <div className="space-y-1">
          <label className="font-medium text-neutral-600">Commit message</label>
          <input
            value={applyState.commitMessage ?? ''}
            onChange={event => onCommitMessageChange(event.target.value)}
            disabled={!canSubmit}
            className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed"
          />
        </div>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 w-full max-w-full overflow-hidden">
          <div className="border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Diff Preview
          </div>
          <div className="max-h-[320px] overflow-auto">
            <div className="px-3 py-2 space-y-0.5 text-[11px] font-mono leading-5 text-neutral-800">
              {(() => {
                const lines = (applyState.diff || '')
                  .split('\n')
                  .filter(Boolean)
                  .filter(
                    line =>
                      !line.startsWith('Index:') &&
                      !line.startsWith('diff --git') &&
                      !line.startsWith('+++') &&
                      !line.startsWith('---') &&
                      !/^=+$/.test(line.trim())
                  );
                let currentNumber = 0;
                return lines.map((line, index) => {
                  const marker = line.charAt(0);
                  let displayLine = line;
                  let bgClass = '';
                  if (marker === '+') {
                    displayLine = line.slice(1);
                    bgClass = 'bg-green-50';
                    currentNumber += 1;
                  } else if (marker === '-') {
                    displayLine = line.slice(1);
                    bgClass = 'bg-red-50';
                  } else if (marker === '@') {
                    const match = /\+(\d+)/.exec(line);
                    if (match) {
                      currentNumber = parseInt(match[1], 10) - 1;
                    }
                    return (
                      <div
                        key={`${line}-${index}`}
                        className="text-neutral-400 select-none"
                      >
                        {line}
                      </div>
                    );
                  } else {
                    currentNumber += 1;
                  }
                  const lineNumber =
                    marker === '-'
                      ? ''
                      : currentNumber > 0
                        ? currentNumber
                        : '';
                  return (
                    <div
                      key={`${line}-${index}`}
                      className={`flex gap-3 whitespace-pre-wrap break-words ${bgClass}`}
                    >
                      <span className="w-10 text-right text-neutral-400 select-none">
                        {lineNumber}
                      </span>
                      <span className="flex-1 min-w-0 break-words">
                        {displayLine || ' '}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAppliedState ? (
            <Button size="sm" onClick={onClosePreview}>
              Close
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onClosePreview}
                disabled={!canSubmit}
              >
                Back
              </Button>
              <Button size="sm" onClick={onConfirmApply} disabled={!canSubmit}>
                Apply Changes
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (applyState.showPreview) {
    return (
      <div className="mt-3 space-y-2 w-full max-w-[420px]">
        {renderPreviewPanel()}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {status === 'success' && summary && (
        <div className="text-[12px] text-neutral-700 leading-5">{summary}</div>
      )}
      {status === 'success' && warnings && warnings.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] text-yellow-700">
          <div className="font-medium">Warnings</div>
          <ul className="mt-1 list-disc pl-4 space-y-1">
            {warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {status === 'success' && updatedCode && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 w-full max-w-[420px]">
          <div className="border-b border-neutral-200 bg-neutral-100 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Suggested Fix
          </div>
          <div className="max-h-60 overflow-auto">
            <div className="px-3 py-2 space-y-0.5 text-[11px] font-mono leading-5 text-neutral-800">
              {(() => {
                const startLine =
                  request?.startLine ?? snippet?.highlightStart ?? 1;
                const baseLines = updatedCode.split('\n');
                return baseLines.map((line, index) => {
                  const marker = line.charAt(0);
                  const isRemoved = marker === '-';
                  const content =
                    marker === '+' || marker === '-' ? line.slice(1) : line;
                  const lineNumber = startLine + index;
                  const bgClass = isRemoved ? 'bg-red-50' : 'bg-green-50';
                  return (
                    <div
                      key={`${line}-${index}`}
                      className={`flex gap-3 whitespace-pre-wrap break-words ${bgClass}`}
                    >
                      <span className="w-10 text-right text-neutral-400 select-none">
                        {lineNumber}
                      </span>
                      <span className="flex-1 min-w-0 break-words">
                        {content || ' '}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      {showInstructions && (
        <textarea
          className="w-full resize-y rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] leading-5 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
          rows={3}
          placeholder="Add extra guidance for the AI (optional)…"
          value={instructions}
          onChange={event => onInstructionsChange(event.target.value)}
          disabled={isGeneratingFix || previewBusy || isUndoing}
        />
      )}
      {inlineErrorMessage && status !== 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
          {inlineErrorMessage}
        </div>
      )}
      {controls}
      {appliedSuccessfully && (
        <div className="text-[11px] text-green-600">
          Applied in commit {applyState.commitSha?.slice(0, 8) || 'latest'}.
        </div>
      )}
      {isUndoing && (
        <div className="text-[11px] text-neutral-500">Undoing changes…</div>
      )}
    </div>
  );
};
