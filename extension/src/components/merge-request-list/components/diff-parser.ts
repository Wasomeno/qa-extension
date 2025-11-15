/**
 * Parse GitLab diff and extract line change information
 */

export interface DiffLineInfo {
  lineNumber: number;
  type: 'addition' | 'deletion' | 'context';
}

export interface ParsedFileDiff {
  filePath: string;
  lines: Map<number, DiffLineInfo>; // Map of new_line_number -> line info
}

/**
 * Parse a GitLab unified diff string and extract line information
 */
export function parseDiff(diff: string, filePath: string): ParsedFileDiff {
  const lines = new Map<number, DiffLineInfo>();
  const diffLines = diff.split('\n');

  let currentNewLineNumber = 0;

  for (const line of diffLines) {
    // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLineNumber = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Skip non-diff lines (headers, etc)
    if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith(' ')) {
      continue;
    }

    if (line.startsWith('+')) {
      // Addition
      lines.set(currentNewLineNumber, {
        lineNumber: currentNewLineNumber,
        type: 'addition',
      });
      currentNewLineNumber++;
    } else if (line.startsWith('-')) {
      // Deletion (no new line number)
      // We don't track these in the new file view
      continue;
    } else if (line.startsWith(' ')) {
      // Context line
      lines.set(currentNewLineNumber, {
        lineNumber: currentNewLineNumber,
        type: 'context',
      });
      currentNewLineNumber++;
    }
  }

  return {
    filePath,
    lines,
  };
}

/**
 * Parse all file diffs from GitLab MR changes response
 */
export function parseAllDiffs(changes: any): Map<string, ParsedFileDiff> {
  const result = new Map<string, ParsedFileDiff>();

  if (!changes || !Array.isArray(changes)) {
    return result;
  }

  for (const change of changes) {
    const filePath = change.new_path || change.old_path;
    if (!filePath || !change.diff) {
      continue;
    }

    const parsed = parseDiff(change.diff, filePath);
    result.set(filePath, parsed);
  }

  return result;
}
