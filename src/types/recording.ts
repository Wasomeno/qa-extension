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
  assertionType?: 'equals' | 'contains' | 'exists' | 'not_exists' | 'visible' | 'hidden';
  isAssertion?: boolean;
  // Failure Handling & AI Fallback
  fallbackPolicy?: 'agent_resolve' | 'fail';
  timeoutMs?: number;
  retryCount?: number;
}

export interface TestBlueprint {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  projectId?: number;
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
  hasVideo?: boolean;
}
