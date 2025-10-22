import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { createTwoFilesPatch } from 'diff';
import { randomUUID } from 'crypto';
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
import { redisService } from '../services/redis';

const router = Router();
const db = databaseService;
const openaiService = new OpenAIService();
const slackService = new SlackService();

const normalizeLineEndings = (value: string): string =>
  typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';

const ensureRedisAvailable = async (): Promise<boolean> => {
  if (redisService.isAvailable()) {
    return true;
  }
  try {
    await redisService.connect();
    return redisService.isAvailable();
  } catch (error) {
    logger.warn('Redis unavailable for MR fix operations:', error);
    return false;
  }
};

const buildSnippetResponse = (
  filePath: string,
  ref: string,
  lines: string[],
  highlightStart: number,
  highlightEnd: number,
  context: number = 2
) => {
  const safeHighlightStart = Math.max(highlightStart, 1);
  const highlightRangeValid = highlightEnd >= highlightStart;
  const safeHighlightEnd = highlightRangeValid
    ? Math.max(highlightEnd, safeHighlightStart)
    : safeHighlightStart;
  const startIndex = Math.max(safeHighlightStart - 1 - context, 0);
  const endIndex = Math.min(
    (highlightRangeValid ? safeHighlightEnd : safeHighlightStart) + context - 1,
    Math.max(lines.length - 1, 0)
  );
  const snippetLines = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    snippetLines.push({
      lineNumber: i + 1,
      content: lines[i] ?? '',
      highlight:
        highlightRangeValid &&
        i + 1 >= safeHighlightStart &&
        i + 1 <= safeHighlightEnd,
    });
  }
  return {
    path: filePath,
    ref,
    highlightStart: highlightRangeValid
      ? safeHighlightStart
      : safeHighlightStart,
    highlightEnd: highlightRangeValid ? safeHighlightEnd : safeHighlightStart,
    startLine:
      snippetLines.length > 0 ? snippetLines[0].lineNumber : safeHighlightStart,
    endLine:
      snippetLines.length > 0
        ? snippetLines[snippetLines.length - 1].lineNumber
        : safeHighlightStart,
    totalLines: lines.length,
    lines: snippetLines,
  };
};

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

      // Pass empty labels string to GitLab API
      const mergeRequest = await gitlab.createMergeRequest(pid, {
        ...gitlabPayload,
        labels: '',
      });

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

// Get notes (comments) for a merge request
router.get(
  '/:projectId/gitlab/merge-requests/:mrIid/notes',
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

      const notes = await gitlab.getMergeRequestNotes(pid, parseInt(mrIid, 10));

      sendResponse(res, 200, true, 'MR notes fetched successfully', {
        items: notes,
      });
    } catch (error: any) {
      logger.error('Failed to fetch MR notes:', error);
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to fetch MR notes'
      );
    }
  })
);

// Get code snippet for a diff note
router.get(
  '/:projectId/gitlab/merge-requests/:mrIid/note-snippet',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      filePath: Joi.string().required(),
      ref: Joi.string().required(),
      startLine: Joi.number().integer().min(1).required(),
      endLine: Joi.number().integer().min(1).required(),
      contextBefore: Joi.number().integer().min(0).max(20).default(2),
      contextAfter: Joi.number().integer().min(0).max(20).default(2),
    }),
    'query'
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, mrIid } = req.params;
    const {
      filePath,
      ref,
      startLine,
      endLine,
      contextBefore = 2,
      contextAfter = 2,
    } = req.query as Record<string, any>;

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

      const start = Number(startLine);
      const end = Number(endLine);
      const before = Math.min(Number(contextBefore), 20);
      const after = Math.min(Number(contextAfter), 20);

      const low = Math.min(start, end);
      const high = Math.max(start, end);

      const fileContent = await gitlab.getRepositoryFileContent(
        pid,
        String(filePath),
        String(ref)
      );

      const lines = fileContent.split(/\r?\n/);
      const snippetStartIndex = Math.max(low - 1 - before, 0);
      const snippetEndIndex = Math.min(high + after, lines.length);

      const snippetLines = [];
      for (let i = snippetStartIndex; i < snippetEndIndex; i += 1) {
        snippetLines.push({
          lineNumber: i + 1,
          content: lines[i] ?? '',
          highlight: i + 1 >= low && i + 1 <= high,
        });
      }

      sendResponse(res, 200, true, 'MR note snippet fetched successfully', {
        snippet: {
          path: String(filePath),
          ref: String(ref),
          highlightStart: low,
          highlightEnd: high,
          startLine: snippetStartIndex + 1,
          endLine: snippetEndIndex,
          totalLines: lines.length,
          lines: snippetLines,
        },
      });
    } catch (error: any) {
      logger.error('Failed to fetch MR note snippet:', {
        error: error?.message,
        stack: error?.stack,
      });
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to fetch MR note snippet'
      );
    }
  })
);

router.post(
  '/:projectId/gitlab/merge-requests/:mrIid/note-fix',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      filePath: Joi.string().required(),
      ref: Joi.string().required(),
      startLine: Joi.number().integer().min(1).required(),
      endLine: Joi.number().integer().min(1).required(),
      comment: Joi.string().min(1).required(),
      contextBefore: Joi.number().integer().min(0).max(20).default(2),
      contextAfter: Joi.number().integer().min(0).max(20).default(2),
      languageHint: Joi.string().optional(),
      additionalInstructions: Joi.string().allow('').max(2000).optional(),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, mrIid } = req.params;
    const {
      filePath,
      ref,
      startLine,
      endLine,
      comment,
      contextBefore = 2,
      contextAfter = 2,
      languageHint,
      additionalInstructions,
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

      const start = Number(startLine);
      const end = Number(endLine);
      const before = Math.min(Number(contextBefore), 20);
      const after = Math.min(Number(contextAfter), 20);

      const low = Math.min(start, end);
      const high = Math.max(start, end);

      const fileContent = await gitlab.getRepositoryFileContent(
        pid,
        String(filePath),
        String(ref)
      );

      const lines = fileContent.split(/\r?\n/);
      const snippetStartIndex = Math.max(low - 1 - before, 0);
      const snippetEndIndex = Math.min(high + after, lines.length);

      const snippetLines = [];
      const highlightedLines: string[] = [];
      for (let i = snippetStartIndex; i < snippetEndIndex; i += 1) {
        const codeLine = lines[i] ?? '';
        const lineNumber = i + 1;
        const isHighlight = lineNumber >= low && lineNumber <= high;
        snippetLines.push({
          lineNumber,
          content: codeLine,
          highlight: isHighlight,
        });
        if (isHighlight) {
          highlightedLines.push(codeLine);
        }
      }

      const contextForPrompt = snippetLines
        .map(line => {
          const marker = line.highlight ? '>>' : '  ';
          const formattedNumber = line.lineNumber.toString().padStart(4, ' ');
          return `${marker} ${formattedNumber} | ${line.content}`;
        })
        .join('\n');

      const highlightedBlock = highlightedLines.join('\n');

      const suggestion = await openaiService.generateCodeFixSuggestion({
        filePath: String(filePath),
        comment: String(comment),
        codeContext: contextForPrompt,
        highlightedBlock,
        highlightStart: low,
        highlightEnd: high,
        languageHint: languageHint ? String(languageHint) : undefined,
        additionalInstructions: additionalInstructions
          ? String(additionalInstructions)
          : undefined,
      });

      sendResponse(res, 200, true, 'MR fix generated successfully', {
        snippet: {
          path: String(filePath),
          ref: String(ref),
          highlightStart: low,
          highlightEnd: high,
          startLine: snippetStartIndex + 1,
          endLine: snippetEndIndex,
          totalLines: lines.length,
          lines: snippetLines,
        },
        fix: suggestion,
      });
    } catch (error: any) {
      logger.error('Failed to generate MR note fix:', {
        error: error?.message,
        stack: error?.stack,
      });
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to generate MR note fix'
      );
    }
  })
);

router.post(
  '/:projectId/gitlab/merge-requests/:mrIid/note-fix/apply',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      filePath: Joi.string().required(),
      ref: Joi.string().required(),
      startLine: Joi.number().integer().min(1).required(),
      endLine: Joi.number().integer().min(1).required(),
      originalCode: Joi.string().allow('').required(),
      updatedCode: Joi.string().allow('').required(),
      commitMessage: Joi.string().allow('').optional(),
      dryRun: Joi.boolean().default(false),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, mrIid } = req.params;
    const {
      filePath,
      ref,
      startLine,
      endLine,
      originalCode,
      updatedCode,
      commitMessage,
      dryRun = false,
    } = req.body;
    const userId = req.user!.id;

    const low = Number(startLine);
    const high = Number(endLine);

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
      const branchName = mergeRequest.source_branch;

      const branchInfo = await gitlab.getBranch(pid, branchName);
      const branchHead = branchInfo.commit?.id;

      if (branchHead && String(branchHead) !== String(ref)) {
        sendResponse(
          res,
          409,
          false,
          'The merge request branch has new commits. Regenerate the fix to continue.'
        );
        return;
      }

      const fileContent = await gitlab.getRepositoryFileContent(
        pid,
        String(filePath),
        branchName
      );

      const newline = fileContent.includes('\r\n') ? '\r\n' : '\n';
      const fileEndsWithNewline =
        fileContent.endsWith('\r\n') || fileContent.endsWith('\n');
      const fileLines = fileContent.split(/\r?\n/);
      const zeroBasedStart = low - 1;
      const zeroBasedEnd = high - 1;

      if (
        zeroBasedStart < 0 ||
        zeroBasedEnd < zeroBasedStart ||
        zeroBasedEnd >= fileLines.length
      ) {
        sendResponse(
          res,
          400,
          false,
          'Invalid line range for file replacement.'
        );
        return;
      }

      const existingBlock = fileLines
        .slice(zeroBasedStart, zeroBasedEnd + 1)
        .join('\n');
      if (
        normalizeLineEndings(existingBlock) !==
        normalizeLineEndings(originalCode)
      ) {
        sendResponse(
          res,
          409,
          false,
          'The target code has changed since the fix was generated. Please regenerate the fix.'
        );
        return;
      }

      const normalizedUpdatedCode = normalizeLineEndings(updatedCode);
      const updatedLinesRaw = normalizedUpdatedCode.split('\n');
      const updatedLineSegments =
        updatedLinesRaw.length === 1 && updatedLinesRaw[0] === ''
          ? []
          : updatedLinesRaw;

      const newLines = [
        ...fileLines.slice(0, zeroBasedStart),
        ...updatedLineSegments,
        ...fileLines.slice(zeroBasedEnd + 1),
      ];

      let updatedContent = newLines.join(newline);
      if (fileEndsWithNewline && !updatedContent.endsWith(newline)) {
        updatedContent += newline;
      }
      if (!fileEndsWithNewline && updatedContent.endsWith(newline)) {
        updatedContent = updatedContent.slice(0, -newline.length);
      }

      const diff = createTwoFilesPatch(
        String(filePath),
        String(filePath),
        normalizeLineEndings(fileContent),
        normalizeLineEndings(updatedContent),
        '',
        ''
      );

      const updatedStartLine = low;
      const updatedEndLine =
        updatedLineSegments.length === 0
          ? low - 1
          : low + updatedLineSegments.length - 1;

      const defaultCommitMessage = commitMessage?.trim()
        ? commitMessage.trim()
        : `fix: apply review suggestion to ${filePath}:${low}-${high}`;

      const previewSnippet = buildSnippetResponse(
        String(filePath),
        branchHead || String(ref),
        newLines,
        updatedStartLine,
        updatedEndLine
      );

      if (dryRun) {
        sendResponse(res, 200, true, 'MR fix preview generated successfully', {
          diff,
          commitMessage: defaultCommitMessage,
          snippet: previewSnippet,
        });
        return;
      }

      const commit = await gitlab.createCommit(pid, {
        branch: branchName,
        commitMessage: defaultCommitMessage,
        actions: [
          {
            action: 'update',
            file_path: String(filePath),
            content: updatedContent,
            last_commit_id: branchHead,
          },
        ],
        lastCommitId: branchHead,
      });

      const undoData = {
        projectId: pid,
        mrIid: parseInt(mrIid, 10),
        branch: branchName,
        filePath: String(filePath),
        startLine: low,
        endLine: high,
        updatedStartLine,
        updatedEndLine,
        originalCode: normalizeLineEndings(existingBlock),
        updatedCode: normalizedUpdatedCode,
        previousCommitId: branchHead,
        appliedCommitId: commit?.id,
      };

      let undoToken: string | null = null;
      if (await ensureRedisAvailable()) {
        try {
          undoToken = randomUUID();
          await redisService.set(
            `mr_fix_undo:${undoToken}`,
            undoData,
            3600 * 24
          );
        } catch (error) {
          logger.warn('Failed to store MR fix undo metadata:', error);
        }
      }

      const appliedSnippet = buildSnippetResponse(
        String(filePath),
        commit?.id || branchHead || String(ref),
        newLines,
        updatedStartLine,
        updatedEndLine
      );

      sendResponse(res, 200, true, 'MR fix applied successfully', {
        diff,
        commitMessage: defaultCommitMessage,
        commitSha: commit?.id,
        undoToken,
        snippet: appliedSnippet,
      });
    } catch (error: any) {
      logger.error('Failed to apply MR note fix:', {
        error: error?.message,
        stack: error?.stack,
      });
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to apply MR note fix'
      );
    }
  })
);

router.post(
  '/:projectId/gitlab/merge-requests/:mrIid/note-fix/undo',
  authMiddleware.authenticate,
  validateRequest(
    Joi.object({
      undoToken: Joi.string().required(),
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, mrIid } = req.params;
    const { undoToken } = req.body;
    const userId = req.user!.id;

    try {
      if (!(await ensureRedisAvailable())) {
        sendResponse(res, 503, false, 'Undo service is currently unavailable.');
        return;
      }

      const undoKey = `mr_fix_undo:${undoToken}`;
      const undoPayload = await redisService.get(undoKey);

      if (!undoPayload) {
        sendResponse(res, 404, false, 'Undo information not found or expired.');
        return;
      }

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
      const branchName = mergeRequest.source_branch;
      if (branchName !== undoPayload.branch) {
        sendResponse(
          res,
          409,
          false,
          'The merge request branch has changed since the fix was applied.'
        );
        return;
      }

      const branchInfo = await gitlab.getBranch(pid, branchName);
      const branchHead = branchInfo.commit?.id;

      if (
        undoPayload.appliedCommitId &&
        branchHead &&
        branchHead !== undoPayload.appliedCommitId
      ) {
        sendResponse(
          res,
          409,
          false,
          'New commits were pushed after the fix was applied. Undo is not available.'
        );
        return;
      }

      const fileContent = await gitlab.getRepositoryFileContent(
        pid,
        String(undoPayload.filePath),
        branchName
      );

      const newline = fileContent.includes('\r\n') ? '\r\n' : '\n';
      const fileEndsWithNewline =
        fileContent.endsWith('\r\n') || fileContent.endsWith('\n');
      const fileLines = fileContent.split(/\r?\n/);
      const updatedStartLine = Number(undoPayload.updatedStartLine);
      const updatedEndLine = Number(undoPayload.updatedEndLine);
      const zeroBasedStart = updatedStartLine - 1;
      const zeroBasedEnd = updatedEndLine - 1;
      const highlightRangeValid = updatedEndLine >= updatedStartLine;

      if (zeroBasedStart < 0 || zeroBasedStart > fileLines.length) {
        sendResponse(
          res,
          409,
          false,
          'The file layout has changed. Cannot undo automatically.'
        );
        return;
      }

      if (
        highlightRangeValid &&
        (zeroBasedEnd < zeroBasedStart || zeroBasedEnd >= fileLines.length)
      ) {
        sendResponse(
          res,
          409,
          false,
          'The file layout has changed. Cannot undo automatically.'
        );
        return;
      }

      const currentBlock = fileLines
        .slice(zeroBasedStart, zeroBasedEnd + 1)
        .join('\n');
      if (
        normalizeLineEndings(currentBlock) !==
        normalizeLineEndings(undoPayload.updatedCode || '')
      ) {
        sendResponse(
          res,
          409,
          false,
          'The file contents changed after applying the fix. Cannot undo automatically.'
        );
        return;
      }

      const originalSegments = normalizeLineEndings(
        undoPayload.originalCode || ''
      ).split('\n');
      const replacementSegments =
        originalSegments.length === 1 && originalSegments[0] === ''
          ? []
          : originalSegments;

      const tailIndex = highlightRangeValid
        ? updatedEndLine
        : updatedStartLine - 1;

      const newLines = [
        ...fileLines.slice(0, Number(undoPayload.startLine) - 1),
        ...replacementSegments,
        ...fileLines.slice(tailIndex),
      ];

      let updatedContent = newLines.join(newline);
      if (fileEndsWithNewline && !updatedContent.endsWith(newline)) {
        updatedContent += newline;
      }
      if (!fileEndsWithNewline && updatedContent.endsWith(newline)) {
        updatedContent = updatedContent.slice(0, -newline.length);
      }

      const diff = createTwoFilesPatch(
        String(undoPayload.filePath),
        String(undoPayload.filePath),
        normalizeLineEndings(fileContent),
        normalizeLineEndings(updatedContent),
        '',
        ''
      );

      const commit = await gitlab.createCommit(pid, {
        branch: branchName,
        commitMessage: `revert: undo AI fix for ${undoPayload.filePath}`,
        actions: [
          {
            action: 'update',
            file_path: String(undoPayload.filePath),
            content: updatedContent,
            last_commit_id: branchHead,
          },
        ],
        lastCommitId: branchHead,
      });

      try {
        await redisService.del(undoKey);
      } catch (error) {
        logger.warn('Failed to remove MR fix undo metadata:', error);
      }

      const revertSnippet = buildSnippetResponse(
        String(undoPayload.filePath),
        commit?.id || branchHead || '',
        newLines,
        Number(undoPayload.startLine),
        replacementSegments.length === 0
          ? Number(undoPayload.startLine) - 1
          : Number(undoPayload.startLine) + replacementSegments.length - 1
      );

      sendResponse(res, 200, true, 'MR fix reverted successfully', {
        diff,
        commitSha: commit?.id,
        snippet: revertSnippet,
      });
    } catch (error: any) {
      logger.error('Failed to undo MR note fix:', {
        error: error?.message,
        stack: error?.stack,
      });
      sendResponse(
        res,
        error.statusCode || 500,
        false,
        error.message || 'Failed to undo MR note fix'
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
