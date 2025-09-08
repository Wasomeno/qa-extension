import { ParsedSheetRow } from './sheets';
import { GoogleScenarioTemplate } from '../templates/googleScenarioTemplate';

const ACTION_PREFIXES = [
  'klik',
  'pilih',
  'isi',
  'masukkan',
  'masukan',
  'sorting',
  'sortir',
  'filter',
  'cari',
  'navigasi',
  'buka',
  'ketuk',
  'tap',
  'admin klik',
  'admin memilih',
  'admin mengisi',
  'klik button',
  'klik icon',
];

const OUTCOME_PREFIXES = [
  'menampilkan',
  'tampil',
  'diarahkan',
  'berhasil',
  'mengurutkan',
  'message',
  'pesan',
  'error',
  'warning',
  'sukses',
  'gagal',
  'data berhasil',
  'data tidak',
];

const PRECONDITION_HINTS = [
  'login',
  'berada pada',
  'berada di',
  'di halaman',
  'sudah',
  'memiliki',
  'akses',
];

const NEGATIVE_HINTS = [
  'gagal',
  'error',
  'warning',
  'invalid',
  'tidak bisa',
  'tidak dapat',
  'cannot',
  'failed',
];

function normalizeKey(k: string): string {
  return (k || '').toLowerCase().replace(/\s+/g, '').trim();
}

function splitLines(text?: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^[-•]\s*/, ''))
    .map(s => s.replace(/^\d+\.\s*/, ''));
}

function isAction(line: string): boolean {
  const l = line.toLowerCase();
  return ACTION_PREFIXES.some(p => l.startsWith(p));
}

function isOutcome(line: string): boolean {
  const l = line.toLowerCase();
  return OUTCOME_PREFIXES.some(p => l.startsWith(p));
}

function isPrecondition(line: string): boolean {
  const l = line.toLowerCase();
  return PRECONDITION_HINTS.some(p => l.includes(p));
}

function inferTestType(from: string[]): 'Positive' | 'Negative' {
  const l = from.join(' \n ').toLowerCase();
  return NEGATIVE_HINTS.some(p => l.includes(p)) ? 'Negative' : 'Positive';
}

export interface GoogleScenarioRow {
  user_story: string;
  test_id: string;
  test_type: string;
  test_scenario: string;
  pre_condition: string[];
  test_step: string[];
  result: string[];
  status: string;
  additional_note?: string;
}

/**
 * Deterministically map acceptance criteria rows into GoogleScenarioTemplate rows.
 * Groups continuation rows where Kode/Epic are empty under the previous Kode.
 */
export function mapAcceptanceToGoogleScenarios(
  rows: ParsedSheetRow[],
  limit?: number,
  options?: { userStoryKey?: string }
): GoogleScenarioRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Normalize header keys per row
  const keyMap = new Map<string, string>();
  // Guess mapping once from the first row's keys (they already come normalized from parseCsv header)
  const first = rows[0] || {};
  Object.keys(first).forEach(h => keyMap.set(normalizeKey(h), h));
  const kKode = keyMap.get('kode') || keyMap.get('id') || 'Kode';
  const userKeyNorm = normalizeKey(options?.userStoryKey || 'epic');
  const kEpic = keyMap.get(userKeyNorm) || options?.userStoryKey || 'Epic';
  const kInfo =
    keyMap.get('information') || keyMap.get('info') || 'Information';
  const kDetail = keyMap.get('detail') || 'Detail';
  const kNote = keyMap.get('note') || 'Note';

  type Group = {
    kode: string;
    epic: string[];
    info: string[];
    detail: string[];
    note: string[];
  };

  const groups: Group[] = [];
  let current: Group | null = null;

  for (const r of rows) {
    const kode = (r[kKode] || '').trim();
    const epic = (r[kEpic] || '').trim();
    const info = (r[kInfo] || '').trim();
    const detail = (r[kDetail] || '').trim();
    const note = (r[kNote] || '').trim();

    const hasKode = !!kode;
    const hasAnyContent = [epic, info, detail, note].some(v => v);
    if (!hasAnyContent && !hasKode) {
      continue; // skip pure empty row
    }

    if (hasKode || !current) {
      // Start a new group when Kode present, or if no current group yet
      current = {
        kode: hasKode ? kode : current?.kode || '',
        epic: [],
        info: [],
        detail: [],
        note: [],
      };
      groups.push(current);
    }

    if (epic) current.epic.push(epic);
    if (info) current.info.push(info);
    if (detail) current.detail.push(detail);
    if (note) current.note.push(note);
  }

  const out: GoogleScenarioRow[] = [];
  for (const g of groups) {
    if (!g.kode) continue;

    const mergedDetailLines = g.detail.flatMap(d => splitLines(d));
    const preconds = mergedDetailLines.filter(isPrecondition);
    const steps = mergedDetailLines.filter(
      l => isAction(l) && !isPrecondition(l)
    );
    const results = mergedDetailLines.filter(
      l => isOutcome(l) && !isPrecondition(l)
    );

    const testType = inferTestType([g.info.join('\n'), g.detail.join('\n')]);

    const scenario: GoogleScenarioRow = {
      // Single source of truth for user_story: Epic only (no fallbacks)
      user_story: g.epic.join(' '),
      test_id: g.kode,
      test_type: testType,
      test_scenario: g.info[0] || g.epic[0] || 'Skenario uji',
      pre_condition: unique(preconds),
      test_step: unique(steps),
      result: unique(results),
      status: 'NONE',
      additional_note: g.note.join(' \n ') || undefined,
    };
    out.push(scenario);
    if (typeof limit === 'number' && out.length >= limit) break;
  }

  return out;
}

function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.trim();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

// Export template to allow callers to use consistent headers when exporting
export const GoogleTemplate = GoogleScenarioTemplate;
