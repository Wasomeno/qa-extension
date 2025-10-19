import React, { useMemo } from 'react';
import {
  useQuery,
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  GitBranch,
  User,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import apiService from '@/services/api';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { Badge } from '@/src/components/ui/ui/badge';
import type {
  MergeRequestSummary,
  MRNote,
  MRNoteSnippet,
  MRNoteFixPreview,
  MRNoteFixApplyResult,
} from '@/types/merge-requests';
import { buildNoteSnippetInput } from './mr-detail-utils';
import { DiffNoteSnippetPreview } from './DiffNoteSnippetPreview';
import { DiffNoteFixActions } from './DiffNoteFixActions';
import type {
  DiffSnippetState,
  DiffNoteFixUIState,
  DiffNoteApplyState,
} from './mr-detail-types';

interface MRDetailProps {
  mr: MergeRequestSummary;
  portalContainer?: Element | null;
  onGenerateFix?: (note: MRNote) => void;
}

export const MRDetail: React.FC<MRDetailProps> = ({
  mr,
  onGenerateFix,
  portalContainer: _portalContainer,
}) => {
  void _portalContainer;
  // Fetch full MR details
  const { data: mrDetail, isLoading: mrLoading } = useQuery({
    queryKey: ['merge-request', mr.project_id, mr.iid],
    queryFn: async () => {
      const res = await apiService.getMergeRequest(mr.project_id, mr.iid);
      return res.success ? res.data : null;
    },
    staleTime: 60_000,
  });

  // Fetch MR notes/comments
  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['merge-request-notes', mr.project_id, mr.iid],
    queryFn: async () => {
      const res = await apiService.getMergeRequestNotes(mr.project_id, mr.iid);
      return res.success && res.data?.items ? res.data.items : [];
    },
    staleTime: 60_000,
  });

  const diffNoteEntries = useMemo(
    () =>
      (notes || [])
        .filter(note => note.type === 'DiffNote')
        .map(note => ({
          note,
          computed: buildNoteSnippetInput(note),
        })),
    [notes]
  );

  const snippetQueries = useQueries({
    queries: diffNoteEntries.map(({ note, computed }) => ({
      queryKey: [
        'merge-request-note-snippet',
        mr.project_id,
        mr.iid,
        note.id,
        computed?.request.filePath ?? 'unknown',
        computed?.request.ref ?? 'unknown',
        computed?.request.startLine ?? 0,
        computed?.request.endLine ?? 0,
      ],
      queryFn: async () => {
        if (!computed) {
          return null;
        }
        const res = await apiService.getMergeRequestNoteSnippet(
          mr.project_id,
          mr.iid,
          computed.request
        );
        if (!res.success || !res.data?.snippet) {
          throw new Error(res.error || 'Failed to fetch snippet');
        }
        return res.data.snippet;
      },
      enabled: Boolean(computed),
      staleTime: 60_000,
      retry: false,
    })),
  }) as UseQueryResult<MRNoteSnippet | null>[];

  const diffNoteSnippetMap = useMemo(() => {
    const map = new Map<number, DiffSnippetState>();
    diffNoteEntries.forEach(({ note, computed }, index) => {
      const query = snippetQueries[index];
      map.set(note.id, {
        snippet: (query?.data as MRNoteSnippet | null) ?? null,
        isLoading: Boolean(query?.isLoading || query?.isFetching),
        isError: Boolean(query?.isError),
        error: query?.error,
        request: computed?.request,
        lineType: computed?.lineType ?? 'unknown',
      });
    });
    return map;
  }, [diffNoteEntries, snippetQueries]);

  const [fixStates, setFixStates] = React.useState<
    Record<number, DiffNoteFixUIState>
  >({});
  const [fixInstructions, setFixInstructions] = React.useState<
    Record<number, string>
  >({});
  const [applyStates, setApplyStates] = React.useState<
    Record<number, DiffNoteApplyState>
  >({});
  const queryClient = useQueryClient();

  const updateApplyState = React.useCallback(
    (
      noteId: number,
      updater: (current: DiffNoteApplyState) => DiffNoteApplyState
    ) => {
      setApplyStates(prev => {
        const current = prev[noteId] ?? {
          status: 'idle',
          showPreview: false,
          previewSnippet: null,
        };
        const next = updater(current);
        return {
          ...prev,
          [noteId]: next,
        };
      });
    },
    []
  );

  const handleGenerateFixForNote = React.useCallback(
    async (note: MRNote) => {
      const snippetState = diffNoteSnippetMap.get(note.id);
      if (
        !snippetState ||
        snippetState.isLoading ||
        snippetState.isError ||
        !snippetState.snippet ||
        !snippetState.request
      ) {
        const message = snippetState?.isError
          ? snippetState.error instanceof Error
            ? snippetState.error.message
            : 'Failed to load code snippet'
          : 'Code snippet not ready yet. Please try again once it loads.';
        setFixStates(prev => ({
          ...prev,
          [note.id]: {
            status: 'error',
            errorMessage: message,
          },
        }));
        return;
      }

      setApplyStates(prev => {
        const { [note.id]: _unused, ...rest } = prev;
        return rest;
      });

      setFixStates(prev => ({
        ...prev,
        [note.id]: { status: 'loading' },
      }));

      try {
        const { request } = snippetState;
        const instructions = fixInstructions[note.id] ?? '';
        const trimmedInstructions = instructions.trim();
        const payload = {
          filePath: request.filePath,
          ref: request.ref,
          startLine: request.startLine,
          endLine: request.endLine,
          comment: note.body || '',
          contextBefore: request.contextBefore,
          contextAfter: request.contextAfter,
          additionalInstructions: trimmedInstructions || undefined,
        };

        const res = await apiService.generateMergeRequestNoteFix(
          mr.project_id,
          mr.iid,
          payload
        );

        if (!res.success || !res.data?.fix) {
          throw new Error(res.error || res.message || 'Failed to generate fix');
        }

        const { fix } = res.data;

        setFixStates(prev => ({
          ...prev,
          [note.id]: {
            status: 'success',
            summary: fix.summary,
            updatedCode: fix.updatedCode,
            warnings: fix.warnings,
          },
        }));

        if (onGenerateFix) {
          onGenerateFix(note);
        }
      } catch (error: any) {
        setFixStates(prev => ({
          ...prev,
          [note.id]: {
            status: 'error',
            errorMessage: error?.message || 'Failed to generate fix',
          },
        }));
      }
    },
    [diffNoteSnippetMap, fixInstructions, mr.project_id, mr.iid, onGenerateFix]
  );

  const handlePreviewApply = React.useCallback(
    async (note: MRNote) => {
      const snippetState = diffNoteSnippetMap.get(note.id);
      const fixState = fixStates[note.id];
      if (
        !snippetState?.snippet ||
        !snippetState.request ||
        !fixState ||
        fixState.status !== 'success' ||
        !fixState.updatedCode
      ) {
        updateApplyState(note.id, current => ({
          ...current,
          status: 'error',
          showPreview: true,
          errorMessage:
            'Code snippet or AI suggestion is unavailable. Regenerate the fix and try again.',
        }));
        return;
      }

      const highlightLines = snippetState.snippet.lines.filter(
        line => line.highlight
      );
      const originalCode = highlightLines.map(line => line.content).join('\n');

      updateApplyState(note.id, current => ({
        ...current,
        status: 'preview-loading',
        showPreview: true,
        errorMessage: undefined,
        previewSnippet: null,
      }));

      try {
        const response = await apiService.applyMergeRequestNoteFix(
          mr.project_id,
          mr.iid,
          {
            filePath: snippetState.request.filePath,
            ref: snippetState.request.ref,
            startLine: snippetState.request.startLine,
            endLine: snippetState.request.endLine,
            originalCode,
            updatedCode: fixState.updatedCode,
            commitMessage:
              (applyStates[note.id]?.commitMessage || '').trim() || undefined,
            dryRun: true,
          }
        );

        if (!response.success || !response.data) {
          throw new Error(
            response.error || response.message || 'Preview failed'
          );
        }

        const preview = response.data as MRNoteFixPreview;

        updateApplyState(note.id, current => ({
          ...current,
          status: 'preview-ready',
          showPreview: true,
          diff: preview.diff,
          commitMessage: preview.commitMessage,
          previewSnippet: preview.snippet ?? null,
          errorMessage: undefined,
        }));
      } catch (error: any) {
        updateApplyState(note.id, current => ({
          ...current,
          status: 'error',
          showPreview: true,
          previewSnippet: null,
          errorMessage:
            error?.message || 'Failed to prepare preview. Try again.',
        }));
      }
    },
    [
      diffNoteSnippetMap,
      fixStates,
      mr.project_id,
      mr.iid,
      updateApplyState,
      applyStates,
    ]
  );

  const handleConfirmApply = React.useCallback(
    async (note: MRNote) => {
      const snippetState = diffNoteSnippetMap.get(note.id);
      const fixState = fixStates[note.id];
      const applyState = applyStates[note.id];
      if (
        !snippetState?.snippet ||
        !snippetState.request ||
        !fixState ||
        fixState.status !== 'success' ||
        !fixState.updatedCode ||
        !applyState ||
        (applyState.status !== 'preview-ready' &&
          applyState.status !== 'error' &&
          applyState.status !== 'applied')
      ) {
        return;
      }

      const highlightLines = snippetState.snippet.lines.filter(
        line => line.highlight
      );
      const originalCode = highlightLines.map(line => line.content).join('\n');

      updateApplyState(note.id, current => ({
        ...current,
        status: 'applying',
        showPreview: true,
        errorMessage: undefined,
      }));

      try {
        const response = await apiService.applyMergeRequestNoteFix(
          mr.project_id,
          mr.iid,
          {
            filePath: snippetState.request.filePath,
            ref: snippetState.request.ref,
            startLine: snippetState.request.startLine,
            endLine: snippetState.request.endLine,
            originalCode,
            updatedCode: fixState.updatedCode,
            commitMessage: applyState.commitMessage,
            dryRun: false,
          }
        );

        if (!response.success || !response.data) {
          throw new Error(response.error || response.message || 'Apply failed');
        }

        const result = response.data as MRNoteFixApplyResult & {
          undoToken?: string | null;
        };

        updateApplyState(note.id, current => ({
          ...current,
          status: 'applied',
          showPreview: true,
          diff: result.diff,
          commitMessage: result.commitMessage,
          undoToken: result.undoToken ?? null,
          commitSha: result.commitSha,
          previewSnippet: result.snippet ?? current.previewSnippet ?? null,
          errorMessage: undefined,
        }));

        await queryClient.invalidateQueries({
          queryKey: ['merge-request-notes', mr.project_id, mr.iid],
        });
        await queryClient.invalidateQueries({
          queryKey: [
            'merge-request-note-snippet',
            mr.project_id,
            mr.iid,
            note.id,
          ],
          exact: false,
        });
      } catch (error: any) {
        updateApplyState(note.id, current => ({
          ...current,
          status: 'error',
          showPreview: true,
          previewSnippet: current.previewSnippet ?? null,
          errorMessage: error?.message || 'Failed to apply changes. Try again.',
        }));
      }
    },
    [
      diffNoteSnippetMap,
      fixStates,
      applyStates,
      mr.project_id,
      mr.iid,
      queryClient,
      updateApplyState,
    ]
  );

  const handleCloseApplyPreview = React.useCallback(
    (noteId: number) => {
      updateApplyState(noteId, current => ({
        ...current,
        showPreview: false,
        previewSnippet: undefined,
      }));
    },
    [updateApplyState]
  );

  const handleApplyCommitMessageChange = React.useCallback(
    (noteId: number, value: string) => {
      updateApplyState(noteId, current => ({
        ...current,
        commitMessage: value,
      }));
    },
    [updateApplyState]
  );

  const handleUndoApply = React.useCallback(
    async (note: MRNote) => {
      const applyState = applyStates[note.id];
      if (!applyState?.undoToken) {
        return;
      }

      updateApplyState(note.id, current => ({
        ...current,
        status: 'undoing',
      }));

      try {
        const response = await apiService.undoMergeRequestNoteFix(
          mr.project_id,
          mr.iid,
          applyState.undoToken
        );

        if (!response.success || !response.data) {
          throw new Error(response.error || response.message || 'Undo failed');
        }

        updateApplyState(note.id, () => ({
          status: 'idle',
          showPreview: false,
        }));

        await queryClient.invalidateQueries({
          queryKey: ['merge-request-notes', mr.project_id, mr.iid],
        });
        await queryClient.invalidateQueries({
          queryKey: [
            'merge-request-note-snippet',
            mr.project_id,
            mr.iid,
            note.id,
          ],
          exact: false,
        });
      } catch (error: any) {
        updateApplyState(note.id, current => ({
          ...current,
          status: 'error',
          showPreview: true,
          errorMessage: error?.message || 'Failed to undo changes. Try again.',
        }));
      }
    },
    [applyStates, mr.project_id, mr.iid, queryClient, updateApplyState]
  );

  // Markdown renderer with custom styling (matching IssueDetail)
  const md = useMemo(() => {
    const inst = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
    });
    try {
      (inst as any).use(taskLists as any, {
        label: true,
        labelAfter: true,
        enabled: true,
      });
    } catch {}

    // Custom renderer rules for better styling
    inst.renderer.rules.hr = () =>
      '<hr class="border-neutral-200 opacity-60 rounded-full" />';
    inst.renderer.rules.table_open = () =>
      '<div class="rounded-md border border-neutral-200 overflow-hidden"><table class="w-full rounded-md text-xs border-collapse">';
    inst.renderer.rules.table_close = () => '</table></div>';
    inst.renderer.rules.thead_open = () =>
      '<thead class="bg-neutral-50 text-neutral-600 font-medium">';
    inst.renderer.rules.tbody_open = () =>
      '<tbody class="divide-y divide-neutral-200">';
    inst.renderer.rules.tr_open = () =>
      '<tr class="hover:bg-neutral-50 transition-colors">';
    inst.renderer.rules.th_open = () =>
      '<th class="px-3 py-2 text-left font-medium border border-neutral-200 bg-neutral-100">';
    inst.renderer.rules.td_open = () =>
      '<td class="px-3 py-2 align-top border border-neutral-200">';
    inst.renderer.rules.bullet_list_open = (
      tokens,
      idx,
      options,
      env,
      self
    ) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const classes = existing.split(/\s+/).filter(Boolean);
      const isTaskList =
        classes.includes('task-list') || classes.includes('contains-task-list');
      const base = classes.join(' ');
      const className = [
        base,
        isTaskList
          ? 'list-none pl-0 space-y-1 text-[12px] text-neutral-700'
          : 'list-disc pl-5 space-y-1 text-[12px] text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };
    inst.renderer.rules.ordered_list_open = (
      tokens,
      idx,
      options,
      env,
      self
    ) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const base = existing.split(/\s+/).filter(Boolean).join(' ');
      const className = [
        base,
        'list-decimal pl-5 space-y-1 text-[12px] text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };
    inst.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const existing = token.attrGet('class') || '';
      const classes = existing.split(/\s+/).filter(Boolean);
      const base = classes.join(' ');
      const isTaskItem = classes.includes('task-list-item');
      const className = [
        base,
        isTaskItem
          ? 'flex items-center gap-2 text-neutral-700'
          : 'text-neutral-700',
      ]
        .filter(Boolean)
        .join(' ');
      token.attrSet('class', className);
      return self.renderToken(tokens, idx, options);
    };

    return inst;
  }, []);

  const renderedDescription = useMemo(() => {
    if (!mrDetail?.description) return '';
    try {
      return md.render(mrDetail.description);
    } catch {
      return mrDetail.description;
    }
  }, [mrDetail?.description, md]);

  const getPipelineStatus = () => {
    if (!mr.pipeline) return null;

    const statusConfig = {
      success: { icon: CheckCircle2, color: 'text-green-600', label: 'Passed' },
      failed: { icon: XCircle, color: 'text-red-600', label: 'Failed' },
      pending: { icon: Clock, color: 'text-blue-600', label: 'Pending' },
      running: { icon: Clock, color: 'text-blue-600', label: 'Running' },
    };

    const config =
      statusConfig[mr.pipeline.status as keyof typeof statusConfig];
    if (!config) return null;

    const Icon = config.icon;
    return (
      <div className={`flex items-center gap-1.5 text-xs ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
        <span>{config.label}</span>
      </div>
    );
  };

  if (mrLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!mrDetail) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
          <p className="text-sm text-gray-900">Failed to load merge request</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="py-4 px-6 space-y-4">
        {/* Meta Section - Branches, Pipeline, State */}
        <div className="space-y-3">
          {/* Branches */}
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <GitBranch className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-mono">{mr.source_branch}</span>
            <span className="text-neutral-400">→</span>
            <span className="font-mono">{mr.target_branch}</span>
          </div>

          {/* Pipeline Status */}
          {getPipelineStatus()}

          {/* State badges */}
          <div className="flex items-center gap-2">
            <Badge variant={mr.state === 'opened' ? 'default' : 'secondary'}>
              {mr.state}
            </Badge>
            {mr.draft && <Badge variant="outline">Draft</Badge>}
            {mr.has_conflicts && (
              <Badge variant="destructive">Has conflicts</Badge>
            )}
          </div>

          {/* Assignees & Reviewers inline */}
          {(mr.assignees.length > 0 || mr.reviewers.length > 0) && (
            <div className="flex flex-col gap-2 text-xs">
              {mr.assignees.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 min-w-[70px]">
                    Assignees:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {mr.assignees.map(assignee => (
                      <div
                        key={assignee.id}
                        className="flex items-center gap-1.5"
                      >
                        {assignee.avatar_url ? (
                          <img
                            src={assignee.avatar_url}
                            alt={assignee.name}
                            className="w-4 h-4 rounded-full"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center">
                            <User className="w-2.5 h-2.5 text-neutral-500" />
                          </div>
                        )}
                        <span className="text-neutral-700">
                          {assignee.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mr.reviewers.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 min-w-[70px]">
                    Reviewers:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {mr.reviewers.map(reviewer => (
                      <div
                        key={reviewer.id}
                        className="flex items-center gap-1.5"
                      >
                        {reviewer.avatar_url ? (
                          <img
                            src={reviewer.avatar_url}
                            alt={reviewer.name}
                            className="w-4 h-4 rounded-full"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center">
                            <User className="w-2.5 h-2.5 text-neutral-500" />
                          </div>
                        )}
                        <span className="text-neutral-700">
                          {reviewer.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        {mrDetail.description && (
          <>
            <hr className="border-neutral-100" />
            <div
              className="tiptap leading-5 space-y-4 text-[12px] focus:outline-none"
              dangerouslySetInnerHTML={{ __html: renderedDescription }}
            />
          </>
        )}

        {/* Comments/Notes */}
        <div className="space-y-3 mt-4">
          <div className="text-xs font-medium text-gray-700">Comments</div>
          {notesLoading ? (
            <div className="text-xs text-neutral-500">Loading comments…</div>
          ) : notes && notes.length > 0 ? (
            <div className="space-y-3">
              {notes
                .filter(note => !note.system)
                .map(note => {
                  const isDiffNote = note.type === 'DiffNote';
                  const snippetState = diffNoteSnippetMap.get(note.id);
                  const fixState: DiffNoteFixUIState = fixStates[note.id] ?? {
                    status: 'idle',
                  };
                  const applyState: DiffNoteApplyState = applyStates[
                    note.id
                  ] ?? {
                    status: 'idle',
                    showPreview: false,
                  };
                  const canGenerateFix = Boolean(
                    snippetState &&
                      !snippetState.isLoading &&
                      !snippetState.isError &&
                      snippetState.snippet &&
                      snippetState.request
                  );
                  return (
                    <div
                      key={note.id}
                      className="rounded-lg border border-neutral-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-medium text-gray-700">
                            {note.author?.name ||
                              note.author?.username ||
                              'Unknown user'}
                          </div>
                          {isDiffNote && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Code Review
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {new Date(note.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div
                        className="tiptap mt-2 leading-5 space-y-2 text-[12px]"
                        dangerouslySetInnerHTML={{
                          __html: md.render(note.body || ''),
                        }}
                      />
                      {isDiffNote && (
                        <>
                          <DiffNoteSnippetPreview state={snippetState} />
                          <DiffNoteFixActions
                            state={fixState}
                            canGenerate={canGenerateFix}
                            instructions={fixInstructions[note.id] ?? ''}
                            onInstructionsChange={value =>
                              setFixInstructions(prev => {
                                if (!value.trim()) {
                                  const { [note.id]: _, ...rest } = prev;
                                  return rest;
                                }
                                return {
                                  ...prev,
                                  [note.id]: value,
                                };
                              })
                            }
                            onGenerate={() => handleGenerateFixForNote(note)}
                            applyState={applyState}
                            snippet={snippetState?.snippet ?? null}
                            request={snippetState?.request}
                            onPreviewApply={() => handlePreviewApply(note)}
                            onCommitMessageChange={value =>
                              handleApplyCommitMessageChange(note.id, value)
                            }
                            onConfirmApply={() => handleConfirmApply(note)}
                            onClosePreview={() =>
                              handleCloseApplyPreview(note.id)
                            }
                            onUndo={() => handleUndoApply(note)}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-xs text-neutral-500">
              No comments on this merge request yet.
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};
