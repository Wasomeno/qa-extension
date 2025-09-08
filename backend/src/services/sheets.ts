import axios from 'axios';
import { logger } from '../utils/logger';

export interface ParsedSheetRow {
  [key: string]: string;
}

export interface SheetReadResult {
  headers: string[];
  rows: ParsedSheetRow[];
  spreadsheetId: string;
  gid: string | null;
  sourceUrl: string;
}

export class GoogleSheetReader {
  /**
   * Accepts a Google Sheet URL and returns CSV-parsed rows.
   * Requires the sheet to be publicly accessible (link viewer) or published.
   */
  public static async readPublicCsv(sheetUrl: string): Promise<SheetReadResult> {
    const { spreadsheetId, gid } = this.extractIds(sheetUrl);
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL: missing spreadsheet ID');
    }
    const csvUrl = this.buildCsvExportUrl(spreadsheetId, gid);

    const start = Date.now();
    const res = await axios.get(csvUrl, {
      responseType: 'text',
      validateStatus: s => s >= 200 && s < 500,
      headers: { 'User-Agent': 'QA-Command-Center/ScenarioReader' },
    });

    if (res.status !== 200) {
      logger.logApiCall('google_sheets', 'GET', csvUrl, res.status, Date.now() - start);
      if (res.status === 403 || res.status === 401) {
        throw new Error('Access denied. Make the sheet public or publish to the web.');
      }
      throw new Error(`Failed to fetch sheet CSV (status ${res.status}).`);
    }

    const text = res.data as string;
    const parsed = this.parseCsv(text);
    logger.logApiCall('google_sheets', 'GET', csvUrl, 200, Date.now() - start);

    return {
      headers: parsed.headers,
      rows: parsed.rows,
      spreadsheetId,
      gid,
      sourceUrl: sheetUrl,
    };
  }

  public static extractIds(url: string): { spreadsheetId: string; gid: string | null } {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('docs.google.com')) throw new Error('Not a Google Docs domain');
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'd');
      const spreadsheetId = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : '';
      const gid = u.searchParams.get('gid');
      return { spreadsheetId, gid };
    } catch {
      return { spreadsheetId: '', gid: null };
    }
  }

  public static buildCsvExportUrl(spreadsheetId: string, gid: string | null): string {
    const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    return gid ? `${base}&gid=${gid}` : base;
  }

  /**
   * Minimal CSV parser that handles quoted fields, commas, BOM, and newlines.
   */
  private static parseCsv(csv: string): { headers: string[]; rows: ParsedSheetRow[] } {
    // Remove BOM
    if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const records: string[][] = [];

    let current: string[] = [];
    let field = '';
    let inQuotes = false;

    const pushField = () => {
      current.push(field);
      field = '';
    };
    const pushRecord = () => {
      records.push(current);
      current = [];
    };

    const text = lines.join('\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          pushField();
        } else if (c === '\n') {
          pushField();
          pushRecord();
        } else {
          field += c;
        }
      }
    }
    // flush last field/record
    pushField();
    if (current.length) pushRecord();

    if (records.length === 0) return { headers: [], rows: [] };

    // Heuristic: pick the row with the most non-empty cells as the header row.
    // This helps skip preamble lines above the real table (common in exported Sheets).
    let headerIndex = 0;
    let maxFilled = -1;
    for (let i = 0; i < records.length; i++) {
      const filled = records[i].reduce((acc, v) => acc + (v && v.trim() ? 1 : 0), 0);
      if (filled > maxFilled) {
        maxFilled = filled;
        headerIndex = i;
      }
    }

    const headers = (records[headerIndex] || []).map(h => h.trim());

    const rows: ParsedSheetRow[] = records
      .slice(headerIndex + 1)
      .filter(r => r.some(v => (v || '').trim().length > 0))
      .map(r => {
        const obj: ParsedSheetRow = {};
        headers.forEach((h, idx) => {
          obj[h || `col_${idx + 1}`] = (r[idx] || '').trim();
        });
        return obj;
      });
    return { headers, rows };
  }
}
