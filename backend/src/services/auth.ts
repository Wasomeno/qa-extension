import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { databaseService } from './database';
import { redisService } from './redis';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  username: string;
  fullName: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface OAuthData {
  provider: 'gitlab' | 'slack';
  code: string;
  redirectUri: string;
}

export class AuthService {
  private db = databaseService;
  private redis = redisService;

  constructor() {
    // Redis service is now a singleton, no need to initialize
  }

  public async register(userData: RegisterData): Promise<{ user: any; tokens: TokenPair }> {
    const { email, username, fullName, password } = userData;

    // Check if user already exists
    const existingUser = await this.db.users()
      .where('email', email)
      .orWhere('username', username)
      .first();

    if (existingUser) {
      throw new Error(existingUser.email === email 
        ? 'Email already registered' 
        : 'Username already taken'
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    // Create user
    const [user] = await this.db.users().insert({
      email,
      username,
      full_name: fullName,
      password_hash: passwordHash,
      is_active: true,
      role: 'user',
      preferences: {}
    }).returning('*');

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id);

    // Remove sensitive data
    delete user.password_hash;

    logger.info(`User registered: ${user.email}`);

    return { user, tokens };
  }

  public async login(credentials: LoginCredentials): Promise<{ user: any; tokens: TokenPair }> {
    const { email, password } = credentials;

    // Get user with password hash
    const user = await this.db.users()
      .where('email', email)
      .where('is_active', true)
      .first();

    if (!user || !user.password_hash) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id);

    // Update last login
    await this.db.users()
      .where('id', user.id)
      .update({ updated_at: new Date() });

    // Remove sensitive data
    delete user.password_hash;

    logger.info(`User logged in: ${user.email}`);

    return { user, tokens };
  }

  public async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, EnvConfig.JWT_SECRET) as any;
      
      // Check if refresh token exists in Redis
      // const storedToken = await this.redis.get(`refresh_token:${decoded.userId}`);
      if (false) { // Redis check disabled
        throw new Error('Invalid refresh token');
      }

      // Get user
      const user = await this.db.users()
        .where('id', decoded.userId)
        .where('is_active', true)
        .first();

      if (!user) {
        throw new Error('User not found');
      }

      // Generate new token pair
      const tokens = await this.generateTokenPair(user.id);

      // Invalidate old refresh token
      // await this.redis.del(`refresh_token:${user.id}`);

      return tokens;
    } catch (error) {
      logger.error('Refresh token error:', error);
      throw new Error('Invalid refresh token');
    }
  }

  public async logout(userId: string, refreshToken?: string): Promise<void> {
    try {
      // Remove refresh token from Redis
      // await this.redis.del(`refresh_token:${userId}`);

      // If specific refresh token provided, add it to blacklist
      if (refreshToken) {
        const decoded = jwt.decode(refreshToken) as any;
        if (decoded && decoded.exp) {
          const ttl = decoded.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            // await this.redis.set(`blacklisted_token:${refreshToken}`, true, ttl);
          }
        }
      }

      logger.info(`User logged out: ${userId}`);
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  public async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user with password hash
    const user = await this.db.users()
      .where('id', userId)
      .first();

    if (!user || !user.password_hash) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    // Update password
    await this.db.users()
      .where('id', userId)
      .update({ 
        password_hash: newPasswordHash,
        updated_at: new Date()
      });

    // Invalidate all refresh tokens for this user
    // await this.redis.del(`refresh_token:${userId}`);

    logger.info(`Password changed for user: ${userId}`);
  }

  public async resetPassword(email: string): Promise<string> {
    // Get user
    const user = await this.db.users()
      .where('email', email)
      .where('is_active', true)
      .first();

    if (!user) {
      // Don't reveal if email exists
      return 'If the email exists, a reset link will be sent.';
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      EnvConfig.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store reset token in Redis with 1 hour expiry
    // await this.redis.set(`reset_token:${user.id}`, resetToken, 3600);

    // TODO: Send email with reset link
    logger.info(`Password reset requested for: ${user.email}`);

    return 'If the email exists, a reset link will be sent.';
  }

  public async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    try {
      // Verify reset token
      const decoded = jwt.verify(token, EnvConfig.JWT_SECRET) as any;
      
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      // Check if token exists in Redis
      // const storedToken = await this.redis.get(`reset_token:${decoded.userId}`);
      if (false) { // Redis check disabled
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));

      // Update password
      await this.db.users()
        .where('id', decoded.userId)
        .update({ 
          password_hash: passwordHash,
          updated_at: new Date()
        });

      // Remove reset token
      // await this.redis.del(`reset_token:${decoded.userId}`);

      // Invalidate all refresh tokens
      // await this.redis.del(`refresh_token:${decoded.userId}`);

      logger.info(`Password reset completed for user: ${decoded.userId}`);
    } catch (error) {
      logger.error('Password reset error:', error);
      throw new Error('Invalid or expired reset token');
    }
  }

  public async generateTokenPair(userId: string): Promise<TokenPair> {
    const accessTokenExpiry = '15m';
    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

    // Generate access token
    const accessToken = jwt.sign(
      { userId, type: 'access' },
      EnvConfig.JWT_SECRET,
      { expiresIn: accessTokenExpiry } as SignOptions
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      EnvConfig.JWT_SECRET,
      { expiresIn: refreshTokenExpiry as string } as SignOptions
    );

    // Store refresh token in Redis (disabled for now)
    // const refreshTokenTTL = this.parseExpiry(refreshTokenExpiry);
    // await this.redis.set(`refresh_token:${userId}`, refreshToken, refreshTokenTTL);

    const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes

    return {
      accessToken,
      refreshToken,
      expiresAt
    };
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 3600; // Default to 1 hour
    }
  }

  public async isTokenBlacklisted(token: string): Promise<boolean> {
    return false; // Redis check disabled
  }

  public async getUserById(userId: string): Promise<any | null> {
    const user = await this.db.users()
      .where('id', userId)
      .where('is_active', true)
      .first();

    if (user) {
      delete user.password_hash;
    }

    return user;
  }

  public async getUserByGitlabId(gitlabId: string): Promise<any | null> {
    const result = await this.db.getConnection().raw(`
      SELECT u.* FROM users u
      JOIN oauth_connections oc ON u.id = oc.user_id
      WHERE oc.provider = 'gitlab' 
      AND oc.provider_user_id = ?
      AND u.is_active = true
      LIMIT 1
    `, [gitlabId]);

    const user = result.rows[0] || null;
    
    if (user) {
      delete user.password_hash;
    }

    return user;
  }

  public async createFromOAuth(data: {
    provider: 'gitlab';
    providerId: string;
    email: string;
    username: string;
    fullName: string;
    avatarUrl?: string;
    tokens: any;
  }): Promise<{ user: any; tokens: TokenPair }> {
    // Check if user already exists by email
    const existingUser = await this.db.users()
      .where('email', data.email)
      .first();

    if (existingUser) {
      // Update existing user with GitLab info
      const [user] = await this.db.users()
        .where('id', existingUser.id)
        .update({
          avatar_url: data.avatarUrl,
          updated_at: new Date()
        })
        .returning('*');

      // Store OAuth connection
      await this.updateOAuthTokens(user.id, data.provider, data.tokens, data.providerId);

      const tokens = await this.generateTokenPair(user.id);
      delete user.password_hash;

      return { user, tokens };
    }

    // Create new user
    const [user] = await this.db.users().insert({
      email: data.email,
      username: data.username,
      full_name: data.fullName,
      avatar_url: data.avatarUrl,
      is_active: true,
      role: 'user'
    }).returning('*');

    // Store OAuth connection
    await this.updateOAuthTokens(user.id, data.provider, data.tokens, data.providerId);

    const tokens = await this.generateTokenPair(user.id);
    delete user.password_hash;

    logger.info(`User created from OAuth: ${user.email}`);

    return { user, tokens };
  }

  public async updateOAuthTokens(
    userId: string,
    provider: string,
    tokens: any,
    providerId?: string
  ): Promise<void> {
    // Store OAuth connection in oauth_connections table
    const connectionData = {
      user_id: userId,
      provider,
      provider_user_id: providerId || tokens.providerId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
      scopes: tokens.scope ? tokens.scope.split(' ') : ['read_user'],
      provider_data: tokens,
      updated_at: new Date()
    };

    // Debug log to see what we're trying to insert
    console.log('🔐 Inserting OAuth connection:', {
      user_id: connectionData.user_id,
      provider: connectionData.provider,
      provider_user_id: connectionData.provider_user_id,
      has_access_token: !!connectionData.access_token,
      has_refresh_token: !!connectionData.refresh_token,
      token_expires_at: connectionData.token_expires_at,
      scopes: connectionData.scopes
    });

    // Validate required fields
    if (!connectionData.provider_user_id) {
      throw new Error(`provider_user_id is required. providerId: ${providerId}, tokens.providerId: ${tokens.providerId}`);
    }

    // Use upsert (insert or update if exists)
    await this.db.getConnection().raw(`
      INSERT INTO oauth_connections (user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, scopes, provider_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON CONFLICT (user_id, provider)
      DO UPDATE SET
        provider_user_id = EXCLUDED.provider_user_id,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        provider_data = EXCLUDED.provider_data,
        updated_at = NOW()
    `, [
      connectionData.user_id,
      connectionData.provider,
      connectionData.provider_user_id,
      connectionData.access_token,
      connectionData.refresh_token,
      connectionData.token_expires_at,
      connectionData.scopes, // PostgreSQL array, not JSON string
      JSON.stringify(connectionData.provider_data)
    ]);

    logger.info(`OAuth tokens updated for user: ${userId}, provider: ${provider}`);
  }

  public async storeOAuthState(state: string, data: any): Promise<void> {
    // Store in Redis with 10 minute expiry
    await this.redis.set(`oauth_state:${state}`, data, 600);
  }

  public async getOAuthState(state: string): Promise<any> {
    const data = await this.redis.get(`oauth_state:${state}`);
    if (data) {
      // Remove state after use
      await this.redis.del(`oauth_state:${state}`);
    }
    return data;
  }

  public async disconnectOAuth(
    userId: string,
    provider: 'gitlab'
  ): Promise<void> {
    const user = await this.db.users().where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    const preferences = user.preferences || {};
    delete preferences[`${provider}_tokens`];

    const updateData: any = {
      preferences,
      updated_at: new Date()
    };

    // Also clear provider-specific fields
    if (provider === 'gitlab') {
      updateData.gitlab_id = null;
    }

    await this.db.users()
      .where('id', userId)
      .update(updateData);

    logger.info(`OAuth disconnected for user: ${userId}, provider: ${provider}`);
  }

  public async getOAuthConnections(userId: string): Promise<any> {
    const user = await this.db.users().where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    const preferences = user.preferences || {};
    
    return {
      gitlab: {
        connected: !!user.gitlab_id,
        hasTokens: !!preferences.gitlab_tokens
      }
    };
  }

  public async storeOAuthSession(sessionId: string, data: any): Promise<void> {
    if (!this.redis.isAvailable()) {
      logger.warn('Redis not available for OAuth session storage');
      throw new Error('Redis not available');
    }
    
    try {
      const key = `oauth_session:${sessionId}`;
      await this.redis.set(key, data, 300); // 5 minutes expiration
      logger.debug(`OAuth session stored: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to store OAuth session in Redis:', error);
      throw error;
    }
  }

  public async getOAuthSession(sessionId: string): Promise<any> {
    if (!this.redis.isAvailable()) {
      logger.warn('Redis not available for OAuth session retrieval');
      throw new Error('Redis not available');
    }
    
    try {
      const key = `oauth_session:${sessionId}`;
      const data = await this.redis.get(key);
      logger.debug(`OAuth session retrieved: ${sessionId}, found: ${!!data}`);
      return data;
    } catch (error) {
      logger.error('Failed to get OAuth session from Redis:', error);
      throw error;
    }
  }

  public async deleteOAuthSession(sessionId: string): Promise<void> {
    if (!this.redis.isAvailable()) {
      logger.warn('Redis not available for OAuth session deletion');
      throw new Error('Redis not available');
    }
    
    try {
      const key = `oauth_session:${sessionId}`;
      await this.redis.del(key);
      logger.debug(`OAuth session deleted: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to delete OAuth session from Redis:', error);
      throw error;
    }
  }
}