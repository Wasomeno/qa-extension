import { InteractionEvent } from './messages';

export interface RawEvent extends InteractionEvent {
  // Add any additional raw event properties here if needed
  isTrusted?: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  startTime?: number;
  events: RawEvent[];
}

export interface RecordingSession {
  id: string;
  name: string;
  baseUrl: string;
  projectId?: number;
  createdAt: number;
  events: RawEvent[];
}

export interface TestStep {
  id?: string;
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  selectorCandidates?: string[];
  // Deep element tracking fields
  xpath?: string;
  xpathCandidates?: string[];
  parentSelector?: string;
  elementHints?: {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    parentInfo?: {
      tagName: string;
      id?: string;
      selector?: string;
      attributes?: Record<string, string>;
    };
    structuralInfo?: {
      depth: number;
      siblingIndex: number;
      totalSiblings: number;
    };
  };
  value?: string;
  description: string;
  // Enhanced assertions and parameterization
  expectedValue?: string;
  assertionType?:
    | 'equals'
    | 'contains'
    | 'exists'
    | 'not_exists'
    | 'visible'
    | 'hidden';
  isAssertion?: boolean;
  // Failure Handling & AI Fallback
  fallbackPolicy?: 'agent_resolve' | 'fail';
  timeoutMs?: number;
  retryCount?: number;
}

export interface ElementHints {
  attributes: Record<string, string>;
  tagName: string;
}

export interface RecordingStep {
  action: string;
  description: string;
  selector: string;
  value?: string;
  elementHints?: ElementHints;
  selectorCandidates?: string[];
  xpath?: string;
  xpathCandidates?: string[];
  assertionType?: string;
  expectedValue?: string;
}

export interface TestRecording {
  id: string; // Required for saving
  name: string;
  description?: string;
  status: string;
  project_id?: string;
  project_name?: string;
  issue_id?: string;
  steps: RecordingStep[];
  parameters: any[];
  created_at?: string | number;
  videoUrl?: string;
  video_url?: string;
}

export interface ListRecordingsParams {
  project_id?: string;
  issue_id?: string;
  sort_by?: 'created_at' | 'name';
  order?: 'desc' | 'asc';
}

// Result types (used by the Agent/Runner)
export interface TestStepResult {
  stepIndex: number;
  status: 'success' | 'failure';
  error?: string;
  screenshot?: string; // Base64 or URL
}

export interface TestResult {
  testId: string;
  status: 'passed' | 'failed';
  stepResults: TestStepResult[];
  log?: string;
}

export interface ProjectDetails {
  id: number;
  name: string;
  nameWithNamespace: string;
  path: string;
  pathWithNamespace: string;
  description?: string;
  webUrl: string;
  defaultBranch?: string;
  visibility?: string;
  namespace?: {
    id: number;
    name: string;
    path: string;
    kind: string;
    webUrl: string;
  };
}

export interface TestBlueprint {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  project_id?: number;
  project_name?: string;
  projectDetails?: ProjectDetails;
  issue_id?: string;
  created_at?: string | number;
  auth?: {
    type: 'sessionState';
    storageStatePath?: string;
    requiresAuth: boolean;
  };
  setup?: TestStep[];
  steps: TestStep[];
  teardown?: TestStep[];
  parameters: string[];
  status?: 'processing' | 'ready' | 'failed';
  error?: string;
  video_url?: string;
}
