import { Router, Response, Request } from 'express';
import Joi from 'joi';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, sendResponse } from '../middleware/errorHandler';
import { SlackService } from '../services/slack';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { RedisService } from '../services/redis';
import { databaseService } from '../services/database';

const router = Router();
const slackService = new SlackService();
const redis = new RedisService();
const oauthStateMemory = new Map<
  string,
  { userId: string; expiresAt: number }
>();

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
router.get(
  '/connect',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (process.env.SLACK_BOT_TOKEN) {
      return res
        .status(404)
        .json({
          success: false,
          error: 'Slack OAuth disabled (using bot token)',
        });
    }
    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.SLACK_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return sendResponse(
        res,
        400,
        false,
        'Slack OAuth not configured on server'
      );
    }

    // Scopes for listing channels/users and posting messages
    const scopes = [
      'chat:write',
      'conversations:read',
      'users:read',
      'channels:join', // optional but helpful for public channels
    ].join(',');

    const state = crypto.randomBytes(16).toString('hex');
    try {
      await redis.connect();
      await redis.set(
        `slack_oauth_state:${state}`,
        JSON.stringify({ userId: req.user!.id }),
        600
      );
    } catch (e) {
      // Fallback to in-memory state with TTL
      oauthStateMemory.set(state, {
        userId: req.user!.id,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
    }

    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);

    return sendResponse(res, 200, true, 'Slack OAuth URL', {
      url: url.toString(),
    });
  })
);

// --- OAuth Callback ---
router.get(
  '/callback',
  asyncHandler(async (req: Request, res: Response) => {
    if (process.env.SLACK_BOT_TOKEN) {
      return res.status(404).send('Slack OAuth disabled (using bot token)');
    }
    const code = String((req.query.code as string) || '');
    const state = String((req.query.state as string) || '');
    const redirectUri = process.env.SLACK_REDIRECT_URI;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    try {
      let userId: string | undefined;
      try {
        await redis.connect();
        const stateDataStr = await redis.get(`slack_oauth_state:${state}`);
        if (stateDataStr) {
          userId = JSON.parse(stateDataStr).userId;
        }
      } catch {}
      if (!userId) {
        const mem = oauthStateMemory.get(state);
        if (mem && mem.expiresAt > Date.now()) {
          userId = mem.userId;
        }
      }
      if (!userId) {
        return res.status(400).send('Invalid or expired state');
      }

      const tokens = await slackService.exchangeCodeForTokens(
        code,
        redirectUri!
      );
      await slackService.storeUserTokens(userId, tokens);
      try {
        await redis.connect();
        await redis.del(`slack_oauth_state:${state}`);
      } catch {}
      oauthStateMemory.delete(state);

      if (frontendUrl) {
        // Redirect back to app with a success anchor
        return res.redirect(`${frontendUrl}/integrations/slack/success`);
      }
      // Simple inline HTML fallback
      res.setHeader('Content-Type', 'text/html');
      return res.send(
        '<html><body><h3>Slack connected. You can close this window.</h3></body></html>'
      );
    } catch (error) {
      logger.error('Slack OAuth callback error:', error);
      if (frontendUrl) {
        return res.redirect(`${frontendUrl}/integrations/slack/failure`);
      }
      return res.status(500).send('Slack connection failed');
    }
  })
);

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

      await redis.connect();
      await redis.del(`slack_tokens:${req.user!.id}`);

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
