import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        role: string;
      };
      rateLimit?: {
        limit: number;
        remaining: number;
        resetTime: number;
      };
      rateLimitInfo?: {
        current: number;
        ttl: number;
        resetTime: number | null;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}