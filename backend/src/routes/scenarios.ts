import { Router, Request, Response } from 'express';
import { GoogleSheetReader } from '../services/sheets';
import { ScenarioGeneratorService } from '../services/scenarioGenerator';
import { XlsxExporter } from '../services/exporter';
import {
  DefaultScenarioTemplate,
  ScenarioTemplate,
} from '../templates/defaultScenarioTemplate';
// Google template and mapper removed; using default template + LLM only.
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export const scenariosRouter = Router();

const buildErrorPayload = (e: any, req: Request) => {
  const url =
    req.method === 'GET'
      ? String(req.query.url || '')
      : String((req.body || {}).url || '');
  const ids = url
    ? GoogleSheetReader.extractIds(url)
    : { spreadsheetId: '', gid: null };
  const openaiEnabled = EnvConfig.isServiceAvailable('openai');
  const details: any = {
    sheet: { spreadsheetId: ids.spreadsheetId, gid: ids.gid },
    openaiEnabled,
  };
  // Axios/HTTP style error shape
  if (e?.response) {
    details.http = {
      status: e.response.status,
      data: e.response.data,
      headers: e.response.headers,
    };
  }
  // OpenAI SDK error shape (APIError)
  if (typeof e?.status === 'number' && e?.error) {
    details.openai = {
      status: e.status,
      type: e.error?.type,
      code: e.error?.code,
      message: e.error?.message,
      param: e.error?.param,
    };
  }
  // Custom details attached upstream
  if (e?.details) details.details = e.details;
  if (e?.code) details.code = e.code;
  return {
    success: false,
    error: e?.message || 'Operation failed',
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : { details, stack: e?.stack }),
  };
};

// workbook-raw endpoint removed

// Preview: reads sheet, generates small sample
scenariosRouter.get('/preview', async (req: Request, res: Response) => {
  try {
    const url = String(req.query.url || '');
    if (!url)
      return res.status(400).json({ success: false, error: 'Missing url' });
    const ids = GoogleSheetReader.extractIds(url);
    // If a specific gid is provided, read only that tab as CSV (faster)
    // Otherwise, attempt to read entire workbook (all tabs) via XLSX export.
    let acceptanceRows: any[] = [];
    let sheetMeta: any = {};
    let workbook: {
      sheets: Array<{ name: string; rows: any[] }>;
      spreadsheetId: string;
    } | null = null;
    if (ids.gid) {
      const read = await GoogleSheetReader.readPublicCsv(url);
      acceptanceRows = read.rows;
      sheetMeta = { id: read.spreadsheetId, gid: read.gid };
    } else {
      // Combine all tabs
      const wb = await GoogleSheetReader.readPublicWorkbook(url);
      workbook = { sheets: wb.sheets, spreadsheetId: wb.spreadsheetId };
      console.log(
        'WORKBOOK SHEETS',
        wb.sheets.map(sheet => sheet.rows.map(row => row.Detail))
      );
      acceptanceRows = wb.sheets.flatMap(s => s.rows);
      sheetMeta = {
        id: wb.spreadsheetId,
        gid: null,
        tabs: wb.sheets.map(s => ({ name: s.name, rows: s.rows.length })),
      };
    }
    const generator = new ScenarioGeneratorService();
    const max = Math.min(
      50,
      Math.max(1, Number(req.query.limit || req.query.maxScenarios || 10))
    );
    const template = DefaultScenarioTemplate;
    let scenarios: any[] = [];
    let meta: any = {};
    // LLM path. For multi-tab inputs, run per-tab to return separate lists
    if (
      workbook &&
      Array.isArray(workbook.sheets) &&
      workbook.sheets.length > 0
    ) {
      const tabs = workbook.sheets;
      // Do not divide limit across tabs; allow multiple scenarios per tab
      const perTabLimit = Math.max(
        1,
        Number(req.query.limit || req.query.maxScenarios || 10)
      );
      const perTab: Array<{ name: string; scenarios: any[] }> = [];
      for (const s of tabs) {
        const r = await generator.generate({
          acceptanceRows: s.rows,
          template,
          options: { maxScenarios: perTabLimit },
        });
        let scen = Array.isArray(r.scenarios) ? r.scenarios : [];
        scen = scen.map(row => ensureNonEmptyByTemplate(row, template));
        perTab.push({ name: s.name, scenarios: scen });
      }
      meta = {
        usedRows: acceptanceRows.length,
        requested: acceptanceRows.length,
        template: template.name,
        method: 'llm_per_tab',
        tabs: perTab.map(t => ({ name: t.name, count: t.scenarios.length })),
      };
      return res.json({
        success: true,
        data: {
          sheets: perTab, // per-tab scenarios as requested
          meta: { ...meta, sheet: sheetMeta },
        },
      });
    } else {
      const result = await generator.generate({
        acceptanceRows,
        template,
        options: { maxScenarios: max },
      });

      meta = { ...result.meta, method: 'llm' };
      const singleSheet = [
        {
          name: 'Sheet',
          scenarios: (Array.isArray(result.scenarios)
            ? result.scenarios
            : []
          ).map(r => ensureNonEmptyByTemplate(r, template)),
        },
      ];
      return res.json({
        success: true,
        data: {
          sheets: singleSheet,
          meta: { ...meta, sheet: sheetMeta },
        },
      });
    }
    // Unreachable with the early returns above
  } catch (e: any) {
    logger.logError('Scenario preview failed', e);
    return res.status(400).json(buildErrorPayload(e, req));
  }
});

// Export XLSX (Default Scenario format)
scenariosRouter.post('/export', async (req: Request, res: Response) => {
  try {
    const { scenarios, sheets, title } = req.body || {};
    const hasMulti = Array.isArray(sheets) && sheets.length > 0;
    if (!hasMulti && !Array.isArray(scenarios)) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing scenarios array' });
    }
    // Use only the default template
    const tpl = DefaultScenarioTemplate;

    let buf: Buffer;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    let filename = `test_scenarios_${timestamp}.xlsx`;
    if (hasMulti) {
      const normalizedSheets = (
        sheets as Array<{ name?: string; scenarios: any[]; title?: string }>
      ).map(s => {
        const name = s.name || 'Test Scenarios';
        const rows = (s.scenarios || [])
          .map((r: any) => normalizeByTemplate(r, tpl))
          .map((r: any) => ensureNonEmptyByTemplate(r, tpl));
        return {
          name,
          rows,
          title: typeof s.title === 'string' ? s.title : undefined,
        };
      });
      buf = await XlsxExporter.toXlsxMultiSheetBuffer(normalizedSheets, tpl);
    } else {
      // Normalize rows to match chosen template shape
      const rows = scenarios
        .map((s: any) => normalizeByTemplate(s, tpl))
        .map((r: any) => ensureNonEmptyByTemplate(r, tpl));
      buf = await XlsxExporter.toXlsxBuffer(rows, tpl, {
        sheetName: 'Test Scenarios',
        title: typeof title === 'string' ? title : undefined,
      });
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (e: any) {
    logger.logError('Scenario export failed', e);
    return res.status(400).json(buildErrorPayload(e, req));
  }
});

// Template-agnostic normalization for export
function toArrayGeneric(v: any): string[] {
  if (Array.isArray(v))
    return v
      .filter(x => x != null)
      .map(x => String(x).trim())
      .filter(Boolean);
  if (v == null) return [];
  const s = String(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeByTemplate(row: any, template: ScenarioTemplate) {
  const out: any = {};
  for (const col of template.columns) {
    const key = col.key;
    const v = row?.[key];
    if (col.type === 'array') out[key] = toArrayGeneric(v);
    else if (col.type === 'id') out[key] = v ? String(v) : '';
    else out[key] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  return out;
}

// Ensure every column defined by the selected template is present and non-empty
function ensureNonEmptyByTemplate(row: any, template: ScenarioTemplate): any {
  const out: any = { ...row };
  for (const col of template.columns) {
    const key = col.key;
    const val = out[key];
    if (col.type === 'array') {
      const arr = Array.isArray(val)
        ? val.map((x: any) => String(x).trim()).filter(Boolean)
        : [];
      out[key] = arr.length > 0 ? arr : ['Tidak tersedia'];
    } else if (col.type === 'id') {
      const v = typeof val === 'string' ? val.trim() : '';
      out[key] = v || 'SCN-001';
    } else {
      const v = typeof val === 'string' ? val.trim() : '';
      if (!v) {
        if (key === 'status') out[key] = 'NONE';
        else if (key === 'test_type') out[key] = 'Positive';
        else out[key] = 'Tidak tersedia';
      } else {
        out[key] = v;
      }
    }
  }
  return out;
}
