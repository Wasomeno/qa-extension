import { Router, Response } from 'express';
import Joi from 'joi';
import { databaseService } from '../services/database';
import { GitLabService } from '../services/gitlab';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  ValidationError,
  AuthorizationError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = databaseService;

// Create a GitLab issue directly via GitLab API
router.post(
  '/:projectId/gitlab/issues',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      title: Joi.string().min(3).max(200).required(),
      description: Joi.string().min(1).max(10000).required(),
      childDescriptions: Joi.array().items(Joi.string()).default([]).optional(),
      labels: Joi.array().items(Joi.string()).default([]),
      assigneeIds: Joi.array().items(Joi.number().integer()).default([]),
      milestone_id: Joi.number().integer().optional(),
      issueFormat: Joi.string().optional(),
      due_date: Joi.string().optional(),
      weight: Joi.number().integer().optional(),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params as any;
    const {
      title,
      description,
      labels,
      assigneeIds,
      milestone_id,
      due_date,
      weight,
      issueFormat,
    } = req.body;
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

      // Accept numeric GitLab project ID or try to resolve from local UUID
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

      // Build description using provided QA template
      const templateDescription = description;

      if (issueFormat === 'multiple') {
        const splittedDescriptions = templateDescription.split('==========');
        const mainDescription = splittedDescriptions[0];
        const childDescriptions = splittedDescriptions.slice(1);
        const payload: any = {
          title,
          description: mainDescription,
          assignee_ids: (assigneeIds || []) as number[],
          ...(milestone_id ? { milestone_id } : {}),
          ...(due_date ? { due_date } : {}),
          ...(typeof weight === 'number' ? { weight } : {}),
        };
        if (labels && Array.isArray(labels) && labels.length) {
          payload.labels = labels.join(',');
        }

        const createdIssue = await gitlab.createIssue(pid, payload);
        await Promise.all(
          childDescriptions.map((description: string) =>
            gitlab.addIssueComment(pid, createdIssue.iid, description)
          )
        );

        sendResponse(res, 201, true, 'GitLab issue created', {
          issue: createdIssue,
        });
        return;
      }
      const payload: any = {
        title,
        description: templateDescription.trim(),
        assignee_ids: (assigneeIds || []) as number[],
        ...(milestone_id ? { milestone_id } : {}),
        ...(due_date ? { due_date } : {}),
        ...(typeof weight === 'number' ? { weight } : {}),
      };
      if (labels && Array.isArray(labels) && labels.length) {
        payload.labels = labels.join(',');
      }

      const created = await gitlab.createIssue(pid, payload);

      sendResponse(res, 201, true, 'GitLab issue created', { issue: created });
    } catch (error) {
      logger.error('Create GitLab issue error:', error);
      throw error;
    }
  })
);

// Get single GitLab issue details
router.get(
  '/:projectId/gitlab/issues/:iid',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, iid } = req.params as any;
    const issueIid = parseInt(iid, 10);
    const userId = req.user!.id;

    if (Number.isNaN(issueIid) || issueIid <= 0) {
      sendResponse(res, 400, false, 'Invalid issue IID');
      return;
    }

    let gitlabProjectRef: string | number | undefined = undefined;
    let localProject: any | null = null;

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

      gitlabProjectRef = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Fetch issue
      let issue;
      try {
        issue = await gitlab.getIssue(gitlabProjectRef!, issueIid);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          issue = await gitlab.getIssue(
            localProject.gitlab_project_path,
            issueIid
          );
        } else {
          throw err;
        }
      }

      sendResponse(res, 200, true, 'GitLab issue fetched', issue);
    } catch (error: any) {
      logger.error('Get GitLab issue detail error:', error);
      const msg = error?.message || 'Failed to fetch issue from GitLab';
      const lower = String(msg).toLowerCase();
      const code =
        lower.includes('not found') || lower.includes('inaccessible')
          ? 404
          : lower.includes('authentication')
            ? 401
            : lower.includes('forbidden')
              ? 403
              : 500;
      try {
        sendResponse(res, code, false, msg);
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
      return;
    }
  })
);

// Update a specific GitLab issue (state, assignee, labels)
router.patch(
  '/:projectId/gitlab/issues/:iid',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, iid } = req.params as any;
    const issueIid = parseInt(iid, 10);
    const userId = req.user!.id;

    if (Number.isNaN(issueIid) || issueIid <= 0) {
      sendResponse(res, 400, false, 'Invalid issue IID');
      return;
    }

    let gitlabProjectRef: string | number | undefined = undefined;
    let localProject: any | null = null;

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

      // Resolve GitLab project reference: accept local UUID, numeric ID, or stored project path
      gitlabProjectRef = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      } else {
        localProject = await db
          .projects()
          .where('gitlab_project_id', projectId)
          .first();
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Build update payload
      const body = req.body || {};
      const update: any = {};

      // Map state toggle
      if (body.state === 'close' || body.state === 'reopen') {
        update.state_event = body.state;
      }

      // Assign
      if (body.assigneeId !== undefined) {
        if (body.assigneeId === null) {
          update.assignee_ids = [];
        } else if (body.assigneeId === 'me') {
          try {
            const me = await gitlab.authenticate(oauthConnection.access_token);
            update.assignee_ids = [me.id];
          } catch (_) {}
        } else if (typeof body.assigneeId === 'number') {
          update.assignee_ids = [body.assigneeId];
        }
      }

      // Description
      if (typeof body.description === 'string') {
        update.description = body.description;
      }

      // Labels: if explicit labels provided, replace. Otherwise support add/remove.
      let finalLabels: string[] | undefined = undefined;
      if (Array.isArray(body.labels)) {
        finalLabels = body.labels;
      } else if (
        Array.isArray(body.addLabels) ||
        Array.isArray(body.removeLabels)
      ) {
        // Fetch current issue to compute final labels
        const current = await gitlab.getIssue(gitlabProjectRef!, issueIid);
        const set = new Set<string>(
          Array.isArray(current.labels) ? current.labels : []
        );
        if (Array.isArray(body.addLabels))
          body.addLabels.forEach((l: string) => set.add(l));
        if (Array.isArray(body.removeLabels))
          body.removeLabels.forEach((l: string) => set.delete(l));
        finalLabels = Array.from(set);
      }
      if (finalLabels) {
        update.labels = finalLabels;

        // Check if status labels are used and set state_event accordingly
        const hasOpenLabel = finalLabels.some(
          label => label.toLowerCase() === 'open'
        );
        const hasClosedLabel = finalLabels.some(
          label => label.toLowerCase() === 'closed'
        );

        if (hasClosedLabel && !hasOpenLabel) {
          update.state_event = 'close';
        } else if (hasOpenLabel && !hasClosedLabel) {
          update.state_event = 'reopen';
        }
      }

      // Perform update (with fallback to project path if needed)
      let updated;
      try {
        updated = await gitlab.updateIssue(gitlabProjectRef!, issueIid, update);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          updated = await gitlab.updateIssue(
            localProject.gitlab_project_path,
            issueIid,
            update
          );
        } else {
          throw err;
        }
      }

      sendResponse(res, 200, true, 'GitLab issue updated', updated);
    } catch (error: any) {
      logger.error('Update GitLab issue error:', error);
      const msg = error?.message || 'Failed to update issue in GitLab';
      const lower = String(msg).toLowerCase();
      const code = lower.includes('authentication')
        ? 401
        : lower.includes('forbidden')
          ? 403
          : 500;
      try {
        sendResponse(res, code, false, msg);
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
      return;
    }
  })
);

// Get checklist items from a specific GitLab issue description
router.get(
  '/:projectId/gitlab/issues/:iid/checklist',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, iid } = req.params as any;
    const issueIid = parseInt(iid, 10);
    const userId = req.user!.id;

    if (Number.isNaN(issueIid) || issueIid <= 0) {
      sendResponse(res, 400, false, 'Invalid issue IID');
      return;
    }

    // For error diagnostics
    let gitlabProjectRef: string | number | undefined = undefined;
    let localProject: any | null = null;

    try {
      // Get user's GitLab OAuth connection
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

      // Resolve GitLab project reference: accept local UUID, numeric ID, or stored project path
      gitlabProjectRef = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        // projectId is likely a local UUID
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      } else {
        // projectId is numeric GitLab ID; try to enrich with local data for potential path fallback
        localProject = await db
          .projects()
          .where('gitlab_project_id', projectId)
          .first();
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Try fetching checklist; if it fails and we have an alternate ref, try fallback once
      let checklist;
      try {
        checklist = await gitlab.getIssueChecklist(gitlabProjectRef!, issueIid);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          try {
            checklist = await gitlab.getIssueChecklist(
              localProject.gitlab_project_path,
              issueIid
            );
          } catch (err2) {
            logger.error(
              'Checklist fetch failed for both project id and path',
              { err, err2, projectId, gitlabProjectRef, issueIid }
            );
            throw err2;
          }
        } else {
          throw err;
        }
      }

      sendResponse(res, 200, true, 'GitLab issue checklist fetched', {
        items: checklist,
      });
    } catch (error: any) {
      logger.error('Get GitLab issue checklist error:', error);
      const msg = error?.message || 'Failed to fetch issue from GitLab';
      const lower = String(msg).toLowerCase();
      const code =
        lower.includes('not found') || lower.includes('inaccessible')
          ? 404
          : lower.includes('authentication')
            ? 401
            : lower.includes('forbidden')
              ? 403
              : 500;
      try {
        // Provide minimal debug hints (no secrets)
        sendResponse(res, code, false, msg, null, {
          debug: {
            projectParam: projectId,
            usedRef:
              typeof gitlabProjectRef !== 'undefined'
                ? String(gitlabProjectRef)
                : undefined,
            hasLocalProject: !!localProject,
            hasLocalPath: !!(localProject && localProject.gitlab_project_path),
            issueIid,
          },
        });
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
      return;
    }
  })
);

// Get GitLab issue comments/notes
router.get(
  '/:projectId/gitlab/issues/:iid/notes',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, iid } = req.params as any;
    const issueIid = parseInt(iid, 10);
    const userId = req.user!.id;

    if (Number.isNaN(issueIid) || issueIid <= 0) {
      sendResponse(res, 400, false, 'Invalid issue IID');
      return;
    }

    let gitlabProjectRef: string | number | undefined = projectId;
    let localProject: any | null = null;

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

      if (!/^\d+$/.test(String(projectId))) {
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      } else {
        localProject = await db
          .projects()
          .where('gitlab_project_id', projectId)
          .first();
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      let notes;
      try {
        notes = await gitlab.getIssueNotes(gitlabProjectRef!, issueIid);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          notes = await gitlab.getIssueNotes(
            localProject.gitlab_project_path,
            issueIid
          );
        } else {
          throw err;
        }
      }

      sendResponse(res, 200, true, 'GitLab issue notes fetched', {
        items: notes,
      });
    } catch (error: any) {
      logger.error('Get GitLab issue notes error:', error);
      const msg = error?.message || 'Failed to fetch issue notes from GitLab';
      const lower = String(msg).toLowerCase();
      const code =
        lower.includes('not found') || lower.includes('inaccessible')
          ? 404
          : lower.includes('authentication')
            ? 401
            : lower.includes('forbidden')
              ? 403
              : 500;
      try {
        sendResponse(res, code, false, msg, null, {
          debug: {
            projectParam: projectId,
            usedRef:
              typeof gitlabProjectRef !== 'undefined'
                ? String(gitlabProjectRef)
                : undefined,
            hasLocalProject: !!localProject,
            hasLocalPath: !!(localProject && localProject.gitlab_project_path),
            issueIid,
          },
        });
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
    }
  })
);

// Add a GitLab issue comment/note
router.post(
  '/:projectId/gitlab/issues/:iid/notes',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, iid } = req.params as any;
    const issueIid = parseInt(iid, 10);
    const userId = req.user!.id;

    if (Number.isNaN(issueIid) || issueIid <= 0) {
      sendResponse(res, 400, false, 'Invalid issue IID');
      return;
    }

    const body: string | undefined =
      (req.body && (req.body as any).body) || undefined;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      sendResponse(res, 400, false, 'Body is required');
      return;
    }

    let gitlabProjectRef: string | number | undefined = undefined;
    let localProject: any | null = null;

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

      gitlabProjectRef = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);
      let note;
      try {
        note = await gitlab.addIssueComment(gitlabProjectRef!, issueIid, body);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          note = await gitlab.addIssueComment(
            localProject.gitlab_project_path,
            issueIid,
            body
          );
        } else {
          throw err;
        }
      }

      sendResponse(res, 201, true, 'GitLab note created', { note });
    } catch (error: any) {
      logger.error('Create GitLab issue note error:', error);
      const msg = error?.message || 'Failed to create note in GitLab';
      const lower = String(msg).toLowerCase();
      const code = lower.includes('authentication')
        ? 401
        : lower.includes('forbidden')
          ? 403
          : lower.includes('not found')
            ? 404
            : 500;
      try {
        sendResponse(res, code, false, msg);
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
    }
  })
);

// Get GitLab project labels
router.get(
  '/:projectId/gitlab/labels',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params as any;
    const userId = req.user!.id;

    let gitlabProjectRef: string | number | undefined = undefined;
    let localProject: any | null = null;

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

      gitlabProjectRef = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        localProject = await db.projects().where('id', projectId).first();
        if (!localProject) {
          sendResponse(
            res,
            400,
            false,
            'Invalid project ID: project not found'
          );
          return;
        }
        gitlabProjectRef =
          localProject.gitlab_project_id ||
          localProject.gitlab_project_path ||
          projectId;
      }

      const gitlab = new GitLabService(oauthConnection.access_token);
      let labels;
      try {
        labels = await gitlab.getProjectLabels(gitlabProjectRef!);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          localProject &&
          localProject.gitlab_project_path &&
          String(gitlabProjectRef) !== String(localProject.gitlab_project_path)
        ) {
          labels = await gitlab.getProjectLabels(
            localProject.gitlab_project_path
          );
        } else {
          throw err;
        }
      }

      sendResponse(res, 200, true, 'GitLab labels fetched', { items: labels });
    } catch (error: any) {
      logger.error('Get GitLab labels error:', error);
      const msg = error?.message || 'Failed to fetch labels from GitLab';
      const lower = String(msg).toLowerCase();
      const code = lower.includes('authentication')
        ? 401
        : lower.includes('forbidden')
          ? 403
          : 500;
      try {
        sendResponse(res, code, false, msg);
      } catch (_) {
        sendResponse(res, code, false, msg);
      }
      return;
    }
  })
);

// Get user's projects
router.get(
  '/',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const {
      page = 1,
      limit = 20,
      search,
      membership = true,
      owned = false,
      starred = false,
    } = req.query;

    try {
      // Get user's GitLab OAuth connection
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        // If no GitLab connection, return empty result with message
        sendResponse(
          res,
          200,
          true,
          'No GitLab connection found. Please connect your GitLab account to view projects.',
          [],
          {
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              pages: 0,
            },
            requiresGitLabAuth: true,
          }
        );
        return;
      }

      // Check if token is expired and refresh if needed
      const now = new Date();
      let accessToken = oauthConnection.access_token;

      if (
        oauthConnection.token_expires_at &&
        new Date(oauthConnection.token_expires_at) <= now
      ) {
        // Token is expired, try to refresh it
        const gitlabService = new GitLabService();
        try {
          accessToken = await gitlabService.refreshAccessToken();
        } catch (error) {
          // Token refresh failed, user needs to re-authenticate
          sendResponse(
            res,
            401,
            false,
            'GitLab token has expired. Please reconnect your GitLab account.',
            null,
            {
              requiresGitLabAuth: true,
            }
          );
          return;
        }
      }

      // Initialize GitLab service with valid access token
      const gitlabService = new GitLabService(accessToken);

      // Fetch projects from GitLab
      const gitlabProjects = await gitlabService.getProjects({
        owned: Boolean(owned),
        membership: Boolean(membership),
        starred: Boolean(starred),
        search: search as string,
        per_page: Number(limit),
        page: Number(page),
      });

      // Transform GitLab projects to match our expected format
      const transformedProjects = gitlabProjects.map(project => ({
        id: project.id.toString(),
        name: project.name,
        description: project.description || '',
        slug: project.path,
        web_url: project.web_url,
        avatar_url: project.avatar_url,
        default_branch: project.default_branch,
        path_with_namespace: project.path_with_namespace,
        gitlab_project_id: project.id,
        team_name: 'GitLab',
        member_role: 'developer',
        status: 'active',
        source: 'gitlab',
        stats: {
          issues: { total: 0 },
          recentIssues: 0,
        },
      }));

      // Get project statistics for any projects that exist in our database
      const projectsWithStats = await Promise.all(
        transformedProjects.map(async project => {
          // Check if this GitLab project exists in our database
          const localProject = await db
            .projects()
            .where('gitlab_project_id', project.gitlab_project_id)
            .first();

          if (localProject) {
            const stats = await getProjectStats(localProject.id);
            return {
              ...project,
              id: localProject.id,
              stats,
              hasLocalData: true,
            };
          }

          return { ...project, hasLocalData: false };
        })
      );

      sendResponse(
        res,
        200,
        true,
        'GitLab projects retrieved successfully',
        projectsWithStats,
        {
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: projectsWithStats.length,
            pages: Math.ceil(projectsWithStats.length / Number(limit)),
          },
          source: 'gitlab',
        }
      );
    } catch (error) {
      logger.error('Get GitLab projects error:', error);

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
          'GitLab access forbidden. Your token may need additional permissions (read_api scope required). Please reconnect your GitLab account.',
          [],
          {
            requiresGitLabAuth: true,
            scopeError: true,
          }
        );
        return;
      }

      throw error;
    }
  })
);

// List GitLab issues across all accessible projects
router.get(
  '/gitlab/issues',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      search,
      labels,
      page = '1',
      limit = '5',
      state = 'opened',
      status,
      projectId,
    } = req.query as any;
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

      let rawProjectIds = Array.isArray(projectId)
        ? projectId
        : typeof projectId === 'string'
          ? projectId.split(',').map((id: string) => id.trim())
          : [];

      // If no project IDs provided, fetch first 5 accessible projects
      if (rawProjectIds.length === 0) {
        try {
          const accessibleProjects = await gitlab.getProjects({
            membership: true,
            per_page: 5,
            page: 1,
          });
          rawProjectIds = accessibleProjects.map(project => String(project.id));
          logger.info(
            `No project IDs provided, using ${rawProjectIds.length} accessible projects for user ${userId}`
          );
        } catch (error) {
          logger.warn(
            'Failed to fetch accessible projects for issues, proceeding with empty filter:',
            error
          );
        }
      }

      const projectIdFilters = Array.from(new Set(rawProjectIds)).sort(
        (a, b) => a - b
      );

      const perPage = parseInt(limit as string, 10) || 5;
      const pageNum = parseInt(page as string, 10) || 1;

      const normalizedState = (() => {
        const rawState =
          typeof status === 'string' && status.length > 0 ? status : state;
        if (rawState === 'closed') return 'closed';
        if (rawState === 'all') return 'all';
        return 'opened';
      })();

      const labelString = typeof labels === 'string' ? labels : undefined;
      const selectedLabels = labelString
        ? labelString
            .split(',')
            .map((label: string) => label.trim())
            .filter(Boolean)
        : [];

      const hasMultipleLabels = selectedLabels.length > 1;

      const issues = await gitlab.getAllIssues({
        state: normalizedState as any,
        labels: labelString,
        labels_match_mode: hasMultipleLabels ? 'or' : 'and',
        search: (search as string) || undefined,
        per_page: perPage,
        page: pageNum,
        project_ids: projectIdFilters,
      });

      // Get unique project IDs from issues
      const uniqueProjectIds = Array.from(
        new Set(issues.map((it: any) => it.project_id).filter(Boolean))
      ).slice(0, 10); // Cap at 10 projects for reasonable response time

      // Fetch project metadata and labels concurrently
      const [projectDataResults, projectLabelsMap] = await Promise.all([
        Promise.allSettled(
          uniqueProjectIds.map(async pid => {
            try {
              const project = await gitlab.getProject(pid);
              return { pid, name: project.name };
            } catch {
              return { pid, name: 'Project' };
            }
          })
        ),
        gitlab.batchFetchProjectLabels(uniqueProjectIds),
      ]);

      // Process project metadata results
      const projectNameMap = new Map<number, string>();
      projectDataResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const { pid, name } = result.value;
          projectNameMap.set(pid, name);
        }
      });

      const items = issues.map((it: any) => ({
        id: String(it.id),
        number: it.iid,
        title: it.title,
        web_url: it.web_url,
        project: {
          id: String(it.project_id),
          name: projectNameMap.get(it.project_id) || 'Project',
          labels: projectLabelsMap.get(it.project_id) || [],
        },
        labels: Array.isArray(it.labels) ? it.labels : [],
        assignee:
          it.assignees && it.assignees[0]
            ? {
                id: String(it.assignees[0].id),
                name: it.assignees[0].name,
                avatarUrl: it.assignees[0].avatar_url,
                username: it.assignees[0].username,
              }
            : null,
        author: it.author
          ? {
              id: String(it.author.id),
              name: it.author.name,
              username: it.author.username,
            }
          : { id: '', name: 'Unknown' },
        createdAt: it.created_at,
      }));

      const nextCursor = items.length < perPage ? null : String(pageNum + 1);

      // Convert labels map to object for JSON response
      const projectLabels: Record<string, any[]> = {};
      projectLabelsMap.forEach((labels, projectId) => {
        projectLabels[String(projectId)] = labels;
      });

      console.log('LKEPQEQEQ');
      sendResponse(res, 200, true, 'GitLab issues fetched', {
        items,
        nextCursor,
        projectLabels, // Include all project labels for client-side use
      });
    } catch (error) {
      logger.error('Get GitLab issues error:', error);
      throw error;
    }
  })
);

// Get project by ID

// Import/sync GitLab project to local database

// Update project

// Delete project

// Get project users (for assignee dropdown)
router.get(
  '/:id/users',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const { search, per_page, page } = req.query;
    const userId = req.user!.id;

    try {
      // Get user's GitLab OAuth connection
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        throw new AuthorizationError('GitLab connection required');
      }

      // Initialize GitLab service with access token
      const gitlabService = new GitLabService(oauthConnection.access_token);

      // Fetch project members from GitLab with search support
      const gitlabMembers = await gitlabService.getProjectMembers(projectId, {
        search: search as string | undefined,
        per_page: per_page ? parseInt(per_page as string, 10) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
      });

      // Transform to match expected format
      const users = gitlabMembers.map(member => ({
        id: member.id.toString(),
        username: member.username,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatar_url,
        webUrl: member.web_url,
      }));

      sendResponse(
        res,
        200,
        true,
        'Project users retrieved successfully',
        users
      );
    } catch (error) {
      logger.error('Get project users error:', error);

      // Handle GitLab API errors gracefully
      if ((error as any).response?.status === 401) {
        sendResponse(
          res,
          401,
          false,
          'GitLab authentication failed. Please reconnect your GitLab account.',
          []
        );
        return;
      }

      if ((error as any).response?.status === 403) {
        sendResponse(res, 403, false, 'Access denied to GitLab project.', []);
        return;
      }

      // If project members fetch fails, return empty array as fallback
      sendResponse(
        res,
        200,
        true,
        'Could not fetch project users, using fallback',
        []
      );
    }
  })
);

// Helper functions
async function getProjectStats(projectId: string) {
  try {
    const [issueStats, recentActivity] = await Promise.all([
      // Issue statistics
      db
        .issues()
        .where('project_id', projectId)
        .select('status')
        .count('* as count')
        .groupBy('status'),

      // Recent activity count
      db
        .issues()
        .where('project_id', projectId)
        .where(
          'created_at',
          '>=',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        )
        .count('* as count')
        .first(),
    ]);

    const stats = {
      issues: issueStats.reduce((acc: any, item: any) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      recentIssues: parseInt(recentActivity?.count as string),
    };

    // Calculate totals
    stats.issues.total = Object.values(stats.issues).reduce(
      (a: any, b: any) => a + b,
      0
    );
    // recordings total removed

    return stats;
  } catch (error) {
    logger.error('Get project stats error:', error);
    return {};
  }
}

export { router as projectRouter };
