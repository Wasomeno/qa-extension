import { Router, Request, Response } from 'express';
import { GoogleSheetReader } from '../services/sheets';
import { ScenarioGeneratorService } from '../services/scenarioGenerator';
import { XlsxExporter } from '../services/exporter';
import { DefaultScenarioTemplate } from '../templates/defaultScenarioTemplate';
import { GoogleScenarioTemplate } from '../templates/googleScenarioTemplate';
import { mapAcceptanceToGoogleScenarios } from '../services/acceptanceMapper';
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

// Simple GET to return current default template
scenariosRouter.get('/template', (req: Request, res: Response) => {
  // Default to Google template when not specified
  const format = String(
    req.query.format || req.query.template || 'google'
  ).toLowerCase();
  const tpl =
    format === 'google' || format === 'qa_google_test_scenario_v1'
      ? GoogleScenarioTemplate
      : DefaultScenarioTemplate;
  return res.json({ success: true, data: tpl });
});

// Preview: reads sheet, generates small sample
scenariosRouter.get('/preview', async (req: Request, res: Response) => {
  try {
    const url = String(req.query.url || '');
    if (!url)
      return res.status(400).json({ success: false, error: 'Missing url' });
    const read = await GoogleSheetReader.readPublicCsv(url);
    const generator = new ScenarioGeneratorService();
    const max = Math.min(
      50,
      Math.max(1, Number(req.query.limit || req.query.maxScenarios || 10))
    );
    const format = String(req.query.format || req.query.template).toLowerCase();
    const template =
      format === 'google' || format === 'qa_google_test_scenario_v1'
        ? GoogleScenarioTemplate
        : DefaultScenarioTemplate;
    const useDeterministic = template === GoogleScenarioTemplate;
    let scenarios: any[] = [];
    let meta: any = {};
    if (useDeterministic && template === GoogleScenarioTemplate) {
      scenarios = mapAcceptanceToGoogleScenarios(read.rows, max);
      console.log('SCENARIOS', scenarios);
      meta = {
        method: 'deterministic',
        count: scenarios.length,
        template: template.name,
      };
    } else {
      const result = await generator.generate({
        acceptanceRows: read.rows,
        template,
        options: { maxScenarios: max },
      });
      scenarios = result.scenarios;
      meta = { ...result.meta, method: 'llm' };
      console.log('RESULT', result);
    }

    return res.json({
      success: true,
      data: {
        scenarios,
        meta: { ...meta, sheet: { id: read.spreadsheetId, gid: read.gid } },
      },
    });
  } catch (e: any) {
    logger.logError('Scenario preview failed', e);
    return res.status(400).json(buildErrorPayload(e, req));
  }
});

// Generate full set
scenariosRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { url, template, options } = req.body || {};
    if (!url)
      return res.status(400).json({ success: false, error: 'Missing url' });
    const read = await GoogleSheetReader.readPublicCsv(String(url));
    const generator = new ScenarioGeneratorService();
    const { scenarios, meta } = await generator.generate({
      acceptanceRows: read.rows,
      template: template || DefaultScenarioTemplate,
      options: options || {},
    });
    return res.json({
      success: true,
      data: scenarios,
      meta: { ...meta, count: scenarios.length },
    });
  } catch (e: any) {
    logger.logError('Scenario generate failed', e);
    return res.status(400).json(buildErrorPayload(e, req));
  }
});

// Export XLSX (Google Test Scenario format)
scenariosRouter.post('/export', async (req: Request, res: Response) => {
  try {
    const { scenarios } = req.body || {};
    if (!Array.isArray(scenarios)) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing scenarios array' });
    }
    // Always use the Google test scenario format as requested
    const tpl = GoogleScenarioTemplate;

    // Normalize rows to match chosen template shape
    const rows = scenarios.map(s => normalizeToGoogleRow(s));
    // Enforce required fields (no fallbacks): user_story must be present

    const buf = await XlsxExporter.toXlsxBuffer(rows, tpl, {
      sheetName: 'Scenarios',
    });
    const filename = `${new Date().toISOString().split('T')[0]}-${tpl.name}-scenarios.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (e: any) {
    logger.logError('Scenario export failed', e);
    return res.status(400).json(buildErrorPayload(e, req));
  }
});

// Ensure exported rows align with GoogleScenarioTemplate keys and array formatting
function toArray(v: any): string[] {
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

function normalizeToGoogleRow(s: any) {
  // Strict: user_story must be explicitly provided; no fallbacks
  const pre = toArray(
    s.pre_condition ?? s.preCondition ?? s.preconditions ?? s.precondition
  );
  const steps = toArray(s.test_step ?? s.testStep ?? s.steps ?? s.step);
  const results = toArray(
    s.result ?? s.expected ?? s.expected_result ?? s.expectedResult ?? s.results
  );
  const userStory = typeof s.user_story === 'string' ? s.user_story : '';
  return {
    user_story: userStory,
    test_id: s.test_id ?? s.testId ?? s.id ?? s.kode ?? s.code ?? '',
    test_type: s.test_type ?? s.testType ?? s.type ?? '',
    test_scenario:
      s.test_scenario ??
      s.testScenario ??
      s.scenario ??
      s.information ??
      s.title ??
      '',
    pre_condition: pre,
    test_step: steps,
    result: results,
    status: s.status ?? 'NONE',
    additional_note:
      s.additional_note ?? s.additionalNote ?? s.note ?? s.notes ?? '',
  };
}
