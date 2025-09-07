import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { databaseService } from '../services/database';
import { GitLabService } from '../services/gitlab';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// Rate limiting middleware removed to rely on upstream GitLab limits
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = databaseService;
const gitlabService = new GitLabService();

// Validation schemas
const createProjectSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).allow(''),
  gitlabProjectId: Joi.string(),
  settings: Joi.object({
    isPublic: Joi.boolean().default(false),
    allowGuestReporting: Joi.boolean().default(false),
    autoAssignIssues: Joi.boolean().default(false),
    defaultSeverity: Joi.string()
      .valid('critical', 'high', 'medium', 'low')
      .default('medium'),
    integrations: Joi.object({
      gitlab: Joi.object({
        enabled: Joi.boolean().default(false),
        projectId: Joi.string(),
        autoCreateIssues: Joi.boolean().default(false),
        labelPrefix: Joi.string().default('qa-'),
      }),
      slack: Joi.object({
        enabled: Joi.boolean().default(false),
        channelId: Joi.string(),
        notifyOnNewIssues: Joi.boolean().default(true),
        notifyOnStatusChange: Joi.boolean().default(true),
      }),
    }),
  }),
});

const updateProjectSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  description: Joi.string().max(500).allow(''),
  settings: Joi.object({
    isPublic: Joi.boolean(),
    allowGuestReporting: Joi.boolean(),
    autoAssignIssues: Joi.boolean(),
    defaultSeverity: Joi.string().valid('critical', 'high', 'medium', 'low'),
    integrations: Joi.object({
      gitlab: Joi.object({
        enabled: Joi.boolean(),
        projectId: Joi.string(),
        autoCreateIssues: Joi.boolean(),
        labelPrefix: Joi.string(),
      }),
      slack: Joi.object({
        enabled: Joi.boolean(),
        channelId: Joi.string(),
        notifyOnNewIssues: Joi.boolean(),
        notifyOnStatusChange: Joi.boolean(),
      }),
    }),
  }),
});

const addMemberSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  role: Joi.string()
    .valid('owner', 'maintainer', 'developer', 'reporter')
    .default('developer'),
});

const updateMemberSchema = Joi.object({
  role: Joi.string()
    .valid('owner', 'maintainer', 'developer', 'reporter')
    .required(),
});

// Create new project
router.post(
  '/',
  authMiddleware.authenticate,
  validateRequest(createProjectSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, gitlabProjectId, settings } = req.body;
    const userId = req.user!.id;

    try {
      // Start transaction
      const result = await db.transaction(async trx => {
        // Create team first
        const [team] = await trx('teams')
          .insert({
            name: `${name} Team`,
            description: `Team for ${name} project`,
          })
          .returning('*');

        // Create project
        const [project] = await trx('projects')
          .insert({
            name,
            description,
            gitlab_project_id: gitlabProjectId,
            team_id: team.id,
            settings: settings || {},
            created_by: userId,
          })
          .returning('*');

        // Add creator as team owner
        await trx('team_members').insert({
          team_id: team.id,
          user_id: userId,
          role: 'owner',
        });

        return { project, team };
      });

      // If GitLab integration is enabled, verify project access
      if (gitlabProjectId && settings?.integrations?.gitlab?.enabled) {
        try {
          await gitlabService.getProject(gitlabProjectId);
        } catch (error) {
          logger.warn(
            `GitLab project ${gitlabProjectId} not accessible`,
            error
          );
        }
      }

      logger.logUserAction('Project created', userId, {
        projectId: result.project.id,
        projectName: name,
      });

      sendResponse(res, 201, true, 'Project created successfully', {
        project: result.project,
        team: result.team,
      });
    } catch (error) {
      logger.error('Create project error:', error);
      throw error;
    }
  })
);

// List GitLab issues for a specific project (proxy)
router.get(
  '/:projectId/gitlab/issues',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params as any;
    const {
      search,
      labels,
      assigneeId,
      createdBy,
      page = '1',
      limit = '5',
      state = 'opened',
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

      // Resolve GitLab project ID (accept local UUID or GitLab numeric ID)
      let gitlabProjectId: string | number = projectId;
      if (!/^\d+$/.test(String(projectId))) {
        try {
          const localProject = await db
            .projects()
            .where('id', projectId)
            .first();
          if (localProject?.gitlab_project_id) {
            gitlabProjectId = localProject.gitlab_project_id;
          }
        } catch {}
      }

      const gitlab = new GitLabService(oauthConnection.access_token);

      // Determine author
      let author_id: number | undefined;
      if (createdBy && createdBy !== 'any') {
        if (createdBy === 'me') {
          try {
            const me = await gitlab.authenticate(oauthConnection.access_token);
            author_id = me.id;
          } catch {}
        } else {
          const parsed = parseInt(createdBy as string, 10);
          if (!isNaN(parsed)) author_id = parsed;
        }
      }

      let assignee_id: number | undefined;
      if (assigneeId && assigneeId !== 'unassigned') {
        const parsed = parseInt(assigneeId as string, 10);
        if (!isNaN(parsed)) assignee_id = parsed;
      }

      const perPage = parseInt(limit as string, 10) || 5;
      const pageNum = parseInt(page as string, 10) || 1;

      const issues = await gitlab.getIssues(gitlabProjectId, {
        state: (state as any) || 'opened',
        labels: labels as string | undefined,
        assignee_id,
        author_id,
        search: (search as string) || undefined,
        per_page: perPage,
        page: pageNum,
      });

      // Fetch project name for display
      let projectName = 'Project';
      try {
        const project = await gitlab.getProject(gitlabProjectId);
        projectName = project.name;
      } catch {}

      const items = issues.map((it: any) => ({
        id: String(it.id),
        number: it.iid,
        title: it.title,
        project: { id: String(gitlabProjectId), name: projectName },
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
      sendResponse(res, 200, true, 'GitLab issues fetched', {
        items,
        nextCursor,
      });
    } catch (error) {
      logger.error('Get GitLab project issues error:', error);
      throw error;
    }
  })
);

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
          childDescriptions.map(description =>
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
      const msg = error?.message || 'Failed to fetch notes from GitLab';
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
          recordings: { total: 0 },
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
      assigneeId,
      createdBy,
      page = '1',
      limit = '5',
      state = 'opened',
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

      // Determine author scope
      let author_id: number | undefined;
      let scope: 'created_by_me' | 'assigned_to_me' | 'all' | undefined;
      if (createdBy && createdBy !== 'any') {
        if (createdBy === 'me') {
          scope = 'created_by_me';
        } else {
          const parsed = parseInt(createdBy as string, 10);
          if (!isNaN(parsed)) author_id = parsed;
        }
      }

      let assignee_id: number | undefined;
      if (assigneeId && assigneeId !== 'unassigned') {
        const parsed = parseInt(assigneeId as string, 10);
        if (!isNaN(parsed)) assignee_id = parsed;
      }

      const perPage = parseInt(limit as string, 10) || 5;
      const pageNum = parseInt(page as string, 10) || 1;

      const issues = await gitlab.getAllIssues({
        state: (state as any) || 'opened',
        labels: labels as string | undefined,
        assignee_id,
        author_id,
        search: (search as string) || undefined,
        per_page: perPage,
        page: pageNum,
        ...(scope ? ({ scope } as any) : {}),
      } as any);

      // Resolve project names (basic cache)
      const projectNameMap = new Map<number, string>();
      const uniqueProjectIds = Array.from(
        new Set(issues.map((it: any) => it.project_id).filter(Boolean))
      );
      for (const pid of uniqueProjectIds.slice(0, 10)) {
        // basic cap
        try {
          const proj = await gitlab.getProject(pid);
          projectNameMap.set(pid, proj.name);
        } catch {}
      }

      const items = issues.map((it: any) => ({
        id: String(it.id),
        number: it.iid,
        title: it.title,
        project: {
          id: String(it.project_id),
          name: projectNameMap.get(it.project_id) || 'Project',
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
      sendResponse(res, 200, true, 'GitLab issues fetched', {
        items,
        nextCursor,
      });
    } catch (error) {
      logger.error('Get GitLab issues error:', error);
      throw error;
    }
  })
);

// Get project by ID
router.get(
  '/:id',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const userId = req.user!.id;

    try {
      // First try to get from local database
      const localProject = await db
        .projects()
        .join('teams', 'projects.team_id', 'teams.id')
        .join('team_members', 'teams.id', 'team_members.team_id')
        .where('projects.id', projectId)
        .where('team_members.user_id', userId)
        .select([
          'projects.*',
          'teams.name as team_name',
          'team_members.role as member_role',
        ])
        .first();

      if (localProject) {
        // Local project found - return with full stats and members
        const stats = await getProjectStats(projectId);
        const members = await db
          .teamMembers()
          .join('users', 'team_members.user_id', 'users.id')
          .where('team_members.team_id', localProject.team_id)
          .select([
            'users.id',
            'users.username',
            'users.full_name',
            'users.avatar_url',
            'team_members.role',
            'team_members.created_at',
          ]);

        sendResponse(res, 200, true, 'Project retrieved successfully', {
          project: {
            ...localProject,
            stats,
            members,
            source: 'local',
          },
        });
        return;
      }

      // If not found locally, try to get from GitLab
      const oauthConnection = await db
        .getConnection()
        .select('*')
        .from('oauth_connections')
        .where('user_id', userId)
        .where('provider', 'gitlab')
        .first();

      if (!oauthConnection || !oauthConnection.access_token) {
        throw new NotFoundError('Project');
      }

      // Try to fetch from GitLab (projectId might be GitLab project ID)
      const gitlabService = new GitLabService(oauthConnection.access_token);

      try {
        const gitlabProject = await gitlabService.getProject(projectId);

        // Get project members from GitLab
        const gitlabMembers = await gitlabService.getProjectMembers(projectId);

        // Transform GitLab project data
        const transformedProject = {
          id: gitlabProject.id.toString(),
          name: gitlabProject.name,
          description: gitlabProject.description || '',
          slug: gitlabProject.path,
          web_url: gitlabProject.web_url,
          avatar_url: gitlabProject.avatar_url,
          default_branch: gitlabProject.default_branch,
          path_with_namespace: gitlabProject.path_with_namespace,
          gitlab_project_id: gitlabProject.id,
          team_name: 'GitLab',
          member_role: 'developer',
          status: 'active',
          source: 'gitlab',
          stats: {
            issues: { total: 0 },
            recordings: { total: 0 },
            recentIssues: 0,
          },
          members: gitlabMembers.map(member => ({
            id: member.id.toString(),
            username: member.username,
            full_name: member.name,
            avatar_url: member.avatar_url,
            role: 'developer',
            created_at: new Date().toISOString(),
          })),
        };

        sendResponse(res, 200, true, 'GitLab project retrieved successfully', {
          project: transformedProject,
        });
      } catch (gitlabError) {
        logger.error('GitLab project fetch error:', gitlabError);
        throw new NotFoundError('Project');
      }
    } catch (error) {
      logger.error('Get project error:', error);
      throw error;
    }
  })
);

// Import/sync GitLab project to local database
router.post(
  '/import/:gitlabProjectId',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { gitlabProjectId } = req.params;
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

      // Check if project already exists in local database
      const existingProject = await db
        .projects()
        .where('gitlab_project_id', gitlabProjectId)
        .first();

      if (existingProject) {
        throw new ConflictError('Project already imported');
      }

      // Fetch project from GitLab
      const gitlabService = new GitLabService(oauthConnection.access_token);
      const gitlabProject = await gitlabService.getProject(gitlabProjectId);

      // Start transaction
      const result = await db.transaction(async trx => {
        // Create team for the project
        const [team] = await trx('teams')
          .insert({
            name: `${gitlabProject.name} Team`,
            description: `Imported from GitLab project: ${gitlabProject.path_with_namespace}`,
            slug: `${gitlabProject.path}-team`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-'),
            owner_id: userId,
          })
          .returning('*');

        // Create local project
        const [project] = await trx('projects')
          .insert({
            name: gitlabProject.name,
            description: gitlabProject.description,
            slug: gitlabProject.path,
            team_id: team.id,
            owner_id: userId,
            gitlab_project_id: gitlabProject.id,
            gitlab_project_path: gitlabProject.path_with_namespace,
            repository_url: gitlabProject.web_url,
            settings: {
              integrations: {
                gitlab: {
                  enabled: true,
                  projectId: gitlabProject.id,
                  autoCreateIssues: false,
                  labelPrefix: 'qa-',
                },
              },
            },
          })
          .returning('*');

        // Add user to team as owner
        await trx('team_members').insert({
          team_id: team.id,
          user_id: userId,
          role: 'admin',
        });

        // Add user to project as admin
        await trx('project_members').insert({
          project_id: project.id,
          user_id: userId,
          role: 'admin',
        });

        return { project, team };
      });

      logger.logUserAction('GitLab project imported', userId, {
        projectId: result.project.id,
        gitlabProjectId,
        projectName: gitlabProject.name,
      });

      sendResponse(res, 201, true, 'GitLab project imported successfully', {
        project: result.project,
        team: result.team,
        gitlab: {
          id: gitlabProject.id,
          name: gitlabProject.name,
          path_with_namespace: gitlabProject.path_with_namespace,
          web_url: gitlabProject.web_url,
        },
      });
    } catch (error) {
      logger.error('Import GitLab project error:', error);
      throw error;
    }
  })
);

// Update project
router.put(
  '/:id',
  authMiddleware.authenticate,
  validateRequest(updateProjectSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const updateData = req.body;
    const userId = req.user!.id;

    try {
      // Check if user has maintainer/owner access
      const memberRole = await getUserProjectRole(userId, projectId);
      if (!memberRole || !['owner', 'maintainer'].includes(memberRole)) {
        throw new AuthorizationError(
          'Insufficient permissions to update project'
        );
      }

      const [updatedProject] = await db
        .projects()
        .where('id', projectId)
        .update({
          ...updateData,
          updated_at: new Date(),
        })
        .returning('*');

      if (!updatedProject) {
        throw new NotFoundError('Project');
      }

      logger.logUserAction('Project updated', userId, {
        projectId,
        changes: updateData,
      });

      // Broadcast update to project members
      // TODO: Get WebSocketService instance from server
      // const websocketService = new WebSocketService();
      // await websocketService.broadcastProjectEvent({
      //   type: 'settings_updated',
      //   projectId,
      //   data: updateData,
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 200, true, 'Project updated successfully', {
        project: updatedProject,
      });
    } catch (error) {
      logger.error('Update project error:', error);
      throw error;
    }
  })
);

// Delete project
router.delete(
  '/:id',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const userId = req.user!.id;

    try {
      // Check if user is project owner
      const memberRole = await getUserProjectRole(userId, projectId);
      if (memberRole !== 'owner') {
        throw new AuthorizationError('Only project owners can delete projects');
      }

      // Soft delete the project (in case we need to recover)
      await db.projects().where('id', projectId).update({
        is_active: false,
        deleted_at: new Date(),
        updated_at: new Date(),
      });

      logger.logAudit('Project deleted', userId, 'project', { projectId });

      sendResponse(res, 200, true, 'Project deleted successfully');
    } catch (error) {
      logger.error('Delete project error:', error);
      throw error;
    }
  })
);

// Get project users (for assignee dropdown)
router.get(
  '/:id/users',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
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

      // Fetch project members from GitLab
      const gitlabMembers = await gitlabService.getProjectMembers(projectId);

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

// Get project members
router.get(
  '/:id/members',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const userId = req.user!.id;

    try {
      // Check if user has access to this project
      const hasAccess = await getUserProjectRole(userId, projectId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this project');
      }

      const members = await db
        .teamMembers()
        .join('users', 'team_members.user_id', 'users.id')
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .where('projects.id', projectId)
        .select([
          'users.id',
          'users.username',
          'users.full_name',
          'users.avatar_url',
          'users.email',
          'team_members.role',
          'team_members.created_at as joined_at',
        ]);

      sendResponse(res, 200, true, 'Project members retrieved successfully', {
        members,
      });
    } catch (error) {
      logger.error('Get project members error:', error);
      throw error;
    }
  })
);

// Add team member
router.post(
  '/:id/members',
  authMiddleware.authenticate,
  validateRequest(addMemberSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId } = req.params;
    const { userId: newMemberId, role } = req.body;
    const currentUserId = req.user!.id;

    try {
      // Check if current user has permission to add members
      const currentUserRole = await getUserProjectRole(
        currentUserId,
        projectId
      );
      if (
        !currentUserRole ||
        !['owner', 'maintainer'].includes(currentUserRole)
      ) {
        throw new AuthorizationError('Insufficient permissions to add members');
      }

      // Get project team ID
      const project = await db
        .projects()
        .where('id', projectId)
        .select('team_id')
        .first();

      if (!project) {
        throw new NotFoundError('Project');
      }

      // Check if user is already a member
      const existingMember = await db
        .teamMembers()
        .where('team_id', project.team_id)
        .where('user_id', newMemberId)
        .first();

      if (existingMember) {
        throw new ConflictError('User is already a project member');
      }

      // Verify the user exists
      const userExists = await db
        .users()
        .where('id', newMemberId)
        .where('is_active', true)
        .first();

      if (!userExists) {
        throw new NotFoundError('User');
      }

      // Add member
      await db.teamMembers().insert({
        team_id: project.team_id,
        user_id: newMemberId,
        role,
      });

      logger.logUserAction('Member added to project', currentUserId, {
        projectId,
        newMemberId,
        role,
      });

      // Broadcast to project members
      // TODO: Get WebSocketService instance from server
      // const websocketService = new WebSocketService();
      // await websocketService.broadcastProjectEvent({
      //   type: 'member_added',
      //   projectId,
      //   data: {
      //     userId: newMemberId,
      //     role,
      //     addedBy: currentUserId
      //   },
      //   userId: currentUserId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 201, true, 'Member added successfully');
    } catch (error) {
      logger.error('Add project member error:', error);
      throw error;
    }
  })
);

// Update member role
router.put(
  '/:id/members/:userId',
  authMiddleware.authenticate,
  validateRequest(updateMemberSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId, userId: memberId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user!.id;

    try {
      // Check permissions
      const currentUserRole = await getUserProjectRole(
        currentUserId,
        projectId
      );
      if (
        !currentUserRole ||
        !['owner', 'maintainer'].includes(currentUserRole)
      ) {
        throw new AuthorizationError(
          'Insufficient permissions to update member roles'
        );
      }

      // Can't change owner role unless you're an owner
      if (role === 'owner' && currentUserRole !== 'owner') {
        throw new AuthorizationError('Only owners can assign owner role');
      }

      // Get project team ID
      const project = await db
        .projects()
        .where('id', projectId)
        .select('team_id')
        .first();

      if (!project) {
        throw new NotFoundError('Project');
      }

      // Update member role
      const updated = await db
        .teamMembers()
        .where('team_id', project.team_id)
        .where('user_id', memberId)
        .update({
          role,
          updated_at: new Date(),
        })
        .returning('*');

      if (!updated || updated.length === 0) {
        throw new NotFoundError('Project member');
      }

      logger.logUserAction('Member role updated', currentUserId, {
        projectId,
        memberId,
        newRole: role,
      });

      sendResponse(res, 200, true, 'Member role updated successfully');
    } catch (error) {
      logger.error('Update member role error:', error);
      throw error;
    }
  })
);

// Remove team member
router.delete(
  '/:id/members/:userId',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: projectId, userId: memberId } = req.params;
    const currentUserId = req.user!.id;

    try {
      // Check permissions (owners/maintainers can remove others, users can remove themselves)
      const currentUserRole = await getUserProjectRole(
        currentUserId,
        projectId
      );
      const isRemovingSelf = currentUserId === memberId;

      if (
        !isRemovingSelf &&
        (!currentUserRole || !['owner', 'maintainer'].includes(currentUserRole))
      ) {
        throw new AuthorizationError(
          'Insufficient permissions to remove members'
        );
      }

      // Get project team ID
      const project = await db
        .projects()
        .where('id', projectId)
        .select('team_id')
        .first();

      if (!project) {
        throw new NotFoundError('Project');
      }

      // Check if member exists
      const member = await db
        .teamMembers()
        .where('team_id', project.team_id)
        .where('user_id', memberId)
        .first();

      if (!member) {
        throw new NotFoundError('Project member');
      }

      // Don't allow removing the last owner
      if (member.role === 'owner') {
        const ownerCount = await db
          .teamMembers()
          .where('team_id', project.team_id)
          .where('role', 'owner')
          .count('* as count')
          .first();

        if (parseInt(ownerCount?.count as string) === 1) {
          throw new ValidationError('Cannot remove the last project owner');
        }
      }

      // Remove member
      await db
        .teamMembers()
        .where('team_id', project.team_id)
        .where('user_id', memberId)
        .del();

      logger.logUserAction('Member removed from project', currentUserId, {
        projectId,
        removedMemberId: memberId,
        isRemovingSelf,
      });

      // Broadcast to project members
      // TODO: Get WebSocketService instance from server
      // const websocketService = new WebSocketService();
      // await websocketService.broadcastProjectEvent({
      //   type: 'member_removed',
      //   projectId,
      //   data: {
      //     userId: memberId,
      //     removedBy: currentUserId
      //   },
      //   userId: currentUserId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 200, true, 'Member removed successfully');
    } catch (error) {
      logger.error('Remove project member error:', error);
      throw error;
    }
  })
);

// Helper functions
async function getUserProjectRole(
  userId: string,
  projectId: string
): Promise<string | null> {
  try {
    const result = await db
      .teamMembers()
      .join('projects', 'team_members.team_id', 'projects.team_id')
      .where('projects.id', projectId)
      .where('team_members.user_id', userId)
      .select('team_members.role')
      .first();

    return result ? result.role : null;
  } catch (error) {
    logger.error('Get user project role error:', error);
    return null;
  }
}

async function getProjectStats(projectId: string) {
  try {
    const [issueStats, recordingStats, recentActivity] = await Promise.all([
      // Issue statistics
      db
        .issues()
        .where('project_id', projectId)
        .select('status')
        .count('* as count')
        .groupBy('status'),

      // Recording statistics
      db
        .recordings()
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
      recordings: recordingStats.reduce((acc: any, item: any) => {
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
    stats.recordings.total = Object.values(stats.recordings).reduce(
      (a: any, b: any) => a + b,
      0
    );

    return stats;
  } catch (error) {
    logger.error('Get project stats error:', error);
    return {};
  }
}

export { router as projectRouter };
