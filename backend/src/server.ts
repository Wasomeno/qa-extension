// Ensure env is loaded BEFORE anything else
import './load-env';

import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { projectRouter } from './routes/projects';
import { issueRouter } from './routes/issues';
import { filesRouter } from './routes/files';
import { slackRouter } from './routes/slack';
import { healthRouter } from './routes/health';
import { scenariosRouter } from './routes/scenarios';
import { mergeRequestRouter } from './routes/merge-requests';
import { userRouter } from './routes/users';
import { databaseService } from './services/database';
import { redisService } from './services/redis';
import { WebSocketService } from './services/websocket';
import { logger } from './utils/logger';
import { EnvConfig } from './config/env';

// Validate configuration after dotenv is loaded
EnvConfig.validate();

class App {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;
  private databaseService = databaseService;
  private redisService = redisService;
  private webSocketService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: EnvConfig.CORS_ORIGIN?.split(',') || '*',
        methods: ['GET', 'POST'],
      },
    });

    this.webSocketService = new WebSocketService(this.io);

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: (origin, callback) => {
          const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];

          // Allow requests with no origin (like curl) or when not in production
          if (!origin || EnvConfig.NODE_ENV !== 'production') {
            return callback(null, true);
          }

          // Check if origin matches any allowed origins
          const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin === '*') return true;
            if (allowedOrigin === 'chrome-extension://*') {
              return origin.startsWith('chrome-extension://');
            }
            if (allowedOrigin.includes('*')) {
              // Handle wildcard domains like *.example.com
              const pattern = allowedOrigin.replace(/\*/g, '.*');
              const regex = new RegExp(`^${pattern}$`);
              return regex.test(origin);
            }
            return origin === allowedOrigin;
          });

          if (isAllowed) {
            callback(null, true);
          } else {
            logger.warn(`CORS: Origin ${origin} not allowed`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      })
    );

    // Logging
    this.app.use(
      morgan('combined', {
        stream: { write: message => logger.info(message.trim()) },
      })
    );

    // Note: Application-level rate limiting removed. GitLab API limits apply upstream.

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy for accurate client IP
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check route
    this.app.use('/health', healthRouter);

    // API routes
    this.app.use('/api/auth', authRouter);
    this.app.use('/api/projects', projectRouter);
    this.app.use('/api/issues', issueRouter);
    this.app.use('/api/integrations/slack', slackRouter);
    this.app.use('/api/scenarios', scenariosRouter);
    this.app.use('/api/files', filesRouter);
    this.app.use('/api/merge-requests', mergeRequestRouter);
    this.app.use('/api/users', userRouter);

    // Static serving for uploaded assets (dev-friendly; secure appropriately in prod)
    this.app.use(
      '/uploads',
      express.static(path.resolve(EnvConfig.UPLOAD_PATH))
    );

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection
      await this.databaseService.connect();
      logger.info('Database connected successfully');

      // Initialize Redis connection
      await this.redisService.connect();
      logger.info('Redis connected successfully');

      // Initialize WebSocket service
      this.webSocketService.initialize();
      logger.info('WebSocket service initialized');

      const PORT = EnvConfig.PORT;
      this.server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Environment: ${EnvConfig.NODE_ENV}`);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          await this.databaseService.disconnect();
          logger.info('Database connection closed');

          // Close Redis connection
          await this.redisService.disconnect();
          logger.info('Redis connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Forceful shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start the application
const app = new App();
app.start().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export { App };
