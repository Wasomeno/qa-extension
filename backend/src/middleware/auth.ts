import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { databaseService } from '../services/database';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export class AuthMiddleware {
  private db = databaseService;

  constructor() {
    // Use the shared database service instance
  }

  public authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        res.status(401).json({
          success: false,
          message: 'No authentication token provided'
        });
        return;
      }

      const decoded = jwt.verify(token, EnvConfig.JWT_SECRET) as any;
      
      // Get user from database
      const user = await this.db.users()
        .where('id', decoded.userId)
        .where('is_active', true)
        .first();

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid authentication token'
        });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      };

      next();
    } catch (error: unknown) {
      logger.error('Authentication error:', error);
      
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          message: 'Authentication token expired'
        });
        return;
      }

      res.status(401).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }
  };

  public authorize = (roles: string[] = []) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      if (roles.length > 0 && !roles.includes(req.user!.role)) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
        return;
      }

      next();
    };
  };

  public optional = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = this.extractToken(req);
      
      if (token) {
        const decoded = jwt.verify(token, EnvConfig.JWT_SECRET) as any;
        
        const user = await this.db.users()
          .where('id', decoded.userId)
          .where('is_active', true)
          .first();

        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role
          };
        }
      }

      next();
    } catch (error) {
      // In optional auth, we don't fail on token errors
      next();
    }
  };

  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Also check for token in cookies (for web interface)
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }

    return null;
  }
}

export const authMiddleware = new AuthMiddleware();