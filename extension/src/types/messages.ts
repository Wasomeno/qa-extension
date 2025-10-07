export enum MessageType {
  CREATE_ISSUE = 'CREATE_ISSUE',
  GET_USER_DATA = 'GET_USER_DATA',
  AUTHENTICATE = 'AUTHENTICATE',
  OPEN_ISSUE_CREATOR = 'OPEN_ISSUE_CREATOR',
  CREATE_ISSUE_FROM_CONTEXT = 'CREATE_ISSUE_FROM_CONTEXT',
  CAPTURE_ELEMENT = 'CAPTURE_ELEMENT',
  CAPTURE_SCREENSHOT = 'CAPTURE_SCREENSHOT',
  FALLBACK_QUICK_CAPTURE = 'FALLBACK_QUICK_CAPTURE',
  TRACK_INTERACTION = 'TRACK_INTERACTION',
  PAGE_LOADED = 'PAGE_LOADED',
  ELEMENT_CAPTURED = 'ELEMENT_CAPTURED',
  TOGGLE_FLOATING_TRIGGER = 'TOGGLE_FLOATING_TRIGGER',
  QUICK_CAPTURE = 'QUICK_CAPTURE',
  BACKGROUND_FETCH = 'BACKGROUND_FETCH',
  FILE_UPLOAD = 'FILE_UPLOAD',
  AI_TRANSCRIBE = 'AI_TRANSCRIBE',
  AUTH_START = 'AUTH_START',
  AUTH_GET_SESSION = 'AUTH_GET_SESSION',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_SESSION_UPDATED = 'AUTH_SESSION_UPDATED',
}

export interface ExtensionMessage {
  type: MessageType;
  data?: any;
  requestId?: string;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
}

export interface InteractionEvent {
  type: 'click' | 'input' | 'scroll' | 'hover' | 'focus' | 'navigation';
  timestamp: number;
  element: {
    tagName: string;
    id?: string;
    className?: string;
    selector: string;
    textContent?: string;
    attributes?: Record<string, string>;
  };
  position?: { x: number; y: number };
  value?: string;
  url: string;
  viewport: { width: number; height: number };
}

export interface IssueData {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  projectId?: string;
  assigneeId?: string;
  attachments?: string[];
  acceptanceCriteria?: string[];
  labelIds?: string[];
  issueFormat: string;
  browserInfo?: any;
  childDescriptions?: string[];
  browserContext?: any;
  errorDetails?: any;
  checkDuplicates?: boolean;
  // Optional Slack notification fields
  slackChannelId?: string;
  slackUserIds?: string[];
}

export interface UserData {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  gitlabConnected: boolean;
  slackConnected: boolean;
  preferences: {
    defaultProject?: string;
    notificationSettings: {
      desktop: boolean;
      sound: boolean;
    };
  };
}

export interface AuthData {
  gitlabToken?: string;
  slackToken?: string;
  jwtToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

// Background fetch bridge types
export interface BackgroundFetchRequest {
  url: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    credentials?: RequestCredentials;
    redirect?: RequestRedirect;
    cache?: RequestCache;
    mode?: RequestMode;
  };
  responseType?: 'json' | 'text' | 'arrayBuffer';
  includeHeaders?: boolean;
  timeoutMs?: number;
}

export interface BackgroundFetchResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers?: Record<string, string>;
  body?: T;
}
