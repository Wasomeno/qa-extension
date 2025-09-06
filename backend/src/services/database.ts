import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export class DatabaseService {
  private db: Knex | null = null;
  private config: Knex.Config;

  constructor() {
    const connection: any = process.env.DATABASE_URL
      ? process.env.DATABASE_URL
      : {
          host: EnvConfig.DB_HOST,
          port: EnvConfig.DB_PORT,
          database: EnvConfig.DB_NAME,
          user: EnvConfig.DB_USER,
          password: EnvConfig.DB_PASSWORD,
          ssl: EnvConfig.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        };

    this.config = {
      client: 'postgresql',
      connection,
      migrations: {
        directory: '../database/migrations',
        tableName: 'knex_migrations'
      },
      seeds: {
        directory: '../database/seeds'
      },
      pool: {
        min: 2,
        max: EnvConfig.NODE_ENV === 'production' ? 20 : 10,
        createTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
        propagateCreateError: false
      },
      debug: EnvConfig.NODE_ENV === 'development'
    };
  }

  public async connect(): Promise<void> {
    try {
      this.db = knex(this.config);
      logger.info('Attempting database connection', {
        usingDatabaseUrl: !!process.env.DATABASE_URL,
        host: process.env.DATABASE_URL ? undefined : EnvConfig.DB_HOST,
        port: process.env.DATABASE_URL ? undefined : EnvConfig.DB_PORT,
        database: process.env.DATABASE_URL ? undefined : EnvConfig.DB_NAME,
      });
      
      // Test the connection with a timeout
      await Promise.race([
        this.db.raw('SELECT 1+1 as result'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
      
      // Run migrations in production
      if (EnvConfig.NODE_ENV === 'production') {
        await this.runMigrations();
      }
      
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      
      // In development, allow the app to continue without database
      if (EnvConfig.NODE_ENV === 'development') {
        logger.warn('⚠️  Database not available - continuing in development mode');
        logger.warn('⚠️  Database-dependent features will be disabled');
        logger.warn('⚠️  To fix: Start PostgreSQL or check connection settings');
        this.db = null;
        return;
      }
      
      // In production, database is required
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  public getConnection(): Knex {
    if (!this.db) {
      throw new Error('Database not available. Please start PostgreSQL and restart the server.');
    }
    return this.db;
  }

  public isConnected(): boolean {
    return this.db !== null;
  }

  public async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      const migrations = await this.db.migrate.latest();
      if (migrations[1].length > 0) {
        logger.info(`Ran migrations: ${migrations[1].join(', ')}`);
      } else {
        logger.info('No new migrations to run');
      }
    } catch (error) {
      logger.error('Failed to run migrations:', error);
      throw error;
    }
  }

  public async rollbackMigration(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.db.migrate.rollback();
      logger.info(`Rolled back migration: ${result[1].join(', ')}`);
    } catch (error) {
      logger.error('Failed to rollback migration:', error);
      throw error;
    }
  }

  public async runSeeds(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      await this.db.seed.run();
      logger.info('Database seeds completed');
    } catch (error) {
      logger.error('Failed to run seeds:', error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.db) {
        // Attempt to (re)connect lazily during health check in development
        if (EnvConfig.NODE_ENV === 'development') {
          try {
            await this.connect();
          } catch (e) {
            logger.warn('Database reconnect attempt failed during health check');
            return false;
          }
        } else {
          return false;
        }
      }
      await this.getConnection().raw('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  // Transaction helper methods
  public async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return this.db.transaction(callback);
  }

  // Common query builders
  public users() {
    return this.getConnection()('users');
  }

  public teams() {
    return this.getConnection()('teams');
  }

  public projects() {
    return this.getConnection()('projects');
  }

  public teamMembers() {
    return this.getConnection()('team_members');
  }

  public issues() {
    return this.getConnection()('issues');
  }

  public recordings() {
    return this.getConnection()('recordings');
  }

  public issueComments() {
    return this.getConnection()('issue_comments');
  }

  // Raw query helper
  public raw(sql: string, bindings?: any[]) {
    return this.getConnection().raw(sql, bindings || []);
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
