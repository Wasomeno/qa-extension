import { ScenarioTemplate } from './defaultScenarioTemplate';

export const GoogleScenarioTemplate: ScenarioTemplate = {
  name: 'qa_google_test_scenario_v1',
  description: 'Scenario format matching the provided Google Sheets: User Story, Test ID, Test Type, Test Scenario, Pre-condition, Test Step, Result, Status, Additional Note.',
  columns: [
    { key: 'user_story', label: 'User Story', type: 'text', required: true },
    { key: 'test_id', label: 'Test ID', type: 'id', required: true },
    { key: 'test_type', label: 'Test Type', type: 'text' },
    { key: 'test_scenario', label: 'Test Scenario', type: 'text', required: true },
    { key: 'pre_condition', label: 'Pre-condition', type: 'array' },
    { key: 'test_step', label: 'Test Step', type: 'array', required: true },
    { key: 'result', label: 'Result', type: 'array', required: true },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'additional_note', label: 'Additional Note', type: 'text' },
  ],
  mappingHints:
    [
      '- Input sheet columns are typically: Kode, Epic, Information, Detail, Note.',
      '- Map Kode -> test_id (keep as-is, e.g., MFY-001).',
      '- Map Epic (or a concise role + feature summary) -> user_story.',
      '- Map Information -> test_scenario (short objective).',
      '- Grouping: consecutive rows with blank Kode/Epic continue the previous Kode block; merge their Detail/Note into the same scenario.',
      '- Split Detail into actionable steps and expected outcomes:',
      "  * Lines that describe actions (Klik, Pilih, Isi, Sorting, Filter) -> test_step (array)",
      "  * Lines that describe outcomes (Menampilkan..., Mengurutkan..., Diarahkan..., Message ...) -> result (array)",
      '- Detect preconditions: any lines mentioning login/access/state (e.g., "Login ...", initial page) -> pre_condition.',
      '- Infer test_type: use Negative when Detail mentions gagal/error/warning/invalid/validation failure; otherwise Positive.',
      '- Status leave as NONE (to be executed) unless explicitly provided.',
      '- Additional Note: copy Note column if provided.',
      '- Use Indonesian language for steps/results when input is Indonesian.',
    ].join('\n'),
};
