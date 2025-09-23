import { Router, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import { databaseService } from '../services/database';
import { OpenAIService } from '../services/openai';
import { AssignmentService } from '../services/assignment';
import { DuplicateDetectionService } from '../services/duplicateDetection';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
// Rate limiting middleware removed to rely on upstream GitLab limits
import {
  asyncHandler,
  validateRequest,
  sendResponse,
  ValidationError,
  AuthorizationError,
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const router = Router();
const db = databaseService;
const openaiService = new OpenAIService();
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
      const issueResponse = {
        ...issue,
        attachments,
      };

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
      //   data: issueResponse,
      //   userId,
      //   timestamp: Date.now()
      // });

      sendResponse(res, 201, true, 'Issue created successfully', {
        issue: issueResponse,
      });
    } catch (error) {
      logger.error('Create issue error:', error);
      throw error;
    }
  })
);

// Submit issue (move from draft to submitted)

// Get issues with filtering and pagination

// Get issue by ID

// Update issue

// Add comment to issue

// Generate AI suggestions for issue

// Voice transcription endpoint

// Generate issue from context (AI endpoint)

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

// Mark issue as duplicate

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

export { router as issueRouter };
