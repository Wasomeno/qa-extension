export type TemplateColumnType = 'id' | 'text' | 'array';

export interface ScenarioTemplateColumn {
  key: string;
  label: string;
  type: TemplateColumnType;
  required?: boolean;
}

export interface ScenarioTemplate {
  name: string;
  description?: string;
  columns: ScenarioTemplateColumn[];
  mappingHints?: string;
}

// Minimal, dummy default template (can be changed later)
export const DefaultScenarioTemplate: ScenarioTemplate = {
  name: 'qa_default_scenarios_v1',
  description:
    'Minimal test scenario format for export. You can replace this later in Options.',
  columns: [
    { key: 'id', label: 'ID', type: 'id', required: true },
    { key: 'user_story', label: 'User Story', type: 'text', required: true },
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'preconditions', label: 'Preconditions', type: 'array' },
    { key: 'steps', label: 'Steps', type: 'array', required: true },
    {
      key: 'expected',
      label: 'Expected Result',
      type: 'array',
      required: true,
    },
    { key: 'priority', label: 'Priority', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
  mappingHints:
    'Map each acceptance criteria into one or more concise scenarios. Keep steps atomic and verifiable. Prefer Given-When-Then semantics translated into preconditions/steps/expected.',
};

export type ScenarioRow = Record<string, string | string | string[]>;
