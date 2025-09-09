import axios from 'axios';
import { logger } from '../utils/logger';
import ExcelJS from 'exceljs';

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

export interface WorkbookReadResult {
  spreadsheetId: string;
  sourceUrl: string;
  sheets: Array<{
    name: string;
    headers: string[];
    rows: ParsedSheetRow[];
    // Google gid is not available when exporting XLSX; keep null for compatibility
    gid: string | null;
  }>;
}

export class GoogleSheetReader {
  /**
   * Accepts a Google Sheet URL and returns CSV-parsed rows.
   * Requires the sheet to be publicly accessible (link viewer) or published.
   */
  public static async readPublicCsv(
    sheetUrl: string
  ): Promise<SheetReadResult> {
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
      logger.logApiCall(
        'google_sheets',
        'GET',
        csvUrl,
        res.status,
        Date.now() - start
      );
      if (res.status === 403 || res.status === 401) {
        throw new Error(
          'Access denied. Make the sheet public or publish to the web.'
        );
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

  public static extractIds(url: string): {
    spreadsheetId: string;
    gid: string | null;
  } {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('docs.google.com'))
        throw new Error('Not a Google Docs domain');
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'd');
      const spreadsheetId = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : '';
      const gid = u.searchParams.get('gid');
      return { spreadsheetId, gid };
    } catch {
      return { spreadsheetId: '', gid: null };
    }
  }

  public static buildCsvExportUrl(
    spreadsheetId: string,
    gid: string | null
  ): string {
    const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    return gid ? `${base}&gid=${gid}` : base;
  }

  public static buildXlsxExportUrl(spreadsheetId: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  }

  /**
   * Minimal CSV parser that handles quoted fields, commas, BOM, and newlines.
   */
  private static parseCsv(csv: string): {
    headers: string[];
    rows: ParsedSheetRow[];
  } {
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

    // Heuristic: choose the first row that looks like a header
    // (at least 2 non-empty cells and within 60% of the max-filled row).
    let maxFilled = 0;
    for (const r of records) {
      const filled = r.reduce((acc, v) => acc + (v && v.trim() ? 1 : 0), 0);
      if (filled > maxFilled) maxFilled = filled;
    }
    const threshold = Math.max(2, Math.floor(maxFilled * 0.6));
    const headerIndex = Math.max(
      0,
      records.findIndex(
        r => r.reduce((acc, v) => acc + (v && v.trim() ? 1 : 0), 0) >= threshold
      )
    );

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

  /**
   * Read the entire workbook (all tabs) as XLSX and parse each sheet into rows.
   * Works with publicly accessible/published sheets. When not available, callers
   * should fall back to readPublicCsv.
   */
  public static async readPublicWorkbook(
    sheetUrl: string
  ): Promise<WorkbookReadResult> {
    const { spreadsheetId } = this.extractIds(sheetUrl);
    if (!spreadsheetId) {
      throw new Error('Invalid Google Sheet URL: missing spreadsheet ID');
    }
    const xlsxUrl = this.buildXlsxExportUrl(spreadsheetId);
    const start = Date.now();
    const res = await axios.get(xlsxUrl, {
      responseType: 'arraybuffer',
      validateStatus: s => s >= 200 && s < 500,
      headers: { 'User-Agent': 'QA-Command-Center/ScenarioReader' },
    });
    if (res.status !== 200) {
      logger.logApiCall(
        'google_sheets',
        'GET',
        xlsxUrl,
        res.status,
        Date.now() - start
      );
      if (res.status === 403 || res.status === 401) {
        throw new Error(
          'Access denied. Make the sheet public or publish to the web.'
        );
      }
      throw new Error(`Failed to fetch workbook XLSX (status ${res.status}).`);
    }
    logger.logApiCall('google_sheets', 'GET', xlsxUrl, 200, Date.now() - start);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.data as ArrayBuffer);

    const parseWorksheet = (
      ws: ExcelJS.Worksheet
    ): { headers: string[]; rows: ParsedSheetRow[] } => {
      // Helper: stringify cell values robustly to avoid "[object Object]"
      const cellToString = (v: ExcelJS.CellValue): string => {
        if (v == null) return '';
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return String(v);
        if (v instanceof Date) return v.toISOString();
        // ExcelJS object-like values
        const anyV = v as any;
        if (anyV && typeof anyV === 'object') {
          // Hyperlink-like { text, hyperlink }
          if (anyV.text != null && typeof anyV.text !== 'object') return String(anyV.text);
          if (anyV.hyperlink != null) return String(anyV.hyperlink);
          // Rich text { richText: [{text: ...}, ...] }
          if (Array.isArray(anyV.richText)) {
            return anyV.richText.map((rt: any) => rt?.text ?? '').join('');
          }
          // Formula { formula, result }
          if (anyV.result != null) {
            const r = anyV.result;
            if (r instanceof Date) return r.toISOString();
            return String(r);
          }
          // Fallback to JSON to avoid [object Object]
          try {
            return JSON.stringify(anyV);
          } catch {
            return String(anyV);
          }
        }
        return String(v);
      };

      // Read all rows into a 2D array of strings
      const records: string[][] = [];
      ws.eachRow({ includeEmpty: true }, row => {
        const values = row.values as any[];
        // values[0] is undefined, ExcelJS is 1-based; normalize and stringify
        const cols: string[] = [];
        for (let i = 1; i < values.length; i++) {
          cols.push(cellToString(values[i]).trim());
        }
        // Skip fully empty rows
        if (cols.some(x => (x || '').trim().length > 0)) records.push(cols);
      });

      if (records.length === 0) return { headers: [], rows: [] };

      // Heuristic: choose the first row that looks like a header
      let maxFilled = 0;
      for (const r of records) {
        const filled = r.reduce((acc, v) => acc + (v && v.trim() ? 1 : 0), 0);
        if (filled > maxFilled) maxFilled = filled;
      }
      const threshold = Math.max(2, Math.floor(maxFilled * 0.6));
      const headerIndex = Math.max(
        0,
        records.findIndex(
          r => r.reduce((acc, v) => acc + (v && v.trim() ? 1 : 0), 0) >= threshold
        )
      );

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
    };

    const sheets = workbook.worksheets.map(ws => {
      const { headers, rows } = parseWorksheet(ws);
      return { name: ws.name || 'Sheet', headers, rows, gid: null };
    });

    return { spreadsheetId, sourceUrl: sheetUrl, sheets };
  }
}
