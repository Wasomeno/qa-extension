import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { AuthService } from '../services/auth';
import { GitLabService } from '../services/gitlab';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// Rate limiting middleware removed to rely on upstream GitLab limits
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  sendError,
  ValidationError,
  AuthenticationError,
  ConflictError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const authService = new AuthService();
const gitlabService = new GitLabService();

// Validation schemas (only GitLab OAuth used now)

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// Registration is now handled through GitLab OAuth only

// Login is now handled through GitLab OAuth only

// Refresh access token
router.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshToken) {
      throw new AuthenticationError('Refresh token is required');
    }

    try {
      const tokens = await authService.refreshToken(refreshToken);

      // Update HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      sendResponse(res, 200, true, 'Token refreshed successfully', {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: Math.floor((tokens.expiresAt - Date.now()) / 1000),
      });
    } catch (error) {
      // Clear invalid cookie
      res.clearCookie('refreshToken');
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  })
);

// Logout user
router.post(
  '/logout',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;
    const userId = req.user!.id;

    try {
      await authService.logout(userId, refreshToken);

      // Clear cookie
      res.clearCookie('refreshToken');

      logger.logUserAction('User logged out', userId);

      sendResponse(res, 200, true, 'Logout successful');
    } catch (error) {
      logger.error('Logout error:', error);
      // Still send success response to prevent information leakage
      sendResponse(res, 200, true, 'Logout successful');
    }
  })
);

// Password change not available with GitLab OAuth only

// Password reset not available with GitLab OAuth only

// Password reset not available with GitLab OAuth only

// Get current user info
router.get(
  '/me',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      const user = await authService.getUserById(userId);

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      sendResponse(res, 200, true, 'User info retrieved', { user });
    } catch (error) {
      throw new AuthenticationError('Failed to get user info');
    }
  })
);

// GitLab OAuth initiation
router.get(
  '/gitlab',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.query;
      
      // Use the provided sessionId as state parameter
      const state = sessionId ? sessionId.toString() : generateState();
      const authUrl = gitlabService.getAuthUrl(state);

      logger.logUserAction('GitLab OAuth initiated', 'anonymous', {
        ip: req.ip,
        sessionId: state,
      });

      sendResponse(res, 200, true, 'GitLab OAuth URL generated', { authUrl, sessionId: state });
    } catch (error) {
      logger.error('GitLab OAuth initiation failed:', error);
      sendError(
        res,
        500,
        'Failed to initiate GitLab OAuth',
        'GITLAB_OAUTH_ERROR'
      );
    }
  })
);

// GitLab OAuth callback (GET - for redirect from GitLab)
router.get(
  '/gitlab/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code) {
      throw new ValidationError('Authorization code is required');
    }

    try {
      // Exchange code for tokens
      const gitlabTokens = await gitlabService.exchangeCodeForTokens(code as string);

      // Get GitLab user info
      const gitlabUser = await gitlabService.getCurrentUser(
        gitlabTokens.accessToken
      );

      // Check if user exists or create new one
      let user = await authService.getUserByGitlabId(gitlabUser.id.toString());

      if (!user) {
        // Create new user from GitLab info
        const result = await authService.createFromOAuth({
          provider: 'gitlab',
          providerId: gitlabUser.id.toString(),
          email: gitlabUser.email,
          username: gitlabUser.username,
          fullName: gitlabUser.name,
          avatarUrl: gitlabUser.avatar_url,
          tokens: gitlabTokens,
        });
        user = result.user;
      } else {
        // Update existing user's GitLab tokens
        await authService.updateOAuthTokens(user.id, 'gitlab', gitlabTokens, gitlabUser.id.toString());
      }

      // Generate our own tokens
      const tokens = await authService.generateTokenPair(user.id);

      logger.logUserAction('GitLab OAuth completed', user.id, {
        gitlabId: gitlabUser.id,
      });

      // Set HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Use the state parameter as session ID (passed from extension)
      const sessionId = state?.toString() || require('crypto').randomBytes(16).toString('hex');
      
      // Store auth data in memory with the session ID (expires in 5 minutes)
      const authData = {
        success: true,
        timestamp: Date.now(),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        },
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name || user.name,
          avatarUrl: user.avatar_url
        }
      };
      
      // Store in Redis with expiration (or in-memory if Redis is down)
      try {
        await authService.storeOAuthSession(sessionId, authData);
      } catch (error) {
        logger.warn('Failed to store OAuth session in Redis, using memory fallback');
        // Store in module-level memory as fallback
        (global as any).oauthSessions = (global as any).oauthSessions || new Map();
        (global as any).oauthSessions.set(sessionId, authData);
        // Clean up after 5 minutes
        setTimeout(() => {
          (global as any).oauthSessions?.delete(sessionId);
        }, 5 * 60 * 1000);
      }
      
      // Return success HTML page that notifies extension
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 1rem;
              backdrop-filter: blur(10px);
            }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Authentication Successful!</h1>
            <p>You have been successfully authenticated with GitLab.</p>
            <p>Please return to the extension popup.</p>
            <p><small>Session ID: ${sessionId}</small></p>
            <p><small>This window will close automatically...</small></p>
          </div>
          <script>
            console.log('OAuth success - Session ID: ${sessionId}');
            
            // Try to communicate with extension if possible
            try {
              window.postMessage({
                type: 'QA_EXTENSION_OAUTH_SUCCESS',
                sessionId: '${sessionId}'
              }, '*');
            } catch (e) {
              console.log('PostMessage failed:', e);
            }
            
            // Close this window after a delay
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                console.log('Window close failed, user needs to close manually');
              }
            }, 3000);
          </script>
        </body>
        </html>
      `;
      res.send(html);
    } catch (error) {
      logger.error('GitLab OAuth callback error:', error);
      // Return error HTML
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 1rem;
              backdrop-filter: blur(10px);
            }
            .error-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Authentication Failed</h1>
            <p>There was an error during authentication.</p>
            <p>Please try again from the extension.</p>
            <p><small>This window will close automatically...</small></p>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `;
      res.send(html);
    }
  })
);

// GitLab OAuth callback (POST - for manual API calls)
router.post(
  '/gitlab/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.body;

    if (!code) {
      throw new ValidationError('Authorization code is required');
    }

    try {
      // Exchange code for tokens
      const gitlabTokens = await gitlabService.exchangeCodeForTokens(code);

      // Get GitLab user info
      const gitlabUser = await gitlabService.getCurrentUser(
        gitlabTokens.accessToken
      );

      // Check if user exists or create new one
      let user = await authService.getUserByGitlabId(gitlabUser.id.toString());

      if (!user) {
        // Create new user from GitLab info
        const result = await authService.createFromOAuth({
          provider: 'gitlab',
          providerId: gitlabUser.id.toString(),
          email: gitlabUser.email,
          username: gitlabUser.username,
          fullName: gitlabUser.name,
          avatarUrl: gitlabUser.avatar_url,
          tokens: gitlabTokens,
        });
        user = result.user;
      } else {
        // Update existing user's GitLab tokens
        await authService.updateOAuthTokens(user.id, 'gitlab', gitlabTokens, gitlabUser.id.toString());
      }

      // Generate our own tokens
      const tokens = await authService.generateTokenPair(user.id);

      logger.logUserAction('GitLab OAuth completed', user.id, {
        gitlabId: gitlabUser.id,
      });

      // Set HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      sendResponse(res, 200, true, 'GitLab OAuth successful', {
        user,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: Math.floor((tokens.expiresAt - Date.now()) / 1000),
      });
    } catch (error) {
      logger.error('GitLab OAuth callback error:', error);
      throw new AuthenticationError('GitLab OAuth failed');
    }
  })
);

// Slack OAuth removed - using GitLab OAuth only

// Slack OAuth removed - using GitLab OAuth only

// Disconnect GitLab OAuth
router.delete(
  '/oauth/gitlab',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      await authService.disconnectOAuth(userId, 'gitlab');

      logger.logUserAction('GitLab OAuth disconnected', userId);

      sendResponse(res, 200, true, 'GitLab integration removed');
    } catch (error) {
      logger.error('GitLab OAuth disconnect error:', error);
      sendError(
        res,
        500,
        'Failed to disconnect GitLab',
        'OAUTH_DISCONNECT_ERROR'
      );
    }
  })
);

// Get GitLab OAuth connection status
router.get(
  '/oauth/status',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      const connections = await authService.getOAuthConnections(userId);

      sendResponse(res, 200, true, 'OAuth connections retrieved', {
        gitlab: connections.gitlab
      });
    } catch (error) {
      logger.error('OAuth status error:', error);
      sendError(res, 500, 'Failed to get OAuth status', 'OAUTH_STATUS_ERROR');
    }
  })
);

// Validate token endpoint (for other services)
router.get(
  '/validate',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;

    sendResponse(res, 200, true, 'Token is valid', {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  })
);

// OAuth session retrieval endpoint
router.get(
  '/oauth/session/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      throw new ValidationError('Session ID is required');
    }
    
    try {
      // Try to get from auth service first (Redis)
      let authData;
      try {
        authData = await authService.getOAuthSession(sessionId);
      } catch (error) {
        // Fallback to memory storage
        authData = (global as any).oauthSessions?.get(sessionId);
      }
      
      if (!authData) {
        return sendResponse(res, 404, false, 'OAuth session not found or expired');
      }
      
      // Clean up the session after retrieval
      try {
        await authService.deleteOAuthSession(sessionId);
      } catch (error) {
        (global as any).oauthSessions?.delete(sessionId);
      }
      
      logger.logUserAction('OAuth session retrieved', authData.user.id, {
        sessionId
      });
      
      sendResponse(res, 200, true, 'OAuth session retrieved', authData);
    } catch (error) {
      logger.error('OAuth session retrieval error:', error);
      sendError(res, 500, 'Failed to retrieve OAuth session', 'OAUTH_SESSION_ERROR');
    }
  })
);

// Get GitLab users (fallback endpoint)
router.get(
  '/integrations/gitlab/users',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      // Get user's GitLab OAuth connection
      const connections = await authService.getOAuthConnections(userId);
      
      if (!connections.gitlab || !connections.gitlab.access_token) {
        throw new AuthenticationError('GitLab connection required');
      }

      // Initialize GitLab service with access token
      const gitlabService = new GitLabService(connections.gitlab.access_token);
      
      // Get current user to get their projects and find all users from those projects
      const currentUser = await gitlabService.getCurrentUser(connections.gitlab.access_token);
      const projects = await gitlabService.getProjects({ membership: true, per_page: 10 }); // Reduced to avoid rate limits
      
      // Collect users from all accessible projects
      const allUsers = new Map();
      allUsers.set(currentUser.id.toString(), {
        id: currentUser.id.toString(),
        username: currentUser.username,
        name: currentUser.name,
        email: currentUser.email,
        avatarUrl: currentUser.avatar_url,
        webUrl: currentUser.web_url
      });

      // Get users from each project (limited to first 3 projects to avoid rate limits)
      const limitedProjects = projects.slice(0, 3);
      for (const project of limitedProjects) {
        try {
          const projectMembers = await gitlabService.getProjectMembers(project.id);
          projectMembers.forEach(member => {
            allUsers.set(member.id.toString(), {
              id: member.id.toString(),
              username: member.username,
              name: member.name,
              email: member.email,
              avatarUrl: member.avatar_url,
              webUrl: member.web_url
            });
          });
        } catch (error) {
          // Skip projects we can't access
          logger.debug(`Skipping project ${project.id} due to access error:`, error);
        }
      }

      const users = Array.from(allUsers.values());
      sendResponse(res, 200, true, 'GitLab users retrieved successfully', users);
    } catch (error) {
      logger.error('Get GitLab users error:', error);
      
      // Handle GitLab API errors gracefully
      if ((error as any).response?.status === 401) {
        sendResponse(res, 401, false, 'GitLab authentication failed. Please reconnect your GitLab account.', []);
        return;
      }
      
      // Return empty array as fallback
      sendResponse(res, 200, true, 'Could not fetch GitLab users, using fallback', []);
    }
  })
);

// Helper functions
function generateState(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

// Extend AuthService with additional OAuth methods
declare module '../services/auth' {
  interface AuthService {
    getUserByGitlabId(gitlabId: string): Promise<any>;
    createFromOAuth(data: any): Promise<{ user: any; tokens: any }>;
    updateOAuthTokens(
      userId: string,
      provider: string,
      tokens: any,
      providerId?: string
    ): Promise<void>;
    generateTokenPair(userId: string): Promise<any>;
    storeOAuthState(state: string, data: any): Promise<void>;
    getOAuthState(state: string): Promise<any>;
    storeOAuthSession(sessionId: string, data: any): Promise<void>;
    getOAuthSession(sessionId: string): Promise<any>;
    deleteOAuthSession(sessionId: string): Promise<void>;
    disconnectOAuth(
      userId: string,
      provider: 'gitlab'
    ): Promise<void>;
    getOAuthConnections(userId: string): Promise<any>;
  }
}

export { router as authRouter };
