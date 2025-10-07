import { Router, Response, Request } from 'express';
import Joi from 'joi';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, sendResponse } from '../middleware/errorHandler';
import { SlackService } from '../services/slack';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { redisService } from '../services/redis';
import { databaseService } from '../services/database';

const router = Router();
const slackService = new SlackService();
// Redis service is now a singleton, use directly where needed

router.get(
  '/channels',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tokens = await slackService.getUserTokens(userId);
      const accessToken = tokens?.accessToken || process.env.SLACK_BOT_TOKEN;
      if (!accessToken) {
        return sendResponse(res, 200, true, 'Slack not connected', {
          items: [],
        });
      }

      const channels = await slackService.getChannels(accessToken);
      // Map to minimal shape for the client
      const items = channels.map(c => ({
        id: c.id,
        name: c.name,
        isPrivate: c.isPrivate,
        isMember: c.isMember,
      }));
      return sendResponse(res, 200, true, 'Slack channels fetched', { items });
    } catch (error) {
      logger.error('Slack channels fetch error:', error);
      return sendResponse(res, 500, false, 'Failed to fetch Slack channels');
    }
  })
);

// GET /api/integrations/slack/users
router.get(
  '/users',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tokens = await slackService.getUserTokens(userId);
      const accessToken = tokens?.accessToken || process.env.SLACK_BOT_TOKEN;
      if (!accessToken) {
        return sendResponse(res, 200, true, 'Slack not connected', {
          items: [],
        });
      }

      const users = await slackService.getUsers(accessToken);
      const items = users
        .filter(u => !u.isBot)
        .map(u => ({ id: u.id, name: u.profile.displayName || u.realName }));

      return sendResponse(res, 200, true, 'Slack users fetched', { items });
    } catch (error) {
      logger.error('Slack users fetch error:', error);
      return sendResponse(res, 500, false, 'Failed to fetch Slack users');
    }
  })
);

export { router as slackRouter };

// --- OAuth Connect (returns authorize URL) ---

// --- OAuth Callback ---

// --- Optional: Token-based connect (fallback) ---
router.post(
  '/connect',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (process.env.SLACK_BOT_TOKEN) {
      return sendResponse(
        res,
        404,
        false,
        'Slack OAuth disabled (using bot token)'
      );
    }
    const { token } = req.body || {};
    if (!token) return sendResponse(res, 400, false, 'Missing token');
    try {
      // Try auth.test to validate
      const ok = await slackService.testConnection(token);
      if (!ok) return sendResponse(res, 400, false, 'Invalid Slack token');

      // Store minimal token set
      await slackService.storeUserTokens(req.user!.id, {
        accessToken: token,
        scope: 'chat:write,conversations:read,users:read',
        teamId: 'unknown',
        teamName: 'unknown',
        userId: req.user!.id,
      });

      return sendResponse(res, 200, true, 'Slack connected');
    } catch (err) {
      logger.error('Slack token connect error:', err);
      return sendResponse(res, 500, false, 'Failed to connect Slack');
    }
  })
);

// --- Disconnect ---
router.post(
  '/disconnect',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (process.env.SLACK_BOT_TOKEN) {
      // No per-user tokens when using bot token only
      return sendResponse(
        res,
        200,
        true,
        'Slack disconnected (bot token in use)'
      );
    }
    try {
      // Clear tokens from DB and cache
      await databaseService
        .users()
        .where('id', req.user!.id)
        .update({ slack_id: null, slack_tokens: null, updated_at: new Date() });

      try {
        if (!redisService.isAvailable()) {
          await redisService.connect();
        }
        await redisService.del(`slack_tokens:${req.user!.id}`);
      } catch (cacheError) {
        logger.warn('Failed to clear Slack tokens from Redis cache:', cacheError);
      }

      return sendResponse(res, 200, true, 'Slack disconnected');
    } catch (error) {
      logger.error('Slack disconnect error:', error);
      return sendResponse(res, 500, false, 'Failed to disconnect Slack');
    }
  })
);

// --- Post a Slack message (generic helper) ---
router.post(
  '/post',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = Joi.object({
      channelId: Joi.string().required(),
      text: Joi.string().allow('', null),
      slackUserIds: Joi.array().items(Joi.string()).optional(),
      threadTs: Joi.string().optional(),
      blocks: Joi.array().optional(),
    });

    const { error, value } = schema.validate(req.body || {});
    if (error) {
      return sendResponse(res, 400, false, error.message);
    }

    const { channelId, text, slackUserIds, threadTs, blocks } = value as {
      channelId: string;
      text?: string | null;
      slackUserIds?: string[];
      threadTs?: string;
      blocks?: any[];
    };

    try {
      const slackTokens = await slackService.getUserTokens(req.user!.id);
      const accessToken =
        slackTokens?.accessToken || process.env.SLACK_BOT_TOKEN;
      if (!accessToken) {
        return sendResponse(res, 400, false, 'Slack not connected');
      }

      const mentionText =
        Array.isArray(slackUserIds) && slackUserIds.length > 0
          ? slackUserIds.map(id => `<@${id}>`).join(' ')
          : '';
      const finalText = [text || '', mentionText].join(' ').trim();

      const result = await slackService.sendMessage(accessToken, {
        channel: channelId,
        ...(finalText ? { text: finalText } : {}),
        ...(threadTs ? { threadTs } : {}),
        ...(blocks ? { blocks } : {}),
      });

      return sendResponse(res, 200, true, 'Slack message posted', {
        ts: result?.ts,
        channel: channelId,
      });
    } catch (err) {
      logger.error('Slack post error:', err);
      return sendResponse(res, 500, false, 'Failed to post to Slack');
    }
  })
);
