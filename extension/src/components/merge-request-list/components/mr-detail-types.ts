import type { MRNoteSnippet } from '@/types/merge-requests';

export type DiffSnippetLineType = 'new' | 'old' | 'unknown';

export interface DiffSnippetRequestParams {
  filePath: string;
  ref: string;
  startLine: number;
  endLine: number;
  contextBefore: number;
  contextAfter: number;
}

export interface DiffSnippetComputed {
  request: DiffSnippetRequestParams;
  lineType: Exclude<DiffSnippetLineType, 'unknown'>;
}

export interface DiffSnippetState {
  snippet: MRNoteSnippet | null;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  request?: DiffSnippetRequestParams;
  lineType: DiffSnippetLineType;
  diffLineTypes?: Map<
    number,
    { lineNumber: number; type: 'addition' | 'deletion' | 'context' }
  >;
}

export interface DiffNoteFixUIState {
  status: 'idle' | 'loading' | 'success' | 'error';
  summary?: string;
  updatedCode?: string;
  warnings?: string[];
  errorMessage?: string;
}

export interface DiffNoteApplyState {
  status:
    | 'idle'
    | 'preview-loading'
    | 'preview-ready'
    | 'applying'
    | 'applied'
    | 'error'
    | 'undoing';
  showPreview: boolean;
  diff?: string;
  commitMessage?: string;
  errorMessage?: string;
  undoToken?: string | null;
  commitSha?: string;
  previewSnippet?: MRNoteSnippet | null;
}
