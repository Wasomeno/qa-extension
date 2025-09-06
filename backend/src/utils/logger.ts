import winston from 'winston';
import path from 'path';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(
          meta,
          (key, value) => {
            if (value instanceof Error) {
              return {
                name: value.name,
                message: value.message,
                stack: value.stack,
              };
            }
            if (
              value &&
              typeof value === 'object' &&
              value.constructor &&
              value.constructor !== Object
            ) {
              if (
                value.constructor.name === 'ClientRequest' ||
                value.constructor.name === 'IncomingMessage'
              ) {
                return '[Circular HTTP Object]';
              }
            }
            return value;
          },
          2
        )}`
      : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logs directory
const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), 'logs');

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    level:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    format: consoleFormat,
  }),
];

// Add file transports in production or when explicitly enabled
if (
  process.env.NODE_ENV === 'production' ||
  process.env.ENABLE_FILE_LOGGING === 'true'
) {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );

  // HTTP requests log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  levels: logLevels,
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  transports,
  exitOnError: false,
});

// Add request logging helper
logger.logRequest = (req: any, res: any, responseTime: number) => {
  const { method, url, ip, headers } = req;
  const { statusCode } = res;
  const userAgent = headers['user-agent'] || 'Unknown';
  const userId = req.user?.id || 'Anonymous';

  logger.http('HTTP Request', {
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    ip,
    userAgent,
    userId,
    timestamp: new Date().toISOString(),
  });
};

// Add structured logging methods
logger.logError = (message: string, error: Error, context?: any) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context: context || {},
    timestamp: new Date().toISOString(),
  });
};

logger.logUserAction = (action: string, userId: string, details?: any) => {
  logger.info(`User Action: ${action}`, {
    action,
    userId,
    details: details || {},
    timestamp: new Date().toISOString(),
  });
};

logger.logSystemEvent = (event: string, data?: any) => {
  logger.info(`System Event: ${event}`, {
    event,
    data: data || {},
    timestamp: new Date().toISOString(),
  });
};

logger.logPerformance = (
  operation: string,
  duration: number,
  metadata?: any
) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
  });
};

logger.logSecurity = (event: string, details: any) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    details,
    severity: 'security',
    timestamp: new Date().toISOString(),
  });
};

// Add audit logging for sensitive operations
logger.logAudit = (
  action: string,
  userId: string,
  resource: string,
  details?: any
) => {
  logger.info(`Audit: ${action}`, {
    action,
    userId,
    resource,
    details: details || {},
    level: 'audit',
    timestamp: new Date().toISOString(),
  });
};

// Database query logging (for development)
logger.logQuery = (query: string, params?: any[], duration?: number) => {
  if (process.env.LOG_QUERIES === 'true') {
    logger.debug('Database Query', {
      query: query.replace(/\s+/g, ' ').trim(),
      params: params || [],
      duration: duration ? `${duration}ms` : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};

// API integration logging
logger.logApiCall = (
  service: string,
  method: string,
  url: string,
  statusCode?: number,
  duration?: number
) => {
  logger.info(`API Call: ${service}`, {
    service,
    method,
    url,
    statusCode,
    duration: duration ? `${duration}ms` : undefined,
    timestamp: new Date().toISOString(),
  });
};

// Business logic logging
logger.logBusinessEvent = (event: string, data: any) => {
  logger.info(`Business Event: ${event}`, {
    event,
    data,
    timestamp: new Date().toISOString(),
  });
};

// Validation logging
logger.logValidationError = (
  field: string,
  value: any,
  error: string,
  context?: any
) => {
  logger.warn('Validation Error', {
    field,
    value,
    error,
    context: context || {},
    timestamp: new Date().toISOString(),
  });
};

// Rate limiting logging
logger.logRateLimit = (ip: string, endpoint: string, limit: number) => {
  logger.warn('Rate Limit Exceeded', {
    ip,
    endpoint,
    limit,
    timestamp: new Date().toISOString(),
  });
};

// Configuration logging
logger.logConfig = (component: string, config: any) => {
  if (process.env.LOG_CONFIG === 'true') {
    logger.debug(`Configuration: ${component}`, {
      component,
      config,
      timestamp: new Date().toISOString(),
    });
  }
};

// Webhook logging
logger.logWebhook = (source: string, event: string, data?: any) => {
  logger.info(`Webhook: ${source}`, {
    source,
    event,
    data: data || {},
    timestamp: new Date().toISOString(),
  });
};

// File operation logging
logger.logFileOperation = (
  operation: string,
  file: string,
  success: boolean,
  error?: Error
) => {
  const level = success ? 'info' : 'error';
  logger.log(level, `File Operation: ${operation}`, {
    operation,
    file,
    success,
    error: error
      ? {
          name: error.name,
          message: error.message,
        }
      : undefined,
    timestamp: new Date().toISOString(),
  });
};

// Cache operation logging
logger.logCacheOperation = (
  operation: string,
  key: string,
  hit: boolean,
  ttl?: number
) => {
  logger.debug(`Cache: ${operation}`, {
    operation,
    key,
    hit,
    ttl,
    timestamp: new Date().toISOString(),
  });
};

// Add method to create child loggers with default metadata
logger.child = (defaultMeta: any) => {
  return winston.createLogger({
    levels: logLevels,
    level: logger.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta,
    transports: logger.transports,
  });
};

// Graceful shutdown logging
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    timestamp: new Date().toISOString(),
  });

  // Give some time for logs to be written
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason:
      reason instanceof Error
        ? {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          }
        : reason,
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });
});

export { logger };

// Type declarations for custom methods
declare module 'winston' {
  interface Logger {
    logRequest: (req: any, res: any, responseTime: number) => void;
    logError: (message: string, error: Error, context?: any) => void;
    logUserAction: (action: string, userId: string, details?: any) => void;
    logSystemEvent: (event: string, data?: any) => void;
    logPerformance: (
      operation: string,
      duration: number,
      metadata?: any
    ) => void;
    logSecurity: (event: string, details: any) => void;
    logAudit: (
      action: string,
      userId: string,
      resource: string,
      details?: any
    ) => void;
    logQuery: (query: string, params?: any[], duration?: number) => void;
    logApiCall: (
      service: string,
      method: string,
      url: string,
      statusCode?: number,
      duration?: number
    ) => void;
    logBusinessEvent: (event: string, data: any) => void;
    logValidationError: (
      field: string,
      value: any,
      error: string,
      context?: any
    ) => void;
    logRateLimit: (ip: string, endpoint: string, limit: number) => void;
    logConfig: (component: string, config: any) => void;
    logWebhook: (source: string, event: string, data?: any) => void;
    logFileOperation: (
      operation: string,
      file: string,
      success: boolean,
      error?: Error
    ) => void;
    logCacheOperation: (
      operation: string,
      key: string,
      hit: boolean,
      ttl?: number
    ) => void;
  }
}
