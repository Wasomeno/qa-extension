import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/database';
import { GitLabService } from '../services/gitlab';
import { SlackService } from '../services/slack';
import { WebSocketService } from '../services/websocket';
import { webhookRateLimiter } from '../middleware/rateLimiter';
import { 
  asyncHandler, 
  sendResponse,
  sendError
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = new DatabaseService();
const gitlabService = new GitLabService();
const slackService = new SlackService();
// WebSocketService will be initialized later with the server instance
let websocketService: WebSocketService | null = null;

// GitLab webhook endpoint
router.post('/gitlab',
  webhookRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-gitlab-token'] as string;
    const event = req.headers['x-gitlab-event'] as string;
    const payload = req.body;

    try {
      // Verify webhook signature
      if (!signature || signature !== process.env.GITLAB_WEBHOOK_SECRET) {
        logger.logSecurity('Invalid GitLab webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          event
        });
        return sendError(res, 401, 'Unauthorized');
      }

      logger.logWebhook('GitLab', event, {
        projectId: payload.project?.id,
        objectKind: payload.object_kind
      });

      switch (event) {
        case 'Issue Hook':
          await handleGitLabIssueEvent(payload);
          break;
        
        case 'Merge Request Hook':
          await handleGitLabMergeRequestEvent(payload);
          break;
        
        case 'Push Hook':
          await handleGitLabPushEvent(payload);
          break;
        
        case 'Pipeline Hook':
          await handleGitLabPipelineEvent(payload);
          break;
        
        default:
          logger.warn(`Unhandled GitLab webhook event: ${event}`);
      }

      sendResponse(res, 200, true, 'Webhook processed successfully');
    } catch (error) {
      logger.error('GitLab webhook processing error:', error);
      sendError(res, 500, 'Webhook processing failed');
    }
  })
);

// Slack webhook endpoint
router.post('/slack',
  webhookRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-slack-signature'] as string;
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const body = JSON.stringify(req.body);

    try {
      // Verify webhook signature
      const isValid = await slackService.verifyWebhookSignature(body, signature, timestamp);
      if (!isValid) {
        logger.logSecurity('Invalid Slack webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        return sendError(res, 401, 'Unauthorized');
      }

      const payload = req.body;

      // Handle URL verification challenge
      if (payload.type === 'url_verification') {
        return res.json({ challenge: payload.challenge });
      }

      logger.logWebhook('Slack', payload.type, {
        teamId: payload.team_id,
        eventType: payload.event?.type
      });

      await slackService.handleWebhookEvent(payload);

      sendResponse(res, 200, true, 'Webhook processed successfully');
    } catch (error) {
      logger.error('Slack webhook processing error:', error);
      sendError(res, 500, 'Webhook processing failed');
    }
  })
);

// Generic webhook endpoint for testing
router.post('/test',
  webhookRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { secret } = req.query;
    
    if (secret !== process.env.WEBHOOK_TEST_SECRET) {
      return sendError(res, 401, 'Unauthorized');
    }

    logger.logWebhook('Test', 'test_event', req.body);

    sendResponse(res, 200, true, 'Test webhook received', {
      headers: req.headers,
      body: req.body
    });
  })
);

// GitLab issue event handler
async function handleGitLabIssueEvent(payload: any): Promise<void> {
  try {
    const { project, object_attributes: issue, user } = payload;
    
    // Find our issue linked to this GitLab issue
    const localIssue = await db.issues()
      .where('gitlab_issue_id', issue.iid.toString())
      .join('projects', 'issues.project_id', 'projects.id')
      .where('projects.gitlab_project_id', project.id.toString())
      .select('issues.*', 'projects.id as project_id')
      .first();

    if (!localIssue) {
      logger.debug(`No local issue found for GitLab issue ${issue.iid} in project ${project.id}`);
      return;
    }

    // Map GitLab state to our status
    const statusMap: { [key: string]: string } = {
      'opened': 'submitted',
      'closed': 'resolved',
      'reopened': 'in_progress'
    };

    const newStatus = statusMap[issue.state];
    if (!newStatus || newStatus === localIssue.status) {
      return; // No status change needed
    }

    // Update local issue status
    await db.issues()
      .where('id', localIssue.id)
      .update({
        status: newStatus,
        updated_at: new Date()
      });

    // Broadcast update to project members
    // TODO: Get WebSocketService instance from server
    // await websocketService?.broadcastProjectEvent({
    //   type: 'issue_updated',
    //   projectId: localIssue.project_id,
    //   data: {
    //     issueId: localIssue.id,
    //     status: newStatus,
    //     source: 'gitlab',
    //     gitlabUser: user.name
    //   },
    //   userId: 'system',
    //   timestamp: Date.now()
    // });

    logger.logBusinessEvent('GitLab issue sync', {
      localIssueId: localIssue.id,
      gitlabIssueId: issue.iid,
      newStatus,
      action: payload.object_attributes.action
    });
  } catch (error) {
    logger.error('GitLab issue event handling error:', error);
  }
}

// GitLab merge request event handler
async function handleGitLabMergeRequestEvent(payload: any): Promise<void> {
  try {
    const { project, object_attributes: mr, user } = payload;

    // Check if this MR references any of our issues
    const description = mr.description || '';
    const title = mr.title || '';
    const references = [...description.matchAll(/#(\d+)/g), ...title.matchAll(/#(\d+)/g)];

    if (references.length === 0) {
      return;
    }

    const issueIds = references.map(match => match[1]);
    
    // Find local issues that might be referenced
    const localIssues = await db.issues()
      .join('projects', 'issues.project_id', 'projects.id')
      .where('projects.gitlab_project_id', project.id.toString())
      .whereIn('issues.gitlab_issue_id', issueIds)
      .select('issues.*', 'projects.id as project_id');

    if (localIssues.length === 0) {
      return;
    }

    // Update issues based on MR status
    for (const issue of localIssues) {
      let newStatus = issue.status;
      
      if (mr.state === 'merged') {
        newStatus = 'resolved';
      } else if (mr.state === 'opened' && issue.status === 'submitted') {
        newStatus = 'in_progress';
      }

      if (newStatus !== issue.status) {
        await db.issues()
          .where('id', issue.id)
          .update({
            status: newStatus,
            updated_at: new Date()
          });

        // Add comment about MR
        await db.raw(`
          INSERT INTO issue_comments (issue_id, user_id, content, is_internal, created_at, updated_at)
          VALUES (?, NULL, ?, true, NOW(), NOW())
        `, [
          issue.id,
          `Merge Request ${mr.state}: ${mr.title}\n${mr.web_url}`
        ]);

        // Broadcast update
        // TODO: Get WebSocketService instance from server
        // await websocketService?.broadcastIssueEvent({
        //   type: 'updated',
        //   issueId: issue.id,
        //   data: {
        //     status: newStatus,
        //     source: 'gitlab_mr',
        //     mergeRequest: {
        //       title: mr.title,
        //       state: mr.state,
        //       url: mr.web_url
        //     }
        //   },
        //   userId: 'system',
        //   timestamp: Date.now()
        // });
      }
    }

    logger.logBusinessEvent('GitLab MR sync', {
      mrId: mr.iid,
      mrState: mr.state,
      affectedIssues: localIssues.length,
      projectId: project.id
    });
  } catch (error) {
    logger.error('GitLab merge request event handling error:', error);
  }
}

// GitLab push event handler
async function handleGitLabPushEvent(payload: any): Promise<void> {
  try {
    const { project, commits, ref } = payload;

    if (!commits || commits.length === 0) {
      return;
    }

    // Look for issue references in commit messages
    const issueReferences = new Set<string>();
    
    commits.forEach((commit: any) => {
      const message = commit.message || '';
      const matches = message.matchAll(/#(\d+)/g);
      for (const match of matches) {
        issueReferences.add(match[1]);
      }
    });

    if (issueReferences.size === 0) {
      return;
    }

    // Find local issues
    const localIssues = await db.issues()
      .join('projects', 'issues.project_id', 'projects.id')
      .where('projects.gitlab_project_id', project.id.toString())
      .whereIn('issues.gitlab_issue_id', Array.from(issueReferences))
      .select('issues.*', 'projects.id as project_id');

    // Add comments to referenced issues
    for (const issue of localIssues) {
      const relevantCommits = commits.filter((commit: any) => 
        commit.message.includes(`#${issue.gitlab_issue_id}`)
      );

      for (const commit of relevantCommits) {
        await db.raw(`
          INSERT INTO issue_comments (issue_id, user_id, content, is_internal, created_at, updated_at)
          VALUES (?, NULL, ?, true, NOW(), NOW())
        `, [
          issue.id,
          `Commit on ${ref.replace('refs/heads/', '')}: ${commit.title}\n${commit.url}`
        ]);
      }

      // If pushing to main/master branch, mark as in progress
      if ((ref === 'refs/heads/main' || ref === 'refs/heads/master') && 
          issue.status === 'submitted') {
        await db.issues()
          .where('id', issue.id)
          .update({
            status: 'in_progress',
            updated_at: new Date()
          });

        // Broadcast update
        // await websocketService?.broadcastIssueEvent({
        //   type: 'updated',
        //   issueId: issue.id,
        //   data: {
        //     status: 'in_progress',
        //     source: 'gitlab_push',
        //     branch: ref.replace('refs/heads/', '')
        //   },
        //   userId: 'system',
        //   timestamp: Date.now()
        // });
      }
    }

    logger.logBusinessEvent('GitLab push sync', {
      projectId: project.id,
      branch: ref.replace('refs/heads/', ''),
      commits: commits.length,
      referencedIssues: localIssues.length
    });
  } catch (error) {
    logger.error('GitLab push event handling error:', error);
  }
}

// GitLab pipeline event handler
async function handleGitLabPipelineEvent(payload: any): Promise<void> {
  try {
    const { project, object_attributes: pipeline, commit } = payload;

    if (!commit || !commit.message) {
      return;
    }

    // Look for issue references in commit message
    const issueReferences = commit.message.matchAll(/#(\d+)/g);
    const issueIds = Array.from(issueReferences, (match: RegExpMatchArray) => match[1]);

    if (issueIds.length === 0) {
      return;
    }

    // Find local issues
    const localIssues = await db.issues()
      .join('projects', 'issues.project_id', 'projects.id')
      .where('projects.gitlab_project_id', project.id.toString())
      .whereIn('issues.gitlab_issue_id', issueIds)
      .select('issues.*', 'projects.id as project_id');

    // Add pipeline status comments
    for (const issue of localIssues) {
      let statusIcon = '⚪';
      let statusText = pipeline.status;

      switch (pipeline.status) {
        case 'success':
          statusIcon = '✅';
          break;
        case 'failed':
          statusIcon = '❌';
          break;
        case 'running':
          statusIcon = '🔄';
          break;
        case 'canceled':
          statusIcon = '⚫';
          break;
      }

      await db.raw(`
        INSERT INTO issue_comments (issue_id, user_id, content, is_internal, created_at, updated_at)
        VALUES (?, NULL, ?, true, NOW(), NOW())
      `, [
        issue.id,
        `${statusIcon} Pipeline ${statusText} on ${pipeline.ref}\n${pipeline.web_url}`
      ]);

      // If pipeline failed, add failure label
      if (pipeline.status === 'failed' && issue.labels) {
        const labels = Array.isArray(issue.labels) ? issue.labels : [];
        if (!labels.includes('pipeline-failed')) {
          labels.push('pipeline-failed');
          await db.issues()
            .where('id', issue.id)
            .update({
              labels,
              updated_at: new Date()
            });
        }
      }

      // Broadcast pipeline update
      // await websocketService?.broadcastIssueEvent({
      //   type: 'updated',
      //   issueId: issue.id,
      //   data: {
      //     source: 'gitlab_pipeline',
      //     pipeline: {
      //       status: pipeline.status,
      //       ref: pipeline.ref,
      //       url: pipeline.web_url
      //     }
      //   },
      //   userId: 'system',
      //   timestamp: Date.now()
      // });
    }

    logger.logBusinessEvent('GitLab pipeline sync', {
      projectId: project.id,
      pipelineId: pipeline.id,
      status: pipeline.status,
      referencedIssues: localIssues.length
    });
  } catch (error) {
    logger.error('GitLab pipeline event handling error:', error);
  }
}

// Webhook status endpoint
router.get('/status',
  asyncHandler(async (req: Request, res: Response) => {
    const { secret } = req.query;
    
    if (secret !== process.env.WEBHOOK_STATUS_SECRET) {
      return sendError(res, 401, 'Unauthorized');
    }

    // Get webhook statistics from logs or database
    const stats = {
      gitlab: {
        enabled: !!process.env.GITLAB_WEBHOOK_SECRET,
        lastReceived: null // Would be stored in a separate tracking table
      },
      slack: {
        enabled: !!process.env.SLACK_SIGNING_SECRET,
        lastReceived: null
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    sendResponse(res, 200, true, 'Webhook status retrieved', stats);
  })
);

export { router as webhookRouter };