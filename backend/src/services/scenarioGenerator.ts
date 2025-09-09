import { OpenAIService } from './openai';
import {
  ScenarioTemplate,
  ScenarioTemplateColumn,
  DefaultScenarioTemplate,
} from '../templates/defaultScenarioTemplate';
import { logger } from '../utils/logger';

export interface GenerateScenarioParams {
  acceptanceRows: Array<Record<string, string>>;
  template?: ScenarioTemplate;
  options?: {
    model?: string;
    temperature?: number;
    maxScenarios?: number;
  };
}

export class ScenarioGeneratorService {
  private openai = new OpenAIService();

  async generate(
    params: GenerateScenarioParams
  ): Promise<{ scenarios: any[]; meta: any }> {
    const template = params.template || DefaultScenarioTemplate;
    const columns = template.columns;
    const max = Math.max(
      1,
      params.options?.maxScenarios || Math.min(50, params.acceptanceRows.length)
    );

    // Reduce rows for prompt sizing if needed
    const sampleRows = params.acceptanceRows.slice(0, Math.min(100, max));

    const systemPrompt = `You are a senior QA engineer who converts acceptance criteria from a spreadsheet into minimal, testable scenarios.
Output STRICT JSON only: an array of objects matching the provided template columns.
Rules:
- Use concise, verifiable language
- Use 5-9 atomic steps per scenario; arrays for multi-step fields
- Do not invent product behavior beyond given criteria
- Preserve array fields as arrays of strings (no numbering)
- ID must be stable within this batch (e.g., SCN-001, -002, ...)
- Keep priority to one of: High|Medium|Low if present
- No additional commentary.`;

    const templateDesc = this.describeColumns(columns);
    console.log('TEMPLATE:', template);
    const rowsText = JSON.stringify(sampleRows, null, 2);

    const userPrompt = `Template Name: ${template.name}\nColumns: ${templateDesc}\nMapping Hints: ${template.mappingHints || 'none'}\n\nAcceptance Criteria Rows (sample):\n${rowsText}\n\nReturn a JSON array of scenarios with keys exactly as template keys.`;

    const raw = await (this.openai as any).safeChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      2000,
      0.2
    );

    console.log('RAW', raw);

    let scenarios: any[] = [];
    try {
      scenarios = JSON.parse((raw || '[]').trim());
    } catch (e) {
      logger.logValidationError(
        'scenario_json',
        raw?.slice(0, 200) || '',
        'Invalid JSON from model (first parse)'
      );
      // Try to extract and sanitize an array substring
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start >= 0 && end > start) {
        let sliced = raw.slice(start, end + 1);
        sliced = sanitizeJsonArrayString(sliced);
        try {
          scenarios = JSON.parse(sliced);
        } catch (e2) {
          logger.logValidationError(
            'scenario_json_sanitized',
            sliced.slice(0, 200),
            'Invalid JSON after sanitization'
          );
          throw e2;
        }
      } else {
        throw new Error('Model did not return a JSON array');
      }
    }

    // Basic validation/normalization against template
    const normalized = scenarios.map((row, idx) =>
      this.normalizeRow(row, columns, idx)
    );

    return {
      scenarios: normalized,
      meta: {
        usedRows: sampleRows.length,
        requested: params.acceptanceRows.length,
        template: template.name,
      },
    };
  }

  private describeColumns(cols: ScenarioTemplateColumn[]): string {
    return cols
      .map(c => `${c.key} (${c.label}) [${c.type}]${c.required ? '*' : ''}`)
      .join(', ');
  }

  private normalizeRow(
    row: any,
    columns: ScenarioTemplateColumn[],
    idx: number
  ): any {
    const out: any = {};
    for (const col of columns) {
      let v = row?.[col.key];
      if (col.type === 'id') {
        if (!v) v = `SCN-${String(idx + 1).padStart(3, '0')}`;
        out[col.key] = String(v);
      } else if (col.type === 'array') {
        if (Array.isArray(v)) out[col.key] = v.map(x => String(x));
        else if (typeof v === 'string' && v.includes('\n'))
          out[col.key] = v
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        else if (typeof v === 'string' && v.trim()) out[col.key] = [v.trim()];
        else out[col.key] = [];
      } else {
        out[col.key] = typeof v === 'string' ? v : v == null ? '' : String(v);
      }
    }
    return out;
  }

}

// Attempt to recover from minor JSON formatting issues common in LLM outputs
function sanitizeJsonArrayString(input: string): string {
  let s = input || '';
  // Strip code fences if present
  s = s.replace(/```json\s*|```/g, '');
  // Replace smart quotes with straight quotes
  s = s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  // Remove BOM
  s = s.replace(/^\uFEFF/, '');
  // Remove trailing commas before object/array close
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Remove JavaScript-style comments (just in case)
  s = s.replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
  s = s.replace(/^\s*\/\/.*$/gm, ''); // line comments
  // Collapse any stray control characters
  s = s.replace(/[\u0000-\u001F\u007F]/g, c => (c === '\n' || c === '\r' || c === '\t' ? c : ''));
  return s;
}
