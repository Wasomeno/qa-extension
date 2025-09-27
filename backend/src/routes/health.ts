import { Router, Request, Response } from 'express';
import { DatabaseService, databaseService } from '../services/database';
import { redisService } from '../services/redis';
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
    await redisService.ping();
    
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



export { router as healthRouter };
