import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database';
import { RedisService } from './redis';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export interface SocketUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
  userId?: string;
}

export interface RecordingEvent {
  type: 'interaction' | 'screenshot' | 'error' | 'status';
  recordingId: string;
  data: any;
  timestamp: number;
}

export interface IssueEvent {
  type: 'created' | 'updated' | 'assigned' | 'commented';
  issueId: string;
  data: any;
  userId: string;
  timestamp: number;
}

export interface ProjectEvent {
  type: 'member_added' | 'member_removed' | 'settings_updated' | 'issue_created' | 'issue_updated';
  projectId: string;
  data: any;
  userId: string;
  timestamp: number;
}

export interface NotificationEvent {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  data?: any;
  persistent?: boolean;
  timestamp: number;
}

export class WebSocketService {
  private io: SocketIOServer;
  private db: DatabaseService;
  private redis: RedisService;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private userSockets: Map<string, AuthenticatedSocket> = new Map(); // socketId -> socket

  constructor(io: SocketIOServer) {
    this.io = io;
    this.db = new DatabaseService();
    this.redis = new RedisService();
  }

  public initialize(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, EnvConfig.JWT_SECRET) as any;
        
        // Get user from database
        const user = await this.db.users()
          .where('id', decoded.userId)
          .where('is_active', true)
          .first();

        if (!user) {
          return next(new Error('Invalid user'));
        }

        socket.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role
        };
        socket.userId = user.id;

        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket service initialized');
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    const socketId = socket.id;

    logger.info(`User connected via WebSocket: ${userId} (${socketId})`);

    // Track connected user
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);
    this.userSockets.set(socketId, socket);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Join user to their project rooms
    this.joinUserProjectRooms(socket, userId);

    // Set up event handlers
    this.setupEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'WebSocket connection established',
      userId,
      timestamp: Date.now()
    });
  }

  private async joinUserProjectRooms(socket: AuthenticatedSocket, userId: string): Promise<void> {
    try {
      // Get user's projects
      const userProjects = await this.db.teamMembers()
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .where('team_members.user_id', userId)
        .select('projects.id as project_id');

      // Join project rooms
      for (const project of userProjects) {
        socket.join(`project:${project.project_id}`);
        logger.debug(`User ${userId} joined project room: ${project.project_id}`);
      }
    } catch (error) {
      logger.error('Failed to join user project rooms:', error);
    }
  }

  private setupEventHandlers(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;

    // Recording events
    socket.on('recording:start', (data) => {
      this.handleRecordingStart(socket, data);
    });

    socket.on('recording:interaction', (data) => {
      this.handleRecordingInteraction(socket, data);
    });

    socket.on('recording:screenshot', (data) => {
      this.handleRecordingScreenshot(socket, data);
    });

    socket.on('recording:stop', (data) => {
      this.handleRecordingStop(socket, data);
    });

    // Issue events
    socket.on('issue:subscribe', (issueId) => {
      socket.join(`issue:${issueId}`);
      logger.debug(`User ${userId} subscribed to issue: ${issueId}`);
    });

    socket.on('issue:unsubscribe', (issueId) => {
      socket.leave(`issue:${issueId}`);
      logger.debug(`User ${userId} unsubscribed from issue: ${issueId}`);
    });

    // Project events
    socket.on('project:subscribe', (projectId) => {
      socket.join(`project:${projectId}`);
      logger.debug(`User ${userId} subscribed to project: ${projectId}`);
    });

    socket.on('project:unsubscribe', (projectId) => {
      socket.leave(`project:${projectId}`);
      logger.debug(`User ${userId} unsubscribed from project: ${projectId}`);
    });

    // Typing indicators
    socket.on('typing:start', (data) => {
      socket.to(`issue:${data.issueId}`).emit('user:typing', {
        userId,
        username: socket.user!.username,
        issueId: data.issueId
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`issue:${data.issueId}`).emit('user:stopped_typing', {
        userId,
        issueId: data.issueId
      });
    });

    // Presence
    socket.on('presence:update', (status) => {
      this.updateUserPresence(userId, status);
    });

    // Custom events
    socket.on('custom:event', (data) => {
      this.handleCustomEvent(socket, data);
    });
  }

  private handleRecordingStart(socket: AuthenticatedSocket, data: any): void {
    const userId = socket.userId!;
    
    logger.info(`Recording started by user ${userId}: ${data.recordingId}`);
    
    // Join recording room
    socket.join(`recording:${data.recordingId}`);
    
    // Notify project members if applicable
    if (data.projectId) {
      socket.to(`project:${data.projectId}`).emit('recording:started', {
        recordingId: data.recordingId,
        userId,
        username: socket.user!.username,
        projectId: data.projectId,
        timestamp: Date.now()
      });
    }
  }

  private handleRecordingInteraction(socket: AuthenticatedSocket, data: any): void {
    const userId = socket.userId!;
    
    // Broadcast to recording room (for real-time collaboration)
    socket.to(`recording:${data.recordingId}`).emit('recording:interaction', {
      ...data,
      userId,
      timestamp: Date.now()
    });

    // Update recording activity in Redis
    this.redis.set(
      `recording_activity:${data.recordingId}`,
      JSON.stringify({
        lastActivity: Date.now(),
        userId,
        interactionCount: (data.interactionCount || 0) + 1
      }),
      300 // 5 minutes
    );
  }

  private handleRecordingScreenshot(socket: AuthenticatedSocket, data: any): void {
    const userId = socket.userId!;
    
    // Broadcast screenshot notification to recording room
    socket.to(`recording:${data.recordingId}`).emit('recording:screenshot', {
      recordingId: data.recordingId,
      screenshotId: data.screenshotId,
      userId,
      timestamp: Date.now()
    });
  }

  private handleRecordingStop(socket: AuthenticatedSocket, data: any): void {
    const userId = socket.userId!;
    
    logger.info(`Recording stopped by user ${userId}: ${data.recordingId}`);
    
    // Leave recording room
    socket.leave(`recording:${data.recordingId}`);
    
    // Notify project members
    if (data.projectId) {
      socket.to(`project:${data.projectId}`).emit('recording:stopped', {
        recordingId: data.recordingId,
        userId,
        username: socket.user!.username,
        projectId: data.projectId,
        duration: data.duration,
        timestamp: Date.now()
      });
    }

    // Clean up recording activity
    this.redis.del(`recording_activity:${data.recordingId}`);
  }

  private handleDisconnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    const socketId = socket.id;

    logger.info(`User disconnected from WebSocket: ${userId} (${socketId})`);

    // Remove from tracking
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
        // Update presence to offline
        this.updateUserPresence(userId, 'offline');
      }
    }
    this.userSockets.delete(socketId);
  }

  private handleCustomEvent(socket: AuthenticatedSocket, data: any): void {
    const userId = socket.userId!;
    
    logger.debug(`Custom event from user ${userId}:`, data);
    
    // Handle custom events based on type
    switch (data.type) {
      case 'ping':
        socket.emit('pong', { timestamp: Date.now() });
        break;
      case 'echo':
        socket.emit('echo', data);
        break;
      default:
        logger.warn(`Unknown custom event type: ${data.type}`);
    }
  }

  private async updateUserPresence(userId: string, status: string): Promise<void> {
    try {
      const presence = {
        userId,
        status,
        lastSeen: Date.now()
      };

      // Store in Redis with TTL
      await this.redis.set(`user_presence:${userId}`, JSON.stringify(presence), 300);

      // Broadcast to user's project rooms
      const userProjects = await this.db.teamMembers()
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .where('team_members.user_id', userId)
        .select('projects.id as project_id');

      for (const project of userProjects) {
        this.io.to(`project:${project.project_id}`).emit('user:presence', presence);
      }
    } catch (error) {
      logger.error('Failed to update user presence:', error);
    }
  }

  // Public methods for sending events from other services

  public async emitToUser(userId: string, event: string, data: any): Promise<boolean> {
    const userSockets = this.connectedUsers.get(userId);
    if (!userSockets || userSockets.size === 0) {
      return false;
    }

    this.io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: Date.now()
    });

    return true;
  }

  public async emitToProject(projectId: string, event: string, data: any): Promise<void> {
    this.io.to(`project:${projectId}`).emit(event, {
      ...data,
      timestamp: Date.now()
    });
  }

  public async emitToIssue(issueId: string, event: string, data: any): Promise<void> {
    this.io.to(`issue:${issueId}`).emit(event, {
      ...data,
      timestamp: Date.now()
    });
  }

  public async broadcastRecordingEvent(recordingEvent: RecordingEvent): Promise<void> {
    this.io.to(`recording:${recordingEvent.recordingId}`).emit('recording:event', recordingEvent);
  }

  public async broadcastIssueEvent(issueEvent: IssueEvent): Promise<void> {
    // Emit to issue subscribers
    this.io.to(`issue:${issueEvent.issueId}`).emit('issue:event', issueEvent);

    // Also emit to the user who triggered the event
    await this.emitToUser(issueEvent.userId, 'issue:event', issueEvent);
  }

  public async broadcastProjectEvent(projectEvent: ProjectEvent): Promise<void> {
    this.io.to(`project:${projectEvent.projectId}`).emit('project:event', projectEvent);
  }

  public async sendNotification(userId: string, notification: NotificationEvent): Promise<boolean> {
    const sent = await this.emitToUser(userId, 'notification', notification);
    
    // Store persistent notifications in Redis
    if (notification.persistent) {
      try {
        const key = `user_notifications:${userId}`;
        const notifications = await this.redis.get(key);
        const notificationList = notifications ? JSON.parse(notifications) : [];
        
        notificationList.push({
          id: this.generateNotificationId(),
          ...notification,
          read: false
        });

        // Keep only last 50 notifications
        const trimmed = notificationList.slice(-50);
        await this.redis.set(key, JSON.stringify(trimmed), 86400 * 7); // 7 days
      } catch (error) {
        logger.error('Failed to store persistent notification:', error);
      }
    }

    return sent;
  }

  public async getUserNotifications(userId: string): Promise<any[]> {
    try {
      const key = `user_notifications:${userId}`;
      const notifications = await this.redis.get(key);
      return notifications ? JSON.parse(notifications) : [];
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      return [];
    }
  }

  public async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    try {
      const key = `user_notifications:${userId}`;
      const notifications = await this.redis.get(key);
      
      if (notifications) {
        const notificationList = JSON.parse(notifications);
        const notification = notificationList.find((n: any) => n.id === notificationId);
        
        if (notification) {
          notification.read = true;
          await this.redis.set(key, JSON.stringify(notificationList), 86400 * 7);
        }
      }
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    }
  }

  public getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  public getUserConnectionsCount(userId: string): number {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? userSockets.size : 0;
  }

  public isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  public async getActiveRecordings(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('recording_activity:*');
      return keys.map((key: string) => key.replace('recording_activity:', ''));
    } catch (error) {
      logger.error('Failed to get active recordings:', error);
      return [];
    }
  }

  private generateNotificationId(): string {
    const crypto = require('crypto');
    return crypto.randomUUID();
  }

  public async cleanup(): Promise<void> {
    // Clean up expired recording activities
    try {
      const keys = await this.redis.keys('recording_activity:*');
      const now = Date.now();
      
      for (const key of keys) {
        const activity = await this.redis.get(key);
        if (activity) {
          const data = JSON.parse(activity);
          if (now - data.lastActivity > 300000) { // 5 minutes
            await this.redis.del(key);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup recording activities:', error);
    }
  }
}