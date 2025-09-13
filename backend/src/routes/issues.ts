import { Router, Request, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import { databaseService } from '../services/database';
import { OpenAIService } from '../services/openai';
import { GitLabService } from '../services/gitlab';
import { SlackService } from '../services/slack';
import { WebSocketService } from '../services/websocket';
import { AssignmentService } from '../services/assignment';
import { DuplicateDetectionService } from '../services/duplicateDetection';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// Rate limiting middleware removed to rely on upstream GitLab limits
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const router = Router();
const db = databaseService;
const openaiService = new OpenAIService();
const gitlabService = new GitLabService();
const slackService = new SlackService();
// WebSocketService will be initialized later with the server instance
let websocketService: WebSocketService | null = null;
const assignmentService = new AssignmentService();
const duplicateDetectionService = new DuplicateDetectionService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/', 'video/', 'text/', 'application/json'];
    if (allowedTypes.some(type => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Validation schemas
const createIssueSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(5000).required(),
  projectId: Joi.string().uuid().required(),
  // recordingId removed
  severity: Joi.string().valid('critical', 'high', 'medium', 'low'),
  priority: Joi.string().valid('urgent', 'high', 'normal', 'low'),
  acceptanceCriteria: Joi.array().items(Joi.string().max(500)),
  labels: Joi.array().items(Joi.string().max(50)),
  assigneeId: Joi.string().uuid(),
  // Optional Slack notifications
  slackChannelId: Joi.string().allow('', null),
  slackUserIds: Joi.array().items(Joi.string()).optional(),
  checkDuplicates: Joi.boolean().default(true),
  browserInfo: Joi.object({
    url: Joi.string().uri().required(),
    title: Joi.string().required(),
    userAgent: Joi.string().required(),
    viewport: Joi.object({
      width: Joi.number().required(),
      height: Joi.number().required(),
    }),
  }),
  errorDetails: Joi.object({
    message: Joi.string().required(),
    stack: Joi.string(),
    type: Joi.string().required(),
  }),
  reproductionSteps: Joi.array().items(Joi.string().max(500)),
  expectedBehavior: Joi.string().max(1000),
  actualBehavior: Joi.string().max(1000),
  useAI: Joi.boolean().default(false),
});

const updateIssueSchema = Joi.object({
  title: Joi.string().min(5).max(200),
  description: Joi.string().min(10).max(5000),
  status: Joi.string().valid(
    'draft',
    'submitted',
    'in_progress',
    'resolved',
    'closed'
  ),
  severity: Joi.string().valid('critical', 'high', 'medium', 'low'),
  priority: Joi.string().valid('urgent', 'high', 'normal', 'low'),
  acceptanceCriteria: Joi.array().items(Joi.string().max(500)),
  labels: Joi.array().items(Joi.string().max(50)),
  assigneeId: Joi.string().uuid().allow(null),
});

const searchIssuesSchema = Joi.object({
  query: Joi.string().max(100),
  projectId: Joi.string().uuid(),
  status: Joi.string().valid(
    'draft',
    'submitted',
    'in_progress',
    'resolved',
    'closed'
  ),
  severity: Joi.string().valid('critical', 'high', 'medium', 'low'),
  priority: Joi.string().valid('urgent', 'high', 'normal', 'low'),
  assigneeId: Joi.string().uuid(),
  createdBy: Joi.string().uuid(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('created_at', 'updated_at', 'severity', 'priority', 'title')
    .default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const commentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
  isInternal: Joi.boolean().default(false),
});

const generateFromContextSchema = Joi.object({
  url: Joi.string().uri().required(),
  title: Joi.string().required(),
  userAgent: Joi.string(),
  viewport: Joi.object({
    width: Joi.number(),
    height: Joi.number(),
  }),
  errorDetails: Joi.object({
    message: Joi.string(),
    stack: Joi.string(),
    type: Joi.string(),
  }),
  userDescription: Joi.string(),
  reproductionSteps: Joi.array().items(Joi.string()),
  screenshots: Joi.array().items(Joi.string()),
  consoleErrors: Joi.array(),
  networkErrors: Joi.array(),
  expectedBehavior: Joi.string(),
  actualBehavior: Joi.string(),
});

// Create new issue
router.post(
  '/',
  authMiddleware.authenticate,
  upload.array('attachments', 5),
  validateRequest(createIssueSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const issueData = req.body;
    const userId = req.user!.id;
    const files = req.files as Express.Multer.File[];

    try {
      // Verify user has access to the project
      const hasAccess = await verifyProjectAccess(userId, issueData.projectId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this project');
      }

      // Process attachments
      let attachments: any[] = [];
      if (files && files.length > 0) {
        attachments = await processAttachments(files);
      }

      let aiGeneratedData: any = {};

      // Use AI to enhance issue if requested
      if (issueData.useAI) {
        try {
          // Generate enhanced issue description and classification
          const aiRequest = {
            browserInfo: issueData.browserInfo,
            errorDetails: issueData.errorDetails,
            userDescription: issueData.description,
            reproductionSteps: issueData.reproductionSteps,
            expectedBehavior: issueData.expectedBehavior,
            actualBehavior: issueData.actualBehavior,
            screenshots: attachments
              .filter(a => a.type === 'image')
              .map(a => a.url),
          };

          const generatedIssue =
            await openaiService.generateIssueFromContext(aiRequest);

          // Use AI suggestions if user didn't specify values
          aiGeneratedData = {
            title: issueData.title || generatedIssue.title,
            description: generatedIssue.description || issueData.description,
            severity: issueData.severity || generatedIssue.severity,
            priority: issueData.priority || generatedIssue.priority,
            acceptanceCriteria:
              issueData.acceptanceCriteria || generatedIssue.acceptanceCriteria,
            labels: [
              ...(issueData.labels || []),
              ...(generatedIssue.labels || []),
            ],
          };

          logger.logUserAction('AI issue generation', userId, {
            originalTitle: issueData.title,
            aiTitle: generatedIssue.title,
            aiSeverity: generatedIssue.severity,
          });
        } catch (aiError) {
          logger.error('AI issue generation failed:', aiError);
          // Continue without AI enhancement
        }
      }

      // Check for duplicates before creating
      let duplicateCheck = null;
      if (issueData.checkDuplicates !== false) {
        // Allow bypass with explicit false
        try {
          const duplicateRequest = {
            title: aiGeneratedData.title || issueData.title,
            description: aiGeneratedData.description || issueData.description,
            projectId: issueData.projectId,
            errorDetails: issueData.errorDetails,
            browserInfo: issueData.browserInfo,
            labels: aiGeneratedData.labels || issueData.labels,
          };
          duplicateCheck =
            await duplicateDetectionService.detectDuplicates(duplicateRequest);

          // If high confidence duplicate found, suggest linking instead
          if (duplicateCheck.isDuplicate && duplicateCheck.confidence > 0.85) {
            return sendResponse(
              res,
              409,
              false,
              'Potential duplicate detected',
              {
                duplicateCheck,
                suggestedAction: 'link_to_existing',
              }
            );
          }
        } catch (duplicateError) {
          logger.warn(
            'Duplicate detection failed, proceeding with creation:',
            duplicateError
          );
        }
      }

      // Determine assignee using auto-assignment if not specified
      let assigneeId = issueData.assigneeId;
      if (!assigneeId) {
        try {
          const assignmentContext = {
            projectId: issueData.projectId,
            title: aiGeneratedData.title || issueData.title,
            description: aiGeneratedData.description || issueData.description,
            severity:
              aiGeneratedData.severity || issueData.severity || 'medium',
            labels: aiGeneratedData.labels || issueData.labels || [],
            affectedComponents: aiGeneratedData.affectedComponents,
            errorDetails: issueData.errorDetails,
            browserInfo: issueData.browserInfo,
          };
          assigneeId =
            await assignmentService.autoAssignIssue(assignmentContext);
        } catch (assignmentError) {
          logger.warn(
            'Auto-assignment failed, proceeding without assignee:',
            assignmentError
          );
        }
      }

      // Create the issue
      const finalIssueData = {
        title: aiGeneratedData.title || issueData.title,
        description: aiGeneratedData.description || issueData.description,
        project_id: issueData.projectId,
        user_id: userId,
        severity: aiGeneratedData.severity || issueData.severity || 'medium',
        priority: aiGeneratedData.priority || issueData.priority || 'normal',
        status: 'draft',
        acceptance_criteria:
          aiGeneratedData.acceptanceCriteria ||
          issueData.acceptanceCriteria ||
          [],
        labels: aiGeneratedData.labels || issueData.labels || [],
        assignee_id: assigneeId,
        attachments,
        metadata: {
          browserInfo: issueData.browserInfo,
          errorDetails: issueData.errorDetails,
          reproductionSteps: issueData.reproductionSteps,
          expectedBehavior: issueData.expectedBehavior,
          actualBehavior: issueData.actualBehavior,
          aiGenerated: !!issueData.useAI,
          autoAssigned: !!assigneeId && !issueData.assigneeId,
          duplicateCheck: duplicateCheck
            ? {
                checked: true,
                confidence: duplicateCheck.confidence,
                candidatesFound: duplicateCheck.candidates.length,
              }
            : { checked: false },
          ...(aiGeneratedData.estimatedEffort && {
            estimatedEffort: aiGeneratedData.estimatedEffort,
          }),
          ...(aiGeneratedData.affectedComponents && {
            affectedComponents: aiGeneratedData.affectedComponents,
          }),
        },
      };

      const [issue] = await db.issues().insert(finalIssueData).returning('*');

      // Get complete issue with related data
      const completeIssue = await getIssueWithDetails(issue.id);

      // Optional Slack notify to a channel (mentions optional)
      try {
        const slackChannelId: string | undefined = issueData.slackChannelId;
        const slackUserIds: string[] | undefined = issueData.slackUserIds;
        if (
          slackChannelId &&
          typeof slackChannelId === 'string' &&
          slackChannelId.trim().length > 0
        ) {
          const tokens = await slackService.getUserTokens(userId);
          const accessToken =
            tokens?.accessToken || process.env.SLACK_BOT_TOKEN;
          if (accessToken) {
            const mentionText =
              Array.isArray(slackUserIds) && slackUserIds.length > 0
                ? slackUserIds.map((id: string) => `<@${id}>`).join(' ')
                : '';
            const issueUrl = `${process.env.FRONTEND_URL || ''}/issues/${issue.id}`;
            const text =
              `New issue: ${issue.title} ${issueUrl} ${mentionText}`.trim();

            // Post summary to channel
            const postResp = await slackService.sendMessage(accessToken, {
              channel: slackChannelId,
              text,
            });

            const threadTs = postResp?.ts;
            // If attachments include images or videos, add a thread reply with references
            const media = (attachments || []).filter(
              (a: any) => a.type === 'image' || a.type === 'video'
            );
            if (threadTs && media.length > 0) {
              const imageBlocks = media
                .filter((m: any) => m.type === 'image')
                .slice(0, 10) // avoid excessively long messages
                .map((m: any) => ({
                  type: 'image',
                  image_url:
                    `${process.env.BACKEND_PUBLIC_URL || ''}${m.url}`.replace(
                      /\/$/,
                      ''
                    ),
                  alt_text: m.filename || 'issue image',
                }));
              const videoLinks = media
                .filter((m: any) => m.type === 'video')
                .map(
                  (m: any) => `${process.env.BACKEND_PUBLIC_URL || ''}${m.url}`
                );

              const blocks: any[] = [];
              if (videoLinks.length > 0) {
                blocks.push({
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `Video attachment${videoLinks.length > 1 ? 's' : ''}:\n${videoLinks
                      .map((v: string) => `• ${v}`)
                      .join('\n')}`,
                  },
                });
              }
              blocks.push(...imageBlocks);

              await slackService.sendMessage(accessToken, {
                channel: slackChannelId,
                threadTs,
                text: 'Related attachments',
                ...(blocks.length > 0 ? { blocks } : {}),
              });
            }
          } else {
            logger.warn(
              'Slack tokens not found for user; skipping Slack notify'
            );
          }
        }
      } catch (slackErr) {
        logger.error('Issue Slack notify error:', slackErr);
        // Do not block issue creation on Slack errors
      }

      // Record assignment in history if auto-assigned
      if (assigneeId && !issueData.assigneeId) {
        await assignmentService.recordAssignment(
          issue.id,
          issueData.projectId,
          assigneeId,
          userId,
          'auto_assignment'
        );
      }

      logger.logUserAction('Issue created', userId, {
        issueId: issue.id,
        projectId: issueData.projectId,
        useAI: !!issueData.useAI,
        autoAssigned: !!assigneeId && !issueData.assigneeId,
        assigneeId,
      });

      // Broadcast to project members
      // TODO: Get WebSocketService instance from server
      // await websocketService?.broadcastProjectEvent({
      //   type: 'issue_created',
      //   projectId: issueData.projectId,
      //   data: completeIssue,
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 201, true, 'Issue created successfully', {
        issue: completeIssue,
      });
    } catch (error) {
      logger.error('Create issue error:', error);
      throw error;
    }
  })
);

// Submit issue (move from draft to submitted)
router.post(
  '/:id/submit',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: issueId } = req.params;
    const userId = req.user!.id;

    try {
      // Verify ownership or project access
      const issue = await db
        .issues()
        .where('id', issueId)
        .where('user_id', userId)
        .first();

      if (!issue) {
        throw new NotFoundError('Issue');
      }

      if (issue.status !== 'draft') {
        throw new ValidationError('Issue is not in draft status');
      }

      // Update status
      const [updatedIssue] = await db
        .issues()
        .where('id', issueId)
        .update({
          status: 'submitted',
          updated_at: new Date(),
        })
        .returning('*');

      const completeIssue = await getIssueWithDetails(issueId);

      // Handle integrations
      await handleIssueIntegrations(completeIssue, 'submitted');

      logger.logUserAction('Issue submitted', userId, { issueId });

      // Broadcast update
      // await websocketService?.broadcastIssueEvent({
      //   type: 'updated',
      //   issueId,
      //   data: { status: 'submitted' },
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 200, true, 'Issue submitted successfully', {
        issue: completeIssue,
      });
    } catch (error) {
      logger.error('Submit issue error:', error);
      throw error;
    }
  })
);

// Get issues with filtering and pagination
router.get(
  '/',
  authMiddleware.authenticate,
  validateRequest(searchIssuesSchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      projectId,
      status,
      severity,
      priority,
      assigneeId,
      createdBy,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query as any;
    const userId = req.user!.id;
    console.log('MOOOOOO');
    try {
      // Build base query
      let dbQuery = db
        .issues()
        .join('projects', 'issues.project_id', 'projects.id')
        .join('team_members', 'projects.team_id', 'team_members.team_id')
        .where('team_members.user_id', userId)
        .select(['issues.*', 'projects.name as project_name']);

      // Apply filters
      if (query) {
        dbQuery = dbQuery.where(function () {
          this.where('issues.title', 'ilike', `%${query}%`).orWhere(
            'issues.description',
            'ilike',
            `%${query}%`
          );
        });
      }

      if (projectId) {
        dbQuery = dbQuery.where('issues.project_id', projectId);
      }

      if (status) {
        dbQuery = dbQuery.where('issues.status', status);
      }

      if (severity) {
        dbQuery = dbQuery.where('issues.severity', severity);
      }

      if (priority) {
        dbQuery = dbQuery.where('issues.priority', priority);
      }

      if (assigneeId) {
        dbQuery = dbQuery.where('issues.assignee_id', assigneeId);
      }

      if (createdBy) {
        dbQuery = dbQuery.where('issues.user_id', createdBy);
      }

      // Get total count
      const totalQuery = dbQuery.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string);

      // Apply pagination and sorting
      const offset = (page - 1) * limit;
      const issues = await dbQuery
        .orderBy(`issues.${sortBy}`, sortOrder)
        .limit(limit)
        .offset(offset);

      // Enhance issues with user and assignee info
      const enhancedIssues = await Promise.all(
        issues.map(async issue => {
          const [creator, assignee] = await Promise.all([
            db
              .users()
              .where('id', issue.user_id)
              .select(['id', 'username', 'full_name', 'avatar_url'])
              .first(),
            issue.assignee_id
              ? db
                  .users()
                  .where('id', issue.assignee_id)
                  .select(['id', 'username', 'full_name', 'avatar_url'])
                  .first()
              : null,
          ]);

          return {
            ...issue,
            creator,
            assignee,
          };
        })
      );

      sendResponse(res, 200, true, 'Issues retrieved successfully', {
        issues: enhancedIssues,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get issues error:', error);
      throw error;
    }
  })
);

// Get issue by ID
router.get(
  '/:id',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: issueId } = req.params;
    const userId = req.user!.id;

    try {
      // Check if user has access to this issue
      const hasAccess = await verifyIssueAccess(userId, issueId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this issue');
      }

      const issue = await getIssueWithDetails(issueId);
      if (!issue) {
        throw new NotFoundError('Issue');
      }

      sendResponse(res, 200, true, 'Issue retrieved successfully', {
        issue,
      });
    } catch (error) {
      logger.error('Get issue error:', error);
      throw error;
    }
  })
);

// Update issue
router.put(
  '/:id',
  authMiddleware.authenticate,
  validateRequest(updateIssueSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: issueId } = req.params;
    const updateData = req.body;
    const userId = req.user!.id;

    try {
      // Check permissions
      const hasAccess = await verifyIssueAccess(userId, issueId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this issue');
      }

      // Get current issue
      const currentIssue = await db.issues().where('id', issueId).first();
      if (!currentIssue) {
        throw new NotFoundError('Issue');
      }

      // Check if user can update this issue
      const canUpdate =
        currentIssue.user_id === userId ||
        (await hasProjectMaintainerAccess(userId, currentIssue.project_id));

      if (!canUpdate) {
        throw new AuthorizationError(
          'Insufficient permissions to update this issue'
        );
      }

      // Update issue
      const [updatedIssue] = await db
        .issues()
        .where('id', issueId)
        .update({
          ...updateData,
          updated_at: new Date(),
        })
        .returning('*');

      const completeIssue = await getIssueWithDetails(issueId);

      // Handle status change integrations
      if (updateData.status && updateData.status !== currentIssue.status) {
        await handleIssueIntegrations(completeIssue, updateData.status);
      }

      logger.logUserAction('Issue updated', userId, {
        issueId,
        changes: updateData,
      });

      // Broadcast update
      // await websocketService?.broadcastIssueEvent({
      //   type: 'updated',
      //   issueId,
      //   data: updateData,
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 200, true, 'Issue updated successfully', {
        issue: completeIssue,
      });
    } catch (error) {
      logger.error('Update issue error:', error);
      throw error;
    }
  })
);

// Add comment to issue
router.post(
  '/:id/comments',
  authMiddleware.authenticate,
  validateRequest(commentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: issueId } = req.params;
    const { content, isInternal } = req.body;
    const userId = req.user!.id;

    try {
      // Check access
      const hasAccess = await verifyIssueAccess(userId, issueId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this issue');
      }

      // Create comment
      const [comment] = await db.raw(
        `
        INSERT INTO issue_comments (issue_id, user_id, content, is_internal, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
        RETURNING *
      `,
        [issueId, userId, content, isInternal]
      );

      // Get comment with user info
      const commentWithUser = await db.raw(
        `
        SELECT ic.*, u.username, u.full_name, u.avatar_url
        FROM issue_comments ic
        JOIN users u ON ic.user_id = u.id
        WHERE ic.id = ?
      `,
        [comment.id]
      );

      logger.logUserAction('Comment added', userId, { issueId, isInternal });

      // Broadcast comment
      // await websocketService?.broadcastIssueEvent({
      //   type: 'commented',
      //   issueId,
      //   data: commentWithUser[0],
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 201, true, 'Comment added successfully', {
        comment: commentWithUser[0],
      });
    } catch (error) {
      logger.error('Add comment error:', error);
      throw error;
    }
  })
);

// Generate AI suggestions for issue
router.post(
  '/:id/ai-suggestions',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: issueId } = req.params;
    const userId = req.user!.id;

    try {
      // Check access
      const hasAccess = await verifyIssueAccess(userId, issueId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this issue');
      }

      const issue = await getIssueWithDetails(issueId);
      if (!issue) {
        throw new NotFoundError('Issue');
      }

      // Generate AI suggestions
      const suggestions = await Promise.all([
        // Improve description
        openaiService.improveIssueDescription(
          issue.description,
          issue.metadata
        ),

        // Generate acceptance criteria
        openaiService.generateAcceptanceCriteria(
          issue.description,
          issue.metadata
        ),

        // Classify severity and priority
        issue.metadata?.errorDetails
          ? openaiService.classifySeverityAndPriority({
              errorType: issue.metadata.errorDetails.type,
              errorMessage: issue.metadata.errorDetails.message,
              affectedFunctionality: issue.title,
              userImpact: issue.description,
            })
          : null,
      ]);

      const [improvedDescription, acceptanceCriteria, classification] =
        suggestions;

      logger.logUserAction('AI suggestions generated', userId, { issueId });

      sendResponse(res, 200, true, 'AI suggestions generated successfully', {
        suggestions: {
          improvedDescription,
          acceptanceCriteria,
          classification: classification || undefined,
        },
      });
    } catch (error) {
      logger.error('Generate AI suggestions error:', error);
      throw error;
    }
  })
);

// Voice transcription endpoint
router.post(
  '/transcribe-voice',
  authMiddleware.authenticate,
  upload.single('audio'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const audioFile = req.file;

    try {
      if (!audioFile) {
        throw new ValidationError('Audio file is required');
      }

      // Validate file type
      if (!audioFile.mimetype.startsWith('audio/')) {
        throw new ValidationError(
          'Invalid file type. Only audio files are allowed.'
        );
      }

      // Validate file size (10MB limit)
      if (audioFile.size > 10 * 1024 * 1024) {
        throw new ValidationError('File size too large. Maximum size is 10MB.');
      }

      const transcriptionRequest = {
        audioBlob: audioFile.buffer,
        language: req.body.language || 'en',
        prompt: req.body.prompt,
      };

      const result = await openaiService.transcribeVoice(transcriptionRequest);

      logger.logUserAction('Voice transcribed', userId, {
        textLength: result.text.length,
        language: result.language,
        duration: result.duration,
      });

      sendResponse(res, 200, true, 'Voice transcribed successfully', {
        transcription: result,
      });
    } catch (error) {
      logger.error('Voice transcription error:', error);
      throw error;
    }
  })
);

// Generate issue from context (AI endpoint)
router.post(
  '/generate-from-context',
  authMiddleware.authenticate,
  validateRequest(generateFromContextSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const contextData = req.body;

    try {
      // Validate required fields
      if (!contextData.url || !contextData.title) {
        throw new ValidationError('URL and title are required');
      }

      const issueRequest = {
        browserInfo: {
          url: contextData.url,
          title: contextData.title,
          userAgent: contextData.userAgent || 'Unknown',
          viewport: contextData.viewport || { width: 1920, height: 1080 },
        },
        errorDetails: contextData.errorDetails,
        userDescription: contextData.userDescription,
        reproductionSteps: contextData.reproductionSteps,
        screenshots: contextData.screenshots,
        consoleErrors: contextData.consoleErrors,
        networkErrors: contextData.networkErrors,
        expectedBehavior: contextData.expectedBehavior,
        actualBehavior: contextData.actualBehavior,
      };

      const generatedIssue =
        await openaiService.generateIssueFromContext(issueRequest);

      logger.logUserAction('Issue generated from context', userId, {
        url: contextData.url,
        hasErrorDetails: !!contextData.errorDetails,
        hasUserDescription: !!contextData.userDescription,
      });

      sendResponse(res, 200, true, 'Issue generated successfully', {
        issue: generatedIssue,
      });
    } catch (error) {
      logger.error('Generate from context error:', error);
      throw error;
    }
  })
);

// Generate description by combining user text with the Markdown template
router.post(
  '/generate-from-template',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { userDescription, issueFormat } = req.body || {};

    try {
      if (
        typeof userDescription !== 'string' ||
        userDescription.trim().length === 0
      ) {
        throw new ValidationError('userDescription is required');
      }

      // Resolve template path relative to backend working directory (backend/)
      // Repo structure: <root>/docs/issue-template.md
      const templatePath = path.resolve(
        process.cwd(),
        '../docs/issue-template.md'
      );
      let template = '';
      try {
        template = fs.readFileSync(templatePath, 'utf8');
      } catch (e) {
        logger.warn(
          'Could not read issue template file, using minimal fallback'
        );
        template =
          '### Issue Description\n\n---\n\n### Scope:\n\n- [ ]\n\n---\n\n### Testing Steps:\n\n1. \n\n---\n\n### Expectation\n\n| Actual | Expectation |\n|---|---|\n\n---\n\n### Notes:\n';
      }

      let description: string;
      let aiUsed = false;
      try {
        description = await openaiService.generateDescriptionFromTemplate(
          userDescription,
          template,
          issueFormat
        );
        // Heuristic: service method returns fallback with a marker when AI failed
        aiUsed = !/Original Notes:/i.test(description);
      } catch (e) {
        // Graceful fallback: embed the user description into the Issue Description section of the template
        const buildFallback = (tpl: string, userText: string) => {
          const heading = '### Issue Description:';
          const idx = tpl.indexOf(heading);
          if (idx === -1) {
            // No recognizable section; prepend user text
            return `${heading}\n\n${userText}\n\n---\n\n${tpl}`.slice(0, 5000);
          }
          const afterHeadingIdx = idx + heading.length;
          // Find next section separator after the heading
          const sepIdx = tpl.indexOf('\n---', afterHeadingIdx);
          const before = tpl.slice(0, afterHeadingIdx);
          const after = sepIdx !== -1 ? tpl.slice(sepIdx) : '';
          return `${before}\n\n${userText}\n\n${after}`.slice(0, 5000);
        };
        description = buildFallback(template, userDescription);
        aiUsed = false;
      }

      logger.logUserAction('AI template description generated', userId, {
        inputLength: userDescription.length,
        outputLength: description.length,
      });

      return sendResponse(
        res,
        200,
        true,
        'Description generated successfully',
        {
          description,
        },
        { aiUsed }
      );
    } catch (error) {
      logger.error('Generate-from-template error:', error);
      throw error;
    }
  })
);

// Check for duplicate issues
router.post(
  '/check-duplicates',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { title, description, projectId, errorDetails, browserInfo, labels } =
      req.body;

    try {
      // Validate required fields
      if (!title || !description || !projectId) {
        throw new ValidationError(
          'Title, description, and projectId are required'
        );
      }

      // Check project access
      const hasAccess = await verifyProjectAccess(userId, projectId);
      if (!hasAccess) {
        throw new AuthorizationError('No access to this project');
      }

      const duplicateRequest = {
        title,
        description,
        projectId,
        errorDetails,
        browserInfo,
        labels,
      };

      const result =
        await duplicateDetectionService.detectDuplicates(duplicateRequest);

      logger.logUserAction('Duplicate check performed', userId, {
        projectId,
        isDuplicate: result.isDuplicate,
        candidatesFound: result.candidates.length,
      });

      sendResponse(res, 200, true, 'Duplicate check completed', {
        duplicateCheck: result,
      });
    } catch (error) {
      logger.error('Duplicate check error:', error);
      throw error;
    }
  })
);

// Mark issue as duplicate
router.post(
  '/:id/mark-duplicate',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: duplicateId } = req.params;
    const { originalId } = req.body;
    const userId = req.user!.id;

    try {
      if (!originalId) {
        throw new ValidationError('Original issue ID is required');
      }

      // Check access to both issues
      const [duplicateAccess, originalAccess] = await Promise.all([
        verifyIssueAccess(userId, duplicateId),
        verifyIssueAccess(userId, originalId),
      ]);

      if (!duplicateAccess || !originalAccess) {
        throw new AuthorizationError('No access to one or both issues');
      }

      await duplicateDetectionService.markAsDuplicate(
        duplicateId,
        originalId,
        userId
      );

      logger.logUserAction('Issue marked as duplicate', userId, {
        duplicateId,
        originalId,
      });

      // Broadcast update
      // await websocketService?.broadcastIssueEvent({
      //   type: 'updated',
      //   issueId: duplicateId,
      //   data: { status: 'closed', duplicateOf: originalId },
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 200, true, 'Issue marked as duplicate successfully');
    } catch (error) {
      logger.error('Mark duplicate error:', error);
      throw error;
    }
  })
);

// Helper functions
async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  const result = await db
    .teamMembers()
    .join('projects', 'team_members.team_id', 'projects.team_id')
    .where('projects.id', projectId)
    .where('team_members.user_id', userId)
    .first();

  return !!result;
}

async function verifyIssueAccess(
  userId: string,
  issueId: string
): Promise<boolean> {
  const result = await db
    .issues()
    .join('projects', 'issues.project_id', 'projects.id')
    .join('team_members', 'projects.team_id', 'team_members.team_id')
    .where('issues.id', issueId)
    .where('team_members.user_id', userId)
    .first();

  return !!result;
}

async function hasProjectMaintainerAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  const result = await db
    .teamMembers()
    .join('projects', 'team_members.team_id', 'projects.team_id')
    .where('projects.id', projectId)
    .where('team_members.user_id', userId)
    .whereIn('team_members.role', ['owner', 'maintainer'])
    .first();

  return !!result;
}

async function getIssueWithDetails(issueId: string) {
  const issue = await db
    .issues()
    .leftJoin('users as creator', 'issues.user_id', 'creator.id')
    .leftJoin('users as assignee', 'issues.assignee_id', 'assignee.id')
    .leftJoin('projects', 'issues.project_id', 'projects.id')
    .where('issues.id', issueId)
    .select([
      'issues.*',
      'creator.id as creator_id',
      'creator.username as creator_username',
      'creator.full_name as creator_name',
      'creator.avatar_url as creator_avatar',
      'assignee.id as assignee_id',
      'assignee.username as assignee_username',
      'assignee.full_name as assignee_name',
      'assignee.avatar_url as assignee_avatar',
      'projects.name as project_name',
    ])
    .first();

  if (!issue) return null;

  // Get comments
  const comments = await db.raw(
    `
    SELECT ic.*, u.username, u.full_name, u.avatar_url
    FROM issue_comments ic
    JOIN users u ON ic.user_id = u.id
    WHERE ic.issue_id = ?
    ORDER BY ic.created_at ASC
  `,
    [issueId]
  );

  return {
    ...issue,
    creator: issue.creator_id
      ? {
          id: issue.creator_id,
          username: issue.creator_username,
          fullName: issue.creator_name,
          avatarUrl: issue.creator_avatar,
        }
      : null,
    assignee: issue.assignee_id
      ? {
          id: issue.assignee_id,
          username: issue.assignee_username,
          fullName: issue.assignee_name,
          avatarUrl: issue.assignee_avatar,
        }
      : null,
    comments: comments || [],
  };
}

async function processAttachments(
  files: Express.Multer.File[]
): Promise<any[]> {
  const attachments = [];

  for (const file of files) {
    try {
      // In a real implementation, upload to S3 or similar
      const filename = `${Date.now()}-${file.originalname}`;
      const attachment = {
        id: require('crypto').randomUUID(),
        filename: file.originalname,
        url: `/uploads/attachments/${filename}`,
        size: file.size,
        type: file.mimetype.startsWith('image/')
          ? 'image'
          : file.mimetype.startsWith('video/')
            ? 'video'
            : 'document',
        createdAt: new Date(),
      };

      attachments.push(attachment);
    } catch (error) {
      logger.error('Attachment processing error:', error);
    }
  }

  return attachments;
}

async function handleIssueIntegrations(
  issue: any,
  status: string
): Promise<void> {
  try {
    // Get project settings
    const project = await db.projects().where('id', issue.project_id).first();
    if (!project || !project.settings) return;

    const { integrations } = project.settings;

    // GitLab integration
    if (integrations?.gitlab?.enabled && integrations.gitlab.autoCreateIssues) {
      try {
        if (status === 'submitted' && !issue.gitlab_issue_id) {
          const gitlabIssue = await gitlabService.createIssue(
            integrations.gitlab.projectId,
            {
              title: issue.title,
              description: issue.description,
              labels:
                issue.labels?.map(
                  (label: string) =>
                    `${integrations.gitlab.labelPrefix}${label}`
                ) || [],
            }
          );

          // Update issue with GitLab ID
          await db
            .issues()
            .where('id', issue.id)
            .update({ gitlab_issue_id: gitlabIssue.iid });
        }
      } catch (error) {
        logger.error('GitLab integration error:', error);
      }
    }

    // Slack integration
    if (integrations?.slack?.enabled && integrations.slack.notifyOnNewIssues) {
      try {
        if (status === 'submitted') {
          // Get project owner's Slack tokens
          const owner = await db
            .teamMembers()
            .join('users', 'team_members.user_id', 'users.id')
            .where('team_members.team_id', project.team_id)
            .where('team_members.role', 'owner')
            .where('users.slack_tokens', '!=', null)
            .select('users.slack_tokens')
            .first();

          if (owner?.slack_tokens) {
            const message = await slackService.createIssueMessage(issue);
            await slackService.sendMessage(owner.slack_tokens.accessToken, {
              channel: integrations.slack.channelId,
              ...message,
            });
          }
        }
      } catch (error) {
        logger.error('Slack integration error:', error);
      }
    }
  } catch (error) {
    logger.error('Integration handling error:', error);
  }
}

export { router as issueRouter };
