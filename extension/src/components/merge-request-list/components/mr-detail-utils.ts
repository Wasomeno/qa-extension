import type { MRNote } from '@/types/merge-requests';
import type {
  DiffSnippetLineType,
  DiffSnippetComputed,
} from './mr-detail-types';

export const hasLineValue = (
  value: number | null | undefined
): value is number => typeof value === 'number' && Number.isFinite(value);

export const buildNoteSnippetInput = (
  note: MRNote
): DiffSnippetComputed | null => {
  if (!note.position) {
    return null;
  }

  const { position } = note;

  if (position.position_type && position.position_type !== 'text') {
    return null;
  }

  let lineType: DiffSnippetLineType | null = null;
  let startLine: number | null = null;
  let endLine: number | null = null;

  if (position.line_range) {
    const { line_range } = position;
    const startNew = line_range.start?.new_line;
    const endNew = line_range.end?.new_line;
    if (hasLineValue(startNew) || hasLineValue(endNew)) {
      lineType = 'new';
      startLine = hasLineValue(startNew) ? startNew : (endNew ?? null);
      endLine = hasLineValue(endNew) ? endNew : startLine;
    } else {
      const startOld = line_range.start?.old_line;
      const endOld = line_range.end?.old_line;
      if (hasLineValue(startOld) || hasLineValue(endOld)) {
        lineType = 'old';
        startLine = hasLineValue(startOld) ? startOld : (endOld ?? null);
        endLine = hasLineValue(endOld) ? endOld : startLine;
      }
    }
  }

  if (!lineType) {
    if (hasLineValue(position.new_line)) {
      lineType = 'new';
      startLine = position.new_line;
      endLine = position.new_line;
    } else if (hasLineValue(position.old_line)) {
      lineType = 'old';
      startLine = position.old_line;
      endLine = position.old_line;
    }
  }

  if (!lineType || startLine == null || endLine == null) {
    return null;
  }

  const normalizedStart = Math.min(startLine, endLine);
  const normalizedEnd = Math.max(startLine, endLine);

  const filePath =
    lineType === 'new'
      ? (position.new_path ?? position.old_path ?? null)
      : (position.old_path ?? position.new_path ?? null);

  const refCandidateOrder =
    lineType === 'new'
      ? [position.head_sha, position.base_sha, position.start_sha]
      : [position.base_sha, position.start_sha, position.head_sha];

  const ref =
    refCandidateOrder.find(
      candidate => typeof candidate === 'string' && candidate.length > 0
    ) ?? null;

  if (!filePath || !ref) {
    return null;
  }

  return {
    lineType,
    request: {
      filePath,
      ref,
      startLine: normalizedStart,
      endLine: normalizedEnd,
      contextBefore: 15,
      contextAfter: 5,
    },
  };
};

export const formatRangeLabel = (
  start?: number,
  end?: number
): string | null => {
  if (!start || !end) {
    return null;
  }
  if (start === end) {
    return `L${start}`;
  }
  return `L${start}-${end}`;
};
