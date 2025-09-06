import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: string | undefined;
  details?: any;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public code?: string | undefined;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
export class ValidationError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends CustomError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

export class RateLimitError extends CustomError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ExternalServiceError extends CustomError {
  constructor(service: string, message?: string) {
    super(message || `External service error: ${service}`, 502, 'EXTERNAL_SERVICE_ERROR', { service });
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

// Error handling middleware
export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set default error properties if not set
  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';

  // Log the error
  logError(error, req);

  // Send error response based on environment
  if (process.env.NODE_ENV === 'production') {
    sendProductionError(error, res);
  } else {
    sendDevelopmentError(error, res);
  }
};

// Development error response (includes stack trace)
const sendDevelopmentError = (error: AppError, res: Response): void => {
  const errorResponse = {
    success: false,
    status: error.status,
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      details: error.details
    },
    timestamp: new Date().toISOString()
  };

  res.status(error.statusCode || 500).json(errorResponse);
};

// Production error response (sanitized)
const sendProductionError = (error: AppError, res: Response): void => {
  // Operational errors: send detailed message to client
  if (error.isOperational) {
    const errorResponse = {
      success: false,
      status: error.status,
      message: error.message,
      code: error.code,
      ...(error.details && { details: error.details }),
      timestamp: new Date().toISOString()
    };

    res.status(error.statusCode || 500).json(errorResponse);
  } else {
    // Programming errors: don't leak error details
    const errorResponse = {
      success: false,
      status: 'error',
      message: 'Something went wrong',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
};

// Log error with context
const logError = (error: AppError, req: Request): void => {
  const errorContext = {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id,
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query,
    params: req.params,
    statusCode: error.statusCode,
    isOperational: error.isOperational,
    code: error.code,
    details: error.details
  };

  // Log based on error severity
  if (error.statusCode && error.statusCode >= 500) {
    logger.error('Server Error', { error: error.message, stack: error.stack, ...errorContext });
  } else if (error.statusCode === 401 || error.statusCode === 403) {
    logger.warn('Authentication/Authorization Error', {
      message: error.message,
      ...errorContext
    });
  } else if (error.statusCode === 429) {
    logger.warn('Rate Limit Exceeded', { ip: req.ip, path: req.path });
  } else {
    logger.warn('Client Error', {
      message: error.message,
      ...errorContext
    });
  }
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Handle specific error types
export const handleCastError = (error: any): CustomError => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new ValidationError(message);
};

export const handleDuplicateFieldsError = (error: any): CustomError => {
  const keyValue = error.keyValue || {};
  const field = Object.keys(keyValue)[0] || 'unknown';
  const value = keyValue[field];
  const message = `Duplicate field value: ${field} = ${value}`;
  return new ConflictError(message);
};

export const handleValidationError = (error: any): CustomError => {
  const errors = Object.values(error.errors).map((err: any) => err.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new ValidationError(message, { validationErrors: errors });
};

export const handleJWTError = (): CustomError => {
  return new AuthenticationError('Invalid token. Please log in again');
};

export const handleJWTExpiredError = (): CustomError => {
  return new AuthenticationError('Your token has expired. Please log in again');
};

// Database constraint error handler
export const handleDatabaseConstraintError = (error: any): CustomError => {
  let message = 'Database constraint violation';
  
  if (error.constraint) {
    switch (error.constraint) {
      case 'users_email_unique':
        message = 'Email address already exists';
        break;
      case 'users_username_unique':
        message = 'Username already exists';
        break;
      default:
        message = `Constraint violation: ${error.constraint}`;
    }
  }

  return new ConflictError(message, { constraint: error.constraint });
};

// Handle different database errors
export const handleDatabaseError = (error: any): CustomError => {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // Unique violation
      return handleDatabaseConstraintError(error);
    case '23503': // Foreign key violation
      return new ValidationError('Referenced resource does not exist');
    case '23502': // Not null violation
      return new ValidationError('Required field is missing');
    case '23514': // Check violation
      return new ValidationError('Invalid field value');
    case '42P01': // Undefined table
      return new DatabaseError('Database table not found');
    case '42701': // Duplicate column
      return new DatabaseError('Database schema error');
    default:
      return new DatabaseError('Database operation failed', { code: error.code });
  }
};

// Handle file upload errors
export const handleMulterError = (error: any): CustomError => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ValidationError('File too large');
    case 'LIMIT_FILE_COUNT':
      return new ValidationError('Too many files');
    case 'LIMIT_FIELD_KEY':
      return new ValidationError('Field name too long');
    case 'LIMIT_FIELD_VALUE':
      return new ValidationError('Field value too long');
    case 'LIMIT_FIELD_COUNT':
      return new ValidationError('Too many fields');
    case 'LIMIT_UNEXPECTED_FILE':
      return new ValidationError('Unexpected file field');
    case 'MISSING_FIELD_NAME':
      return new ValidationError('Missing field name');
    default:
      return new ValidationError('File upload error');
  }
};

// Global unhandled rejection handler
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString()
  });
  
  // Close server gracefully
  process.exit(1);
});

// Global uncaught exception handler
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  
  // Close server gracefully
  process.exit(1);
});

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// Validation middleware
export const validateRequest = (schema: any, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req[property], { abortEarly: false });
    
    if (error) {
      const validationError = new ValidationError(
        'Validation failed',
        {
          details: error.details.map((detail: any) => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }))
        }
      );
      
      return next(validationError);
    }
    
    next();
  };
};

// Error response formatter
export const formatErrorResponse = (error: AppError) => {
  return {
    success: false,
    status: error.status || 'error',
    message: error.message,
    code: error.code,
    ...(error.details && { details: error.details }),
    timestamp: new Date().toISOString()
  };
};

// Success response formatter
export const formatSuccessResponse = (data: any, message?: string, meta?: any) => {
  return {
    success: true,
    message: message || 'Operation successful',
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString()
  };
};

// Helper function to create standardized API responses
export const sendResponse = (
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: any,
  meta?: any
): void => {
  const response = {
    success,
    message,
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(response);
};

// Helper function to send error response
export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  details?: any
): void => {
  const response = {
    success: false,
    message,
    ...(code && { code }),
    ...(details && { details }),
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(response);
};

// Middleware to handle CORS preflight errors
export const corsErrorHandler = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, X-API-Key');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
  } else {
    next();
  }
};