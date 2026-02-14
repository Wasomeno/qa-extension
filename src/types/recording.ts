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
