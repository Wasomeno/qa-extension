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
  createdAt: number;
  events: RawEvent[];
}

export interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  value?: string;
  description: string;
}

export interface TestBlueprint {
  name: string;
  description: string;
  steps: TestStep[];
  parameters: string[];
}
