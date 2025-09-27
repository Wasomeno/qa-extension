import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export class RedisService {
  private static instance: RedisService | null = null;
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = EnvConfig.REDIS_URL;
    
    this.client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return false;
          }
          return Math.min(retries * 50, 1000);
        }
      }
    });

    this.setupEventHandlers();
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis client connection ended');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  public async connect(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Redis client not initialized');
      }

      // Try to connect with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
      
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      
      // In development, allow the app to continue without Redis
      if (process.env.NODE_ENV === 'development') {
        logger.warn('⚠️  Redis not available - continuing in development mode');
        logger.warn('⚠️  Caching and session features will be disabled');
        logger.warn('⚠️  To fix: Start Redis server or check connection settings');
        this.client = null;
        this.isConnected = false;
        return;
      }
      
      // In production, Redis may be optional depending on your needs
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }

  private ensureConnected(): void {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available. Caching features are disabled.');
    }
  }

  public isAvailable(): boolean {
    return this.client !== null && this.isConnected;
  }

  public getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  public async ping(): Promise<string> {
    const client = this.getClient();
    return await client.ping();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Session management
  public async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    const client = this.getClient();
    await client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
  }

  public async getSession(sessionId: string): Promise<any | null> {
    const client = this.getClient();
    const data = await client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const client = this.getClient();
    await client.del(`session:${sessionId}`);
  }

  // Caching utilities
  public async set(key: string, value: any, ttl?: number): Promise<void> {
    const client = this.getClient();
    const serializedValue = JSON.stringify(value);
    
    if (ttl) {
      await client.setEx(key, ttl, serializedValue);
    } else {
      await client.set(key, serializedValue);
    }
  }

  public async get(key: string): Promise<any | null> {
    const client = this.getClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  public async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();
    return await client.keys(pattern);
  }

  public async del(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(key);
  }

  public async incr(key: string): Promise<number> {
    const client = this.getClient();
    return await client.incr(key);
  }

  public async decr(key: string): Promise<number> {
    const client = this.getClient();
    return await client.decr(key);
  }

  public async ttl(key: string): Promise<number> {
    const client = this.getClient();
    return await client.ttl(key);
  }

  public async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  // Rate limiting
  public async incrementRateLimit(key: string, window: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const client = this.getClient();
    const now = Date.now();
    const windowStart = Math.floor(now / (window * 1000)) * (window * 1000);
    const rateLimitKey = `rate_limit:${key}:${windowStart}`;

    const current = await client.incr(rateLimitKey);
    
    if (current === 1) {
      await client.expire(rateLimitKey, window);
    }

    const remaining = Math.max(0, maxRequests - current);
    const resetTime = windowStart + (window * 1000);

    return {
      allowed: current <= maxRequests,
      remaining,
      resetTime
    };
  }

  // Pub/Sub for real-time features
  public async publish(channel: string, message: any): Promise<void> {
    const client = this.getClient();
    await client.publish(channel, JSON.stringify(message));
  }

  public async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    const subscriber = this.client?.duplicate();
    if (!subscriber) {
      throw new Error('Failed to create Redis subscriber');
    }

    await subscriber.connect();
    
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          logger.error('Failed to parse Redis message:', error);
        }
      }
    });

    await subscriber.subscribe(channel, (message) => {
      callback(JSON.parse(message));
    });
  }

  // Recording synchronization removed

  // WebSocket session tracking
  public async addWebSocketSession(userId: string, socketId: string): Promise<void> {
    const client = this.getClient();
    await client.sAdd(`websocket_sessions:${userId}`, socketId);
  }

  public async removeWebSocketSession(userId: string, socketId: string): Promise<void> {
    const client = this.getClient();
    await client.sRem(`websocket_sessions:${userId}`, socketId);
  }

  public async getUserWebSocketSessions(userId: string): Promise<string[]> {
    const client = this.getClient();
    return client.sMembers(`websocket_sessions:${userId}`);
  }
}

// Export singleton instance
export const redisService = RedisService.getInstance();
