import { Router, Request, Response } from 'express';
import { DatabaseService, databaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { logger } from '../utils/logger';
import { sendResponse, sendError } from '../middleware/errorHandler';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    openai?: ServiceHealth;
    gitlab?: ServiceHealth;
    slack?: ServiceHealth;
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

// Basic health check endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: await checkDatabaseHealth(),
        redis: await checkRedisHealth()
      },
      system: getSystemHealth()
    };

    // Check optional services
    if (process.env.OPENAI_API_KEY) {
      healthCheck.services.openai = await checkOpenAIHealth();
    }

    if (process.env.GITLAB_URL && process.env.GITLAB_TOKEN) {
      healthCheck.services.gitlab = await checkGitLabHealth();
    }

    if (process.env.SLACK_BOT_TOKEN) {
      healthCheck.services.slack = await checkSlackHealth();
    }

    // Determine overall health status
    const serviceStatuses = Object.values(healthCheck.services).map(service => service.status);
    
    if (serviceStatuses.some(status => status === 'unhealthy')) {
      healthCheck.status = 'unhealthy';
    } else if (serviceStatuses.some(status => status === 'degraded')) {
      healthCheck.status = 'degraded';
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    sendResponse(res, statusCode, true, 'Health check completed', healthCheck);
  } catch (error) {
    logger.error('Health check failed:', error);
    sendError(res, 500, 'Health check failed', 'HEALTH_CHECK_ERROR');
  }
});

// Detailed health check endpoint
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    const healthCheck: HealthCheck & {
      checks: {
        [key: string]: {
          status: 'pass' | 'fail' | 'warn';
          output?: string;
          responseTime: number;
          timestamp: string;
        };
      };
    } = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: await checkDatabaseHealth(),
        redis: await checkRedisHealth()
      },
      system: getSystemHealth(),
      checks: {}
    };

    // Perform detailed checks
    healthCheck.checks.database = await performDatabaseCheck();
    healthCheck.checks.redis = await performRedisCheck();
    healthCheck.checks.memory = performMemoryCheck();
    healthCheck.checks.disk = await performDiskCheck();

    // Check optional services
    if (process.env.OPENAI_API_KEY) {
      healthCheck.services.openai = await checkOpenAIHealth();
      healthCheck.checks.openai = await performOpenAICheck();
    }

    if (process.env.GITLAB_URL && process.env.GITLAB_TOKEN) {
      healthCheck.services.gitlab = await checkGitLabHealth();
      healthCheck.checks.gitlab = await performGitLabCheck();
    }

    if (process.env.SLACK_BOT_TOKEN) {
      healthCheck.services.slack = await checkSlackHealth();
      healthCheck.checks.slack = await performSlackCheck();
    }

    // Determine overall health
    const failedChecks = Object.values(healthCheck.checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(healthCheck.checks).filter(check => check.status === 'warn');

    if (failedChecks.length > 0) {
      healthCheck.status = 'unhealthy';
    } else if (warnChecks.length > 0) {
      healthCheck.status = 'degraded';
    }

    const totalResponseTime = Date.now() - startTime;
    logger.logPerformance('Health check', totalResponseTime);

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    sendResponse(res, statusCode, true, 'Detailed health check completed', healthCheck);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    sendError(res, 500, 'Detailed health check failed', 'HEALTH_CHECK_ERROR');
  }
});

// Ready endpoint (for Kubernetes readiness probe)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const database = await checkDatabaseHealth();
    const redis = await checkRedisHealth();

    if (database.status === 'unhealthy' || redis.status === 'unhealthy') {
      sendError(res, 503, 'Service not ready', 'NOT_READY');
      return;
    }

    sendResponse(res, 200, true, 'Service is ready');
  } catch (error) {
    logger.error('Readiness check failed:', error);
    sendError(res, 503, 'Service not ready', 'NOT_READY');
  }
});

// Live endpoint (for Kubernetes liveness probe)
router.get('/live', (req: Request, res: Response) => {
  sendResponse(res, 200, true, 'Service is alive');
});

// Database health check
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Prefer the singleton which may already be connected
    const db = databaseService;
    const ok = await db.healthCheck();
    if (!ok) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: 'Database not available. Please start PostgreSQL and restart the server.',
        lastChecked: new Date().toISOString()
      };
    }
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

// Redis health check
async function checkRedisHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const redis = new RedisService();
    await redis.ping();
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

// OpenAI health check
async function checkOpenAIHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Simple API call to check OpenAI connectivity
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    } else {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: `HTTP ${response.status}`,
        lastChecked: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

// GitLab health check
async function checkGitLabHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${process.env.GITLAB_URL}/api/v4/version`, {
      headers: {
        'PRIVATE-TOKEN': process.env.GITLAB_TOKEN!
      }
    });

    if (response.ok) {
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    } else {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: `HTTP ${response.status}`,
        lastChecked: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

// Slack health check
async function checkSlackHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json() as { ok?: boolean; error?: string };

    if (data.ok) {
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    } else {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: data.error,
        lastChecked: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

// System health metrics
function getSystemHealth() {
  const memUsage = process.memoryUsage();
  
  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    },
    cpu: {
      usage: process.cpuUsage().user / 1000000 // Convert to seconds
    }
  };
}

// Detailed check functions
async function performDatabaseCheck() {
  const startTime = Date.now();
  
  try {
    const db = new DatabaseService();
    
    // Check database connection
    await db.raw('SELECT 1');
    
    // Check if main tables exist
    const tables = ['users', 'teams', 'projects', 'issues'];
    for (const table of tables) {
      await db.raw(`SELECT 1 FROM ${table} LIMIT 1`);
    }
    
    return {
      status: 'pass' as const,
      output: 'Database connection and tables OK',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown database error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

async function performRedisCheck() {
  const startTime = Date.now();
  
  try {
    const redis = new RedisService();
    
    // Test basic operations
    const testKey = `health_check_${Date.now()}`;
    await redis.set(testKey, 'test', 5);
    const value = await redis.get(testKey);
    await redis.del(testKey);
    
    if (value !== 'test') {
      throw new Error('Redis value mismatch');
    }
    
    return {
      status: 'pass' as const,
      output: 'Redis connection and operations OK',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown Redis error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

function performMemoryCheck() {
  const memUsage = process.memoryUsage();
  const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  let output = `Memory usage: ${memoryPercentage.toFixed(2)}%`;
  
  if (memoryPercentage > 90) {
    status = 'fail';
    output += ' - Critical memory usage';
  } else if (memoryPercentage > 80) {
    status = 'warn';
    output += ' - High memory usage';
  }
  
  return {
    status,
    output,
    responseTime: 0,
    timestamp: new Date().toISOString()
  };
}

async function performDiskCheck() {
  const startTime = Date.now();
  
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Check if logs directory is writable
    const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), 'logs');
    const testFile = path.join(logsDir, `health_check_${Date.now()}.txt`);
    
    await fs.writeFile(testFile, 'health check test');
    await fs.unlink(testFile);
    
    return {
      status: 'pass' as const,
      output: 'Disk write/read operations OK',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown disk error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

async function performOpenAICheck() {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      return {
        status: 'pass' as const,
        output: 'OpenAI API accessible',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        status: 'fail' as const,
        output: `OpenAI API error: HTTP ${response.status}`,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown OpenAI error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

async function performGitLabCheck() {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${process.env.GITLAB_URL}/api/v4/user`, {
      headers: {
        'PRIVATE-TOKEN': process.env.GITLAB_TOKEN!
      }
    });

    if (response.ok) {
      return {
        status: 'pass' as const,
        output: 'GitLab API accessible',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        status: 'fail' as const,
        output: `GitLab API error: HTTP ${response.status}`,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown GitLab error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

async function performSlackCheck() {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json() as { ok?: boolean; error?: string };

    if (data.ok) {
      return {
        status: 'pass' as const,
        output: 'Slack API accessible',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        status: 'fail' as const,
        output: `Slack API error: ${data.error}`,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      status: 'fail' as const,
      output: error instanceof Error ? error.message : 'Unknown Slack error',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

export { router as healthRouter };
