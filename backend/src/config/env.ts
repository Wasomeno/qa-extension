import * as crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Environment configuration with secure defaults and validation
 */
export class EnvConfig {
  // Server Configuration
  static readonly PORT = parseInt(process.env.PORT || '3000');
  static readonly NODE_ENV = process.env.NODE_ENV || 'development';
  static readonly CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

  // Database Configuration
  static readonly DB_HOST = process.env.DB_HOST || 'localhost';
  static readonly DB_PORT = parseInt(process.env.DB_PORT || '5432');
  static readonly DB_NAME = process.env.DB_NAME || 'qa_command_center';
  static readonly DB_USER = process.env.DB_USER || 'qa_user';
  static readonly DB_PASSWORD = process.env.DB_PASSWORD || 'qa_password';

  // Redis Configuration
  static readonly REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  // JWT Configuration
  static get JWT_SECRET() {
    return this.getJwtSecret();
  }
  static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
  static readonly JWT_REFRESH_EXPIRES_IN =
    process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  // OpenAI Configuration
  static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  // Choose a widely available default unless overridden
  static readonly OPENAI_MODEL =
    process.env.OPENAI_MODEL || 'gpt-4.1-mini-2025-04-14';

  // GitLab Configuration
  static readonly GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID;
  static readonly GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET;
  static readonly GITLAB_REDIRECT_URI = process.env.GITLAB_REDIRECT_URI;

  // Slack Configuration
  static readonly SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
  static readonly SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
  static readonly SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

  // Rate Limiting
  static readonly RATE_LIMIT_MAX = parseInt(
    process.env.RATE_LIMIT_MAX || '100'
  );
  static readonly RATE_LIMIT_WINDOW = parseInt(
    process.env.RATE_LIMIT_WINDOW || '900000'
  ); // 15 minutes

  // File Upload
  static readonly MAX_FILE_SIZE = parseInt(
    process.env.MAX_FILE_SIZE || '10485760'
  ); // 10MB
  static readonly UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads';

  // Supabase Storage (optional)
  static readonly SUPABASE_URL = process.env.SUPABASE_URL || '';
  static readonly SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  static readonly SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'attachments';

  // Image processing
  // png | webp | off
  static readonly IMAGE_TRANSCODE = (process.env.IMAGE_TRANSCODE || 'png').toLowerCase();

  /**
   * Generate or retrieve JWT secret with secure fallback
   */
  private static getJwtSecret(): string {
    const envSecret = process.env.JWT_SECRET;

    if (envSecret) {
      return envSecret;
    }

    // In development, generate a random secret and warn
    if (this.NODE_ENV === 'development') {
      const generatedSecret = crypto.randomBytes(64).toString('hex');
      logger.warn(
        '⚠️  JWT_SECRET not set. Using generated secret for development only.'
      );
      logger.warn(
        '⚠️  This is NOT secure for production. Set JWT_SECRET environment variable.'
      );
      return generatedSecret;
    }

    // In production, this is a critical error
    logger.error(
      '❌ JWT_SECRET environment variable is required in production'
    );
    throw new Error(
      'JWT_SECRET environment variable is required in production'
    );
  }

  /**
   * Validate configuration and log warnings for missing optional services
   */
  static validate(): void {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Critical validations (production only)
    if (this.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET) {
        errors.push('JWT_SECRET is required in production');
      }
      if (
        !process.env.DB_PASSWORD ||
        process.env.DB_PASSWORD === 'qa_password'
      ) {
        errors.push(
          'DB_PASSWORD should be set to a secure value in production'
        );
      }
    }

    // Optional service warnings
    if (!this.OPENAI_API_KEY) {
      warnings.push('OPENAI_API_KEY not set - AI features will be disabled');
    }

    if (!this.GITLAB_CLIENT_ID || !this.GITLAB_CLIENT_SECRET) {
      warnings.push(
        'GitLab OAuth not configured - GitLab integration will be disabled'
      );
    }

    if (!this.SLACK_CLIENT_ID || !this.SLACK_CLIENT_SECRET) {
      warnings.push(
        'Slack OAuth not configured - Slack integration will be disabled'
      );
    }

    // Log warnings
    if (warnings.length > 0) {
      logger.warn('Configuration warnings:');
      warnings.forEach(warning => logger.warn(`  - ${warning}`));
    }

    // Throw errors if any critical config is missing
    if (errors.length > 0) {
      logger.error('Configuration errors:');
      errors.forEach(error => logger.error(`  - ${error}`));
      throw new Error(
        'Critical configuration missing. Check environment variables.'
      );
    }

    // Log successful configuration
    logger.info('Configuration loaded successfully');
    logger.info(`Environment: ${this.NODE_ENV}`);
    logger.info(`Server will run on port: ${this.PORT}`);
    logger.info(`Database: ${this.DB_HOST}:${this.DB_PORT}/${this.DB_NAME}`);
    logger.info(`Redis: ${this.REDIS_URL}`);
    logger.info(`AI Features: ${this.OPENAI_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(
      `GitLab Integration: ${this.GITLAB_CLIENT_ID ? 'Enabled' : 'Disabled'}`
    );
    logger.info(
      `Slack Integration: ${this.SLACK_CLIENT_ID ? 'Enabled' : 'Disabled'}`
    );
  }

  /**
   * Check if a service is available
   */
  static isServiceAvailable(service: 'openai' | 'gitlab' | 'slack'): boolean {
    switch (service) {
      case 'openai':
        return !!this.OPENAI_API_KEY;
      case 'gitlab':
        return !!(this.GITLAB_CLIENT_ID && this.GITLAB_CLIENT_SECRET);
      case 'slack':
        return !!(this.SLACK_CLIENT_ID && this.SLACK_CLIENT_SECRET);
      default:
        return false;
    }
  }

  /**
   * Get service configuration for a specific service
   */
  static getServiceConfig(service: 'openai' | 'gitlab' | 'slack'): any {
    switch (service) {
      case 'openai':
        return {
          apiKey: this.OPENAI_API_KEY,
          model: this.OPENAI_MODEL,
        };
      case 'gitlab':
        return {
          clientId: this.GITLAB_CLIENT_ID,
          clientSecret: this.GITLAB_CLIENT_SECRET,
          redirectUri: this.GITLAB_REDIRECT_URI,
        };
      case 'slack':
        return {
          clientId: this.SLACK_CLIENT_ID,
          clientSecret: this.SLACK_CLIENT_SECRET,
          signingSecret: this.SLACK_SIGNING_SECRET,
        };
      default:
        return {};
    }
  }
}

// Configuration will be validated when the server starts
