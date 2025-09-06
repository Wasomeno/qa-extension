/**
 * Shared TypeScript types for QA Command Center
 * These types are used across both backend and extension
 */

// ============================================================================
// Base Types
// ============================================================================

export type UUID = string;
export type ISODateTime = string;
export type URLString = string;
export type EmailString = string;

// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'admin' | 'user' | 'viewer';

export interface User {
  id: UUID;
  email: EmailString;
  username: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateUserRequest {
  email: EmailString;
  username: string;
  fullName: string;
  password: string;
}

export interface UpdateUserRequest {
  fullName?: string;
  avatarUrl?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserProfile extends Omit<User, 'id'> {
  oauthConnections: {
    gitlab: boolean;
    slack: boolean;
  };
  preferences: UserPreferences;
  stats: UserStats;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    browser: boolean;
    slack: boolean;
  };
}

export interface UserStats {
  issuesCreated: number;
  lastActiveAt: ISODateTime;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface LoginRequest {
  email: EmailString;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: TokenPair;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  email: EmailString;
}

export interface ConfirmResetRequest {
  token: string;
  newPassword: string;
}

// ============================================================================
// OAuth Types
// ============================================================================

export type OAuthProvider = 'gitlab' | 'slack' | 'github';

export interface OAuthConnection {
  id: UUID;
  userId: UUID;
  provider: OAuthProvider;
  providerUserId: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: ISODateTime;
  scopes: string[];
  providerData: Record<string, any>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OAuthAuthRequest {
  provider: OAuthProvider;
  redirectUri: URLString;
  state?: string;
}

export interface OAuthCallbackRequest {
  code: string;
  state?: string;
}

// ============================================================================
// Team Types
// ============================================================================

export type TeamMemberRole = 'admin' | 'member' | 'viewer';

export interface Team {
  id: UUID;
  name: string;
  description?: string;
  slug: string;
  ownerId: UUID;
  isActive: boolean;
  settings: TeamSettings;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TeamSettings {
  allowPublicProjects: boolean;
  defaultProjectVisibility: 'private' | 'internal' | 'public';
  requireApprovalForNewMembers: boolean;
  integrations: {
    gitlab: boolean;
    slack: boolean;
  };
}

export interface TeamMember {
  id: UUID;
  teamId: UUID;
  userId: UUID;
  role: TeamMemberRole;
  joinedAt: ISODateTime;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  slug: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  settings?: Partial<TeamSettings>;
}

// ============================================================================
// Project Types
// ============================================================================

export type ProjectStatus = 'active' | 'inactive' | 'archived';
export type ProjectMemberRole = 'admin' | 'developer' | 'tester' | 'viewer';

export interface Project {
  id: UUID;
  name: string;
  description?: string;
  slug: string;
  teamId?: UUID;
  ownerId: UUID;
  gitlabProjectId?: number;
  gitlabProjectPath?: string;
  repositoryUrl?: URLString;
  websiteUrl?: URLString;
  status: ProjectStatus;
  settings: ProjectSettings;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectSettings {
  visibility: 'private' | 'internal' | 'public';
  issueTracking: boolean;
  aiAssistance: boolean;
  webhooks: {
    gitlab: boolean;
    slack: boolean;
  };
  notifications: {
    newIssues: boolean;
    assignmentChanges: boolean;
  };
}

export interface ProjectMember {
  id: UUID;
  projectId: UUID;
  userId: UUID;
  role: ProjectMemberRole;
  permissions: ProjectPermissions;
  joinedAt: ISODateTime;
}

export interface ProjectPermissions {
  canCreateIssues: boolean;
  canEditIssues: boolean;
  canDeleteIssues: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  slug: string;
  teamId?: UUID;
  gitlabProjectId?: number;
  repositoryUrl?: URLString;
  websiteUrl?: URLString;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  repositoryUrl?: URLString;
  websiteUrl?: URLString;
  status?: ProjectStatus;
  settings?: Partial<ProjectSettings>;
}

export interface ProjectStats {
  issueCount: number;
  memberCount: number;
  recentActivity: ActivityItem[];
}


// ============================================================================
// Issue Types
// ============================================================================

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'rejected';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssuePriority = 'urgent' | 'high' | 'normal' | 'low';

export interface Issue {
  id: UUID;
  title: string;
  description: string;
  projectId: UUID;
  reporterId: UUID;
  assigneeId?: UUID;
  gitlabIssueId?: number;
  gitlabIssueIid?: number;
  status: IssueStatus;
  severity: IssueSeverity;
  priority: IssuePriority;
  labels: string[];
  tags: string[];
  acceptanceCriteria: string[];
  reproductionSteps: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  environmentInfo?: EnvironmentInfo;
  attachments: Attachment[];
  dueDate?: string; // ISO date string
  estimatedHours?: number;
  actualHours?: number;
  resolutionNotes?: string;
  metadata: IssueMetadata;
  resolvedAt?: ISODateTime;
  closedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EnvironmentInfo {
  os: string;
  browser: string;
  device: string;
  screenResolution: string;
  url: URLString;
  timestamp: ISODateTime;
}

export interface Attachment {
  id: UUID;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: URLString;
  uploadedAt: ISODateTime;
}

export interface IssueMetadata {
  aiGenerated: boolean;
  confidence?: number;
  relatedIssues: UUID[];
  duplicateOf?: UUID;
  estimationMethod?: 'manual' | 'ai' | 'historical';
}

export interface CreateIssueRequest {
  title: string;
  description: string;
  projectId: UUID;
  assigneeId?: UUID;
  severity?: IssueSeverity;
  priority?: IssuePriority;
  labels?: string[];
  tags?: string[];
  reproductionSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  environmentInfo?: EnvironmentInfo;
  dueDate?: string;
  estimatedHours?: number;
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  assigneeId?: UUID | null;
  status?: IssueStatus;
  severity?: IssueSeverity;
  priority?: IssuePriority;
  labels?: string[];
  tags?: string[];
  acceptanceCriteria?: string[];
  reproductionSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  resolutionNotes?: string;
}

export interface IssueComment {
  id: UUID;
  issueId: UUID;
  userId: UUID;
  content: string;
  isInternal: boolean;
  gitlabNoteId?: number;
  attachments: Attachment[];
  metadata: CommentMetadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CommentMetadata {
  edited: boolean;
  mentions: UUID[];
  references: IssueReference[];
}

export interface IssueReference {
  type: 'issue' | 'project';
  id: UUID;
  title?: string;
}

export interface CreateCommentRequest {
  content: string;
  isInternal?: boolean;
  attachments?: File[];
}

export interface UpdateCommentRequest {
  content: string;
}

// ============================================================================
// AI Types
// ============================================================================

export interface AIIssueGenerationRequest {
  errorDetails?: ErrorInfo;
  userDescription?: string;
  reproductionSteps?: string[];
  screenshots?: string[];
  consoleErrors?: string[];
  networkErrors?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
}

export interface AIGeneratedIssue {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  severity: IssueSeverity;
  priority: IssuePriority;
  labels: string[];
  estimatedEffort?: string;
  affectedComponents?: string[];
  confidence: number;
}

export interface AITestScriptRequest {
  issueId: UUID;
  framework: 'playwright' | 'selenium' | 'cypress';
  language: 'javascript' | 'typescript' | 'python';
}

export interface AIGeneratedTestScript {
  framework: string;
  language: string;
  script: string;
  description: string;
  prerequisites: string[];
  expectedOutcome: string;
}

export interface AISeverityClassificationRequest {
  errorType: string;
  errorMessage: string;
  affectedFunctionality: string;
  userImpact: string;
  businessImpact?: string;
  frequency?: string;
}

export interface AIClassificationResult {
  severity: IssueSeverity;
  priority: IssuePriority;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// Error and Logging Types
// ============================================================================

export interface ErrorInfo {
  message: string;
  stack?: string;
  type: string;
  timestamp: ISODateTime;
  url?: URLString;
  lineNumber?: number;
  columnNumber?: number;
}

export interface NetworkRequest {
  id: string;
  url: URLString;
  method: string;
  status: number;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  duration: number;
  timestamp: ISODateTime;
  error?: string;
}

export interface ConsoleMessage {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  args: any[];
  timestamp: ISODateTime;
  url?: URLString;
  lineNumber?: number;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: ISODateTime;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'issue_assigned' | 'issue_updated' | 'issue_commented' | 'project_invited' | 'system_alert';

export interface Notification {
  id: UUID;
  userId: UUID;
  type: NotificationType;
  title: string;
  message?: string;
  data: NotificationData;
  isRead: boolean;
  readAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface NotificationData {
  issueId?: UUID;
  projectId?: UUID;
  userId?: UUID;
  actionUrl?: URLString;
  metadata?: Record<string, any>;
}

export interface CreateNotificationRequest {
  userId: UUID;
  type: NotificationType;
  title: string;
  message?: string;
  data?: NotificationData;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface Webhook {
  id: UUID;
  projectId?: UUID;
  userId: UUID;
  name: string;
  url: URLString;
  secret?: string;
  events: string[];
  isActive: boolean;
  headers: Record<string, string>;
  lastTriggeredAt?: ISODateTime;
  lastResponseStatus?: number;
  failureCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WebhookDelivery {
  id: UUID;
  webhookId: UUID;
  eventType: string;
  payload: Record<string, any>;
  responseStatus?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  deliveredAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface CreateWebhookRequest {
  name: string;
  url: URLString;
  secret?: string;
  events: string[];
  headers?: Record<string, string>;
  projectId?: UUID;
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: URLString;
  secret?: string;
  events?: string[];
  isActive?: boolean;
  headers?: Record<string, string>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: APIError;
}

export interface APIError {
  code: string;
  message: string;
  details?: string;
  field?: string;
  timestamp: ISODateTime;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterParams {
  search?: string;
  status?: string;
  severity?: string;
  priority?: string;
  assigneeId?: UUID;
  reporterId?: UUID;
  projectId?: UUID;
  createdAfter?: ISODateTime;
  createdBefore?: ISODateTime;
  updatedAfter?: ISODateTime;
  updatedBefore?: ISODateTime;
}

// ============================================================================
// Activity and History Types
// ============================================================================

export type ActivityType = 'created' | 'updated' | 'assigned' | 'unassigned' | 'status_changed' | 'priority_changed' | 'severity_changed' | 'commented' | 'closed' | 'reopened';

export interface ActivityItem {
  id: UUID;
  type: ActivityType;
  actorId: UUID;
  actorName: string;
  actorAvatarUrl?: string;
  resourceType: 'issue' | 'project' | 'user';
  resourceId: UUID;
  resourceTitle?: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: ISODateTime;
}

export interface IssueHistory {
  id: UUID;
  issueId: UUID;
  userId: UUID;
  action: ActivityType;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  metadata: Record<string, any>;
  createdAt: ISODateTime;
}

// ============================================================================
// Statistics and Analytics Types
// ============================================================================

export interface ProjectAnalytics {
  issueMetrics: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byStatus: Record<IssueStatus, number>;
    bySeverity: Record<IssueSeverity, number>;
    byPriority: Record<IssuePriority, number>;
  };
  timeMetrics: {
    averageResolutionTime: number;
    issueCreationTrend: TimeSeries[];
    resolutionTrend: TimeSeries[];
  };
  teamMetrics: {
    memberCount: number;
    activeMembers: number;
    topContributors: UserContribution[];
  };
}

export interface TimeSeries {
  timestamp: ISODateTime;
  value: number;
}

export interface UserContribution {
  userId: UUID;
  username: string;
  fullName: string;
  avatarUrl?: string;
  issuesCreated: number;
  issuesResolved: number;
  lastActiveAt: ISODateTime;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: ISODateTime;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    gitlab?: ServiceHealth;
    slack?: ServiceHealth;
  };
  version: string;
  uptime: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: ISODateTime;
}

// ============================================================================
// Extension Message Types
// ============================================================================

export type MessageType = 
  | 'CREATE_ISSUE'
  | 'GET_PROJECTS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'GET_USER'
  | 'CAPTURE_SCREENSHOT';

export interface ExtensionMessage<T = any> {
  type: MessageType;
  data?: T;
  requestId?: string;
  timestamp: number;
}

export interface ExtensionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
  timestamp: number;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

export type WebSocketEventType =
  | 'issue_created'
  | 'issue_updated'
  | 'notification'
  | 'user_joined'
  | 'user_left';

export interface WebSocketEvent<T = any> {
  type: WebSocketEventType;
  data: T;
  timestamp: ISODateTime;
  userId?: UUID;
  projectId?: UUID;
}

// ============================================================================
// Export all types for easy import
// ============================================================================

// Note: These modules don't exist yet, removing exports for now
// export * from './database';
// export * from './api';
// export * from './extensions';