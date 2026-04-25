import { RawEvent, TestBlueprint } from './recording';

export enum MessageType {
  CREATE_ISSUE = 'CREATE_ISSUE',
  GET_USER_DATA = 'GET_USER_DATA',
  AUTHENTICATE = 'AUTHENTICATE',
  OPEN_ISSUE_CREATOR = 'OPEN_ISSUE_CREATOR',
  CREATE_ISSUE_FROM_CONTEXT = 'CREATE_ISSUE_FROM_CONTEXT',
  CAPTURE_ELEMENT = 'CAPTURE_ELEMENT',
  CAPTURE_SCREENSHOT = 'CAPTURE_SCREENSHOT',
  FALLBACK_QUICK_CAPTURE = 'FALLBACK_QUICK_CAPTURE',
  SET_FLOATING_TRIGGER_VISIBILITY = 'SET_FLOATING_TRIGGER_VISIBILITY',
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
  CREATE_MERGE_REQUEST = 'CREATE_MERGE_REQUEST',
  GET_PROJECT_BRANCHES = 'GET_PROJECT_BRANCHES',
  GET_MERGE_REQUESTS = 'GET_MERGE_REQUESTS',
  START_RECORDING = 'START_RECORDING',
  ACTUAL_START_RECORDING = 'ACTUAL_START_RECORDING',
  STOP_RECORDING = 'STOP_RECORDING',
  GENERATE_BLUEPRINT = 'GENERATE_BLUEPRINT',
  SAVE_BLUEPRINT = 'SAVE_BLUEPRINT',
  DELETE_BLUEPRINT = 'DELETE_BLUEPRINT',
  START_PLAYBACK = 'START_PLAYBACK',
  STOP_PLAYBACK = 'STOP_PLAYBACK',
  PLAYBACK_STATUS_UPDATE = 'PLAYBACK_STATUS_UPDATE',
  PING = 'PING',
  GET_TAB_ID = 'GET_TAB_ID',
  OPEN_URL = 'OPEN_URL',
  OPEN_MAIN_MENU_PAGE = 'OPEN_MAIN_MENU_PAGE',
  GET_RECORDED_TESTS = 'GET_RECORDED_TESTS',
  ACTIVATE_QA_SESSION = 'ACTIVATE_QA_SESSION',
  R2_UPLOAD = 'R2_UPLOAD',
  CLOSE_MAIN_MENU = 'CLOSE_MAIN_MENU',
  CDP_CLICK = 'CDP_CLICK',
  CDP_TYPE = 'CDP_TYPE',
  CDP_CLEAR_INPUT = 'CDP_CLEAR_INPUT',
  CDP_ATTACH = 'CDP_ATTACH',
  CDP_DETACH = 'CDP_DETACH',
  CDP_SCROLL = 'CDP_SCROLL',
  IFRAME_CLOSED_OVERLAY = 'IFRAME_CLOSED_OVERLAY',
  IFRAME_STARTED_RECORDING = 'IFRAME_STARTED_RECORDING',
  IFRAME_PREPARE_RECORDING = 'IFRAME_PREPARE_RECORDING',
  IFRAME_STOP_RECORDING = 'IFRAME_STOP_RECORDING',
  IFRAME_LOG_EVENT = 'IFRAME_LOG_EVENT',
  RESIZE_IFRAME = 'RESIZE_IFRAME',
  OPEN_RECORDING_OVERLAY = 'OPEN_RECORDING_OVERLAY',
  BLUEPRINT_SAVED = 'BLUEPRINT_SAVED',
  BLUEPRINT_PROCESSING = 'BLUEPRINT_PROCESSING',
  BLUEPRINT_GENERATED = 'BLUEPRINT_GENERATED',
  GET_VIDEO_THUMBNAIL = 'GET_VIDEO_THUMBNAIL',
  UPDATE_BLUEPRINT = 'UPDATE_BLUEPRINT',
  AGENT_CHAT_SSE = 'AGENT_CHAT_SSE',
  AGENT_FIX_ISSUE_SSE = 'AGENT_FIX_ISSUE_SSE',
  TEST_SCENARIO_UPLOAD = 'TEST_SCENARIO_UPLOAD',
  START_VIDEO_CAPTURE = 'START_VIDEO_CAPTURE',
  STOP_VIDEO_CAPTURE = 'STOP_VIDEO_CAPTURE',
  VIDEO_CAPTURE_COMPLETE = 'VIDEO_CAPTURE_COMPLETE',
  RECORDING_ERROR = 'RECORDING_ERROR',
  TELEMETRY_UPDATE = 'TELEMETRY_UPDATE',
  GET_TELEMETRY = 'GET_TELEMETRY',
}

export interface ExtensionMessage {
  type: MessageType;
  data?: any;
  requestId?: string;
}

export interface GenerateBlueprintRequest {
  events: RawEvent[];
}

export interface GenerateBlueprintResponse {
  blueprint: TestBlueprint;
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
    selectorCandidates?: string[];
    xpath?: string;
    xpathCandidates?: string[];
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

export interface MergeRequestData {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
  assigneeIds?: number[];
  reviewerIds?: number[];
  removeSourceBranch?: boolean;
  squash?: boolean;
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
