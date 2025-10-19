import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { databaseService } from '../services/database';
import { GitLabService } from '../services/gitlab';
import { OpenAIService } from '../services/openai';
import { SlackService } from '../services/slack';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  ValidationError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = databaseService;
const openaiService = new OpenAIService();
const slackService = new SlackService();

// Get branches for a project
router.get(
  '/:projectId/branches',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { search, per_page, page } = req.query;
    const userId = req.user!.id;

    try {
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 401, false, 'GitLab not connected', null, {
          requiresGitLabAuth: true,
        });
        return;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Resolve project ID
      let pid: string | number = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        try {
          const localProject = await db
            .projects()
            .where('id', projectId)
            .first();
          if (localProject?.gitlab_project_id) {
            pid = localProject.gitlab_project_id;
          }
        } catch {}
      }

      const branches = await gitlab.getProjectBranches(pid, {
        search: search as string | undefined,
        per_page: per_page ? parseInt(per_page as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
      });

      sendResponse(res, 200, true, 'Branches fetched successfully', {
        items: branches,
        total: branches.length,
      });
    } catch (error: any) {
      logger.error('Failed to fetch branches:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to fetch branches'
      );
    }
  })
);

// Create a merge request
router.post(
  '/:projectId/gitlab/merge-requests',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      source_branch: Joi.string().required(),
      target_branch: Joi.string().required(),
      title: Joi.string().min(3).max(255).required(),
      description: Joi.string().allow('').optional(),
      assignee_id: Joi.number().integer().optional(),
      assignee_ids: Joi.array().items(Joi.number().integer()).optional(),
      reviewer_ids: Joi.array().items(Joi.number().integer()).optional(),
      milestone_id: Joi.number().integer().optional(),
      labels: Joi.string().optional(),
      remove_source_branch: Joi.boolean().optional(),
      squash: Joi.boolean().optional(),
      allow_collaboration: Joi.boolean().optional(),
      slack_channel_id: Joi.string().optional(),
      slack_user_ids: Joi.array().items(Joi.string()).optional(),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const mrData = req.body;
    const userId = req.user!.id;

    try {
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 401, false, 'GitLab not connected', null, {
          requiresGitLabAuth: true,
        });
        return;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Resolve project ID and capture local metadata for Slack context
      let pid: string | number = projectId;
      let projectRecord: any = null;
      let projectName: string | undefined;
      const projectIdIsNumeric = /^\d+$/.test(String(projectId));

      try {
        if (projectIdIsNumeric) {
          projectRecord = await db
            .projects()
            .where('gitlab_project_id', parseInt(String(projectId), 10))
            .first();
          projectName = projectRecord?.name;
        } else {
          projectRecord = await db.projects().where('id', projectId).first();
          if (projectRecord?.gitlab_project_id) {
            pid = projectRecord.gitlab_project_id;
          }
          projectName = projectRecord?.name;
        }
      } catch (projectLookupError) {
        logger.warn(
          'Failed to load local project metadata:',
          projectLookupError
        );
      }

      const {
        slack_channel_id: slackChannelId,
        slack_user_ids: slackUserIds,
        ...gitlabPayload
      } = mrData;

      const mergeRequest = await gitlab.createMergeRequest(pid, gitlabPayload);

      if (!projectName) {
        try {
          const gitlabProject = await gitlab.getProject(pid);
          projectName =
            gitlabProject?.path_with_namespace ||
            gitlabProject?.name ||
            projectName;
        } catch (gitlabProjectError) {
          const errorMessage =
            gitlabProjectError instanceof Error
              ? gitlabProjectError.message
              : String(gitlabProjectError);
          logger.warn('Failed to resolve GitLab project name:', {
            projectId: pid,
            error: errorMessage,
          });
        }
      }

      if (!(mergeRequest as any).project && projectName) {
        (mergeRequest as any).project = { name: projectName };
      }

      let slackNotification: {
        status: 'sent' | 'failed';
        channel: string;
        ts?: string;
        error?: string;
      } | null = null;

      if (slackChannelId) {
        try {
          const slackResult = await slackService.sendMergeRequestNotification({
            userId,
            channelId: slackChannelId,
            mergeRequest: {
              ...mergeRequest,
              slackUserIds,
            },
          });

          slackNotification = {
            status: 'sent',
            channel: slackResult.channel,
            ts: slackResult.ts,
          };

          logger.logUserAction('Merge request shared to Slack', userId, {
            projectId: pid,
            mergeRequestId: mergeRequest?.id,
            mergeRequestIid: mergeRequest?.iid,
            slackChannelId,
            slackTs: slackResult.ts,
          });
        } catch (slackError: any) {
          logger.error('Failed to send Slack notification for merge request:', {
            error: slackError?.message,
            channelId: slackChannelId,
          });

          slackNotification = {
            status: 'failed',
            channel: slackChannelId,
            error:
              slackError?.message || 'Failed to deliver Slack notification',
          };

          logger.logUserAction(
            'Merge request Slack notification failed',
            userId,
            {
              projectId: pid,
              mergeRequestId: mergeRequest?.id,
              mergeRequestIid: mergeRequest?.iid,
              slackChannelId,
              error: slackNotification.error,
            }
          );
        }
      }

      logger.logUserAction('Merge request created', userId, {
        projectId: pid,
        mergeRequestId: mergeRequest?.id,
        mergeRequestIid: mergeRequest?.iid,
        slackChannelId: slackNotification?.channel,
        slackStatus: slackNotification?.status || 'not_requested',
      });

      sendResponse(res, 201, true, 'Merge request created successfully', {
        mergeRequest,
        slackNotification,
      });
    } catch (error: any) {
      logger.error('Failed to create merge request:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to create merge request'
      );
    }
  })
);

// Get merge requests for a project
router.get(
  '/:projectId/gitlab/merge-requests',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const {
      state,
      order_by,
      sort,
      milestone,
      labels,
      author_id,
      assignee_id,
      reviewer_id,
      source_branch,
      target_branch,
      search,
      per_page,
      page,
    } = req.query;
    const userId = req.user!.id;

    try {
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 401, false, 'GitLab not connected', null, {
          requiresGitLabAuth: true,
        });
        return;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Resolve project ID
      let pid: string | number = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        try {
          const localProject = await db
            .projects()
            .where('id', projectId)
            .first();
          if (localProject?.gitlab_project_id) {
            pid = localProject.gitlab_project_id;
          }
        } catch {}
      }

      const mergeRequests = await gitlab.getMergeRequests(pid, {
        state: state as any,
        order_by: order_by as any,
        sort: sort as any,
        milestone: milestone as string | undefined,
        labels: labels as string | undefined,
        author_id: author_id ? parseInt(author_id as string, 10) : undefined,
        assignee_id: assignee_id
          ? parseInt(assignee_id as string, 10)
          : undefined,
        reviewer_id: reviewer_id
          ? parseInt(reviewer_id as string, 10)
          : undefined,
        source_branch: source_branch as string | undefined,
        target_branch: target_branch as string | undefined,
        search: search as string | undefined,
        per_page: per_page ? parseInt(per_page as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
      });

      sendResponse(res, 200, true, 'Merge requests fetched successfully', {
        items: mergeRequests,
        total: mergeRequests.length,
      });
    } catch (error: any) {
      logger.error('Failed to fetch merge requests:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to fetch merge requests'
      );
    }
  })
);

// Get a single merge request
router.get(
  '/:projectId/gitlab/merge-requests/:mrIid',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, mrIid } = req.params;
    const userId = req.user!.id;

    try {
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 401, false, 'GitLab not connected', null, {
          requiresGitLabAuth: true,
        });
        return;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Resolve project ID
      let pid: string | number = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        try {
          const localProject = await db
            .projects()
            .where('id', projectId)
            .first();
          if (localProject?.gitlab_project_id) {
            pid = localProject.gitlab_project_id;
          }
        } catch {}
      }

      const mergeRequest = await gitlab.getMergeRequest(
        pid,
        parseInt(mrIid, 10)
      );

      sendResponse(
        res,
        200,
        true,
        'Merge request fetched successfully',
        mergeRequest
      );
    } catch (error: any) {
      logger.error('Failed to fetch merge request:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to fetch merge request'
      );
    }
  })
);

// Generate AI description for merge request
router.post(
  '/:projectId/generate-description',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      source_branch: Joi.string().required(),
      target_branch: Joi.string().required(),
      template: Joi.string().optional().allow(''),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { source_branch, target_branch, template } = req.body;
    const userId = req.user!.id;

    try {
      // Get OAuth connection
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        sendResponse(res, 401, false, 'GitLab not connected', null, {
          requiresGitLabAuth: true,
        });
        return;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Resolve project ID
      let pid: string | number = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        try {
          const localProject = await db
            .projects()
            .where('id', projectId)
            .first();
          if (localProject?.gitlab_project_id) {
            pid = localProject.gitlab_project_id;
          }
        } catch {}
      }

      // Fetch comparison (commits + diffs) between branches
      logger.info(
        `Fetching comparison between ${target_branch}...${source_branch} for project ${pid}`
      );
      const comparison = await gitlab.compareBranches(
        pid,
        target_branch,
        source_branch
      );

      const commits = comparison.commits || [];
      const diffs = comparison.diffs || [];

      if (!commits || commits.length === 0) {
        sendResponse(res, 200, true, 'No commits found between branches', {
          description: template || '',
          commits: [],
        });
        logger.logUserAction(
          'Merge request description generation skipped',
          userId,
          {
            projectId: pid,
            sourceBranch: source_branch,
            targetBranch: target_branch,
            reason: 'no_commits',
          }
        );
        return;
      }

      logger.info(
        `Found ${commits.length} commits and ${diffs.length} file changes`
      );

      // Default MR template if none provided
      const mrTemplate =
        template ||
        `**Related Issue:**

---

**Technical Requirement:**

> Example: need run \`npm install\`

---

**Feature Updated**

- [ ] Feature A
- [ ] Feature B
- [ ] Feature C

---

**Screen Capture / Video:**

---

**Checklist**

- [ ] I have tested this code
- [ ] There is no dead code`;

      // Generate AI description with diffs
      logger.info(
        `Generating AI description for MR with ${commits.length} commits and ${diffs.length} diffs`
      );
      const description = await openaiService.generateMergeRequestDescription(
        mrTemplate,
        commits.map(c => ({
          title: c.title,
          message: c.message,
          author_name: c.author_name,
        })),
        source_branch,
        target_branch,
        diffs.map(d => ({
          old_path: d.old_path,
          new_path: d.new_path,
          diff: d.diff,
        }))
      );

      logger.logUserAction('Merge request description generated', userId, {
        projectId: pid,
        sourceBranch: source_branch,
        targetBranch: target_branch,
        commitCount: commits.length,
        diffCount: diffs.length,
        usedTemplate: Boolean(template),
      });

      sendResponse(res, 200, true, 'AI description generated successfully', {
        description,
        commits: commits.slice(0, 10).map(c => ({
          title: c.title,
          author: c.author_name,
          date: c.created_at,
        })),
      });
    } catch (error: any) {
      logger.error('Failed to generate AI description:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to generate AI description'
      );
    }
  })
);

export { router as mergeRequestRouter };
