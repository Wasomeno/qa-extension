import { Router, Response } from 'express';
import { databaseService } from '../services/database';
import { GitLabService } from '../services/gitlab';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, sendResponse } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = databaseService;

// Get user's recent projects based on GitLab Events API
router.get(
  '/:userId/recent-projects',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params as any;
    const requestUserId = req.user!.id;

    // Ensure user can only access their own data
    if (String(userId) !== String(requestUserId)) {
      sendResponse(res, 403, false, 'Access denied');
      return;
    }

    try {
      // Get user's GitLab OAuth connection
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', requestUserId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 200, true, 'No GitLab connection found', [], {
          requiresGitLabAuth: true,
        });
        return;
      }

      // Initialize GitLab service
      const gitlab = new GitLabService(oauthConnection.access_token);

      // Get user's events from GitLab (last 30 days, limit to 100 events)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const afterDate = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Use the GitLab user ID from the OAuth connection
      const gitlabUserId = parseInt(oauthConnection.provider_user_id, 10);
      if (isNaN(gitlabUserId)) {
        sendResponse(res, 400, false, 'Invalid GitLab user ID');
        return;
      }

      // Fetch user's recent events from GitLab (all activities)
      const events = await gitlab.getUserEvents(gitlabUserId, {
        limit: 100,
        after: afterDate,
      });

      // Extract unique project IDs from events
      const projectIds = new Set<number>();
      const projectActivityMap = new Map<
        number,
        {
          projectId: number;
          lastActivity: string;
        }
      >();

      events.forEach(event => {
        if (event.project_id) {
          projectIds.add(event.project_id);

          const existing = projectActivityMap.get(event.project_id);
          if (
            !existing ||
            new Date(event.created_at) > new Date(existing.lastActivity)
          ) {
            projectActivityMap.set(event.project_id, {
              projectId: event.project_id,
              lastActivity: event.created_at,
            });
          }
        }
      });

      // Fetch project details for each project ID
      const projectMap = new Map<number, any>();
      await Promise.all(
        Array.from(projectIds).map(async projectId => {
          try {
            const project = await gitlab.getProject(projectId);
            projectMap.set(projectId, project);
          } catch (error) {
            logger.warn(`Failed to fetch project ${projectId}:`, error);
          }
        })
      );

      // Convert to array and sort by most recent activity (limit to 10 projects)
      const recentProjects = Array.from(projectActivityMap.values())
        .sort(
          (a, b) =>
            new Date(b.lastActivity).getTime() -
            new Date(a.lastActivity).getTime()
        )
        .slice(0, 10)
        .map(({ projectId, lastActivity }) => {
          const project = projectMap.get(projectId);
          if (!project) {
            return null;
          }
          return {
            id: project.id.toString(),
            name: project.name,
            description: project.description || '',
            path_with_namespace: project.path_with_namespace,
            web_url: project.web_url,
            avatar_url: project.avatar_url,
            last_activity_at: lastActivity,
            gitlab_project_id: project.id,
          };
        })
        .filter(Boolean);

      sendResponse(res, 200, true, 'Recent projects retrieved', recentProjects);
    } catch (error) {
      logger.error('Get recent projects error:', error);

      // Handle GitLab API errors gracefully
      if ((error as any).response?.status === 401) {
        sendResponse(
          res,
          401,
          false,
          'GitLab authentication failed. Please reconnect your GitLab account.',
          [],
          {
            requiresGitLabAuth: true,
          }
        );
        return;
      }

      if ((error as any).response?.status === 403) {
        sendResponse(
          res,
          403,
          false,
          'GitLab access forbidden. Please reconnect your GitLab account.',
          [],
          {
            requiresGitLabAuth: true,
          }
        );
        return;
      }

      // On any other error, return empty array with error message
      sendResponse(
        res,
        200,
        true,
        'Could not fetch recent projects, returning empty list',
        [],
        {
          error: (error as Error).message,
        }
      );
    }
  })
);

export { router as userRouter };
