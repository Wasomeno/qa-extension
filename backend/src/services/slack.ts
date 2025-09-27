import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { DatabaseService, databaseService } from './database';
import { redisService } from './redis';
import { logger } from '../utils/logger';

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  redirectUri: string;
}

export interface SlackTokens {
  accessToken: string;
  scope: string;
  teamId: string;
  teamName: string;
  userId: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isPrivate: boolean;
  isMember: boolean;
  topic?: {
    value: string;
    creator: string;
    lastSet: number;
  };
  purpose?: {
    value: string;
    creator: string;
    lastSet: number;
  };
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  email?: string;
  isBot: boolean;
  profile: {
    displayName: string;
    realName: string;
    email?: string;
    image24?: string;
    image32?: string;
    image48?: string;
    image72?: string;
    image192?: string;
    image512?: string;
  };
}

export interface SlackWebhookEvent {
  type: string;
  event: any;
  teamId: string;
  apiAppId: string;
  eventId: string;
  eventTime: number;
  challenge?: string;
}

export class SlackService {
  private db: DatabaseService;
  private redis: RedisService;
  private config: SlackConfig;
  private apiClient: AxiosInstance;

  constructor() {
    this.db = databaseService;
    this.redis = redisService;
    
    this.config = {
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
      redirectUri: process.env.SLACK_REDIRECT_URI!
    };

    this.apiClient = axios.create({
      baseURL: 'https://slack.com/api/',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'QA-Command-Center/1.0'
      }
    });

    this.setupInterceptors();
  }

  private async ensureRedisConnected(): Promise<void> {
    try {
      // Connect only if not already available
      if (!(this.redis as any).isAvailable || !this.redis.isAvailable()) {
        await this.redis.connect();
      }
    } catch (e) {
      // In dev, Redis may be optional; log and continue
      logger.warn('Redis not available for SlackService cache. Continuing without cache.');
    }
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.response.use(
      (response) => {
        if (!response.data.ok) {
          throw new Error(`Slack API Error: ${response.data.error}`);
        }
        return response;
      },
      (error) => {
        logger.error('Slack API request failed:', error);
        throw error;
      }
    );
  }

  public async exchangeCodeForTokens(code: string, redirectUri: string): Promise<SlackTokens> {
    try {
      const response = await this.apiClient.post('oauth.v2.access', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: redirectUri
      });

      const data = response.data;
      
      const tokens: SlackTokens = {
        accessToken: data.access_token,
        scope: data.scope,
        teamId: data.team.id,
        teamName: data.team.name,
        userId: data.authed_user.id,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined
      };

      logger.info(`Slack OAuth completed for team: ${tokens.teamName}`);
      return tokens;
    } catch (error) {
      logger.error('Slack OAuth error:', error);
      throw new Error('Failed to exchange code for tokens');
    }
  }

  public async refreshAccessToken(refreshToken: string): Promise<SlackTokens> {
    try {
      const response = await this.apiClient.post('oauth.v2.access', {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const data = response.data;
      
      const tokens: SlackTokens = {
        accessToken: data.access_token,
        scope: data.scope,
        teamId: data.team.id,
        teamName: data.team.name,
        userId: data.authed_user.id,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined
      };

      logger.info(`Slack tokens refreshed for team: ${tokens.teamName}`);
      return tokens;
    } catch (error) {
      logger.error('Slack token refresh error:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  public async sendMessage(accessToken: string, message: SlackMessage): Promise<any> {
    const attemptPost = async () =>
      this.apiClient.post('chat.postMessage', message, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

    try {
      const response = await attemptPost();
      logger.info(`Message sent to Slack channel: ${message.channel}`);
      return response.data;
    } catch (error: any) {
      const errData = error?.response?.data;
      const errCode = errData?.error || error?.message || 'unknown_error';
      logger.error('Failed to send Slack message:', {
        channel: (message as any).channel,
        error: errCode,
      });

      // Auto-join public channels if not in channel, then retry once
      if (errCode === 'not_in_channel' || errCode === 'channel_not_found') {
        try {
          await this.apiClient.post('conversations.join', {
            channel: (message as any).channel,
          }, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          logger.info(`Joined channel ${(<any>message).channel}, retrying post`);
          const retry = await attemptPost();
          logger.info(`Message sent to Slack channel after join: ${(<any>message).channel}`);
          return retry.data;
        } catch (joinErr: any) {
          const joinCode = joinErr?.response?.data?.error || joinErr?.message;
          logger.error('Failed to join Slack channel before posting', {
            channel: (message as any).channel,
            error: joinCode,
          });
        }
      }
      throw error;
    }
  }

  public async updateMessage(accessToken: string, channel: string, ts: string, message: Partial<SlackMessage>): Promise<any> {
    try {
      const response = await this.apiClient.post('chat.update', {
        channel,
        ts,
        ...message
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      logger.info(`Message updated in Slack channel: ${channel}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to update Slack message:', error);
      throw error;
    }
  }

  public async deleteMessage(accessToken: string, channel: string, ts: string): Promise<any> {
    try {
      const response = await this.apiClient.post('chat.delete', {
        channel,
        ts
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      logger.info(`Message deleted from Slack channel: ${channel}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to delete Slack message:', error);
      throw error;
    }
  }

  public async getChannels(accessToken: string, types: string = 'public_channel,private_channel'): Promise<SlackChannel[]> {
    try {
      const response = await this.apiClient.get('conversations.list', {
        params: {
          types,
          limit: 1000
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data.channels.map((channel: any): SlackChannel => ({
        id: channel.id,
        name: channel.name,
        isChannel: channel.is_channel,
        isPrivate: channel.is_private,
        isMember: channel.is_member,
        topic: channel.topic,
        purpose: channel.purpose
      }));
    } catch (error) {
      logger.error('Failed to get Slack channels:', error);
      throw error;
    }
  }

  public async getChannelInfo(accessToken: string, channel: string): Promise<SlackChannel> {
    try {
      const response = await this.apiClient.get('conversations.info', {
        params: { channel },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const channelData = response.data.channel;
      return {
        id: channelData.id,
        name: channelData.name,
        isChannel: channelData.is_channel,
        isPrivate: channelData.is_private,
        isMember: channelData.is_member,
        topic: channelData.topic,
        purpose: channelData.purpose
      };
    } catch (error) {
      logger.error('Failed to get Slack channel info:', error);
      throw error;
    }
  }

  public async getUsers(accessToken: string): Promise<SlackUser[]> {
    try {
      const response = await this.apiClient.get('users.list', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data.members
        .filter((member: any) => !member.deleted)
        .map((member: any): SlackUser => ({
          id: member.id,
          name: member.name,
          realName: member.real_name,
          email: member.profile.email,
          isBot: member.is_bot,
          profile: {
            displayName: member.profile.display_name || member.profile.real_name,
            realName: member.profile.real_name,
            email: member.profile.email,
            image24: member.profile.image_24,
            image32: member.profile.image_32,
            image48: member.profile.image_48,
            image72: member.profile.image_72,
            image192: member.profile.image_192,
            image512: member.profile.image_512
          }
        }));
    } catch (error) {
      logger.error('Failed to get Slack users:', error);
      throw error;
    }
  }

  public async createIssueMessage(issueData: any): Promise<any> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🐛 New Issue: ${issueData.title}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:*\n${issueData.description}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity:* ${this.getSeverityEmoji(issueData.severity)} ${issueData.severity.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:* ${this.getPriorityEmoji(issueData.priority)} ${issueData.priority.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Project:* ${issueData.project?.name || 'Unknown'}`
          },
          {
            type: 'mrkdwn',
            text: `*Reporter:* ${issueData.user?.full_name || 'Unknown'}`
          }
        ]
      }
    ];

    if (issueData.acceptance_criteria && issueData.acceptance_criteria.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Acceptance Criteria:*\n${issueData.acceptance_criteria.map((criteria: string, index: number) => `${index + 1}. ${criteria}`).join('\n')}`
        }
      });
    }

    if (issueData.attachments && issueData.attachments.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Attachments:* ${issueData.attachments.length} file(s)`
        }
      });
    }

    (blocks as any).push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Issue'
          },
          url: `${process.env.FRONTEND_URL}/issues/${issueData.id}`,
          action_id: 'view_issue'
        }
      ]
    });

    return { blocks };
  }

  public async verifyWebhookSignature(body: string, signature: string, timestamp: string): Promise<boolean> {
    try {
      const signingSecret = this.config.signingSecret;
      const requestTimestamp = parseInt(timestamp);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      // Check if the request timestamp is within 5 minutes
      if (Math.abs(currentTimestamp - requestTimestamp) > 300) {
        return false;
      }

      const sigBasestring = `v0:${timestamp}:${body}`;
      const mySignature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring, 'utf8')
        .digest('hex')}`;

      return crypto.timingSafeEqual(
        Buffer.from(mySignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  public async handleWebhookEvent(event: SlackWebhookEvent): Promise<void> {
    try {
      logger.info(`Processing Slack webhook event: ${event.type}`);

      switch (event.type) {
        case 'url_verification':
          // This is handled in the webhook route
          break;
        
        case 'event_callback':
          await this.handleEventCallback(event);
          break;
        
        default:
          logger.warn(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      logger.error('Error processing Slack webhook:', error);
      throw error;
    }
  }

  private async handleEventCallback(webhookEvent: SlackWebhookEvent): Promise<void> {
    const { event } = webhookEvent;

    switch (event.type) {
      case 'message':
        if (!event.subtype && event.text && event.text.includes('qa-bot')) {
          await this.handleMentionEvent(event);
        }
        break;
      
      case 'app_mention':
        await this.handleMentionEvent(event);
        break;
      
      default:
        logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleMentionEvent(event: any): Promise<void> {
    try {
      // Extract issue information from the mention
      const text = event.text.toLowerCase();
      
      if (text.includes('create issue') || text.includes('report bug')) {
        // Send a response asking for more details
        const user = await this.db.users()
          .where('slack_id', event.user)
          .first();

        if (user && user.slack_tokens) {
          await this.sendMessage(user.slack_tokens.accessToken, {
            channel: event.channel,
            threadTs: event.ts,
            text: "I can help you create an issue! Please use the QA Extension in your browser to capture the bug details, or provide more information about the issue you'd like to report.",
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: "I can help you create an issue! Here are your options:"
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: "• Use the QA Extension in your browser to capture bug details automatically\n• Click the button below to create an issue manually"
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Create Issue'
                    },
                    url: `${process.env.FRONTEND_URL}/issues/new`,
                    action_id: 'create_issue'
                  }
                ]
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('Error handling mention event:', error);
    }
  }

  public async storeUserTokens(userId: string, tokens: SlackTokens): Promise<void> {
    try {
      await this.db.users()
        .where('id', userId)
        .update({
          slack_id: tokens.userId,
          slack_tokens: tokens,
          updated_at: new Date()
        });

      // Cache tokens in Redis for quick access
      await this.ensureRedisConnected();
      try {
        await this.redis.set(
        `slack_tokens:${userId}`,
        JSON.stringify(tokens),
        tokens.expiresAt ? Math.floor((tokens.expiresAt - Date.now()) / 1000) : 86400 * 30
        );
      } catch {}

      logger.info(`Slack tokens stored for user: ${userId}`);
    } catch (error) {
      logger.error('Failed to store Slack tokens:', error);
      throw error;
    }
  }

  public async getUserTokens(userId: string): Promise<SlackTokens | null> {
    try {
      // Try Redis cache first (best-effort)
      await this.ensureRedisConnected();
      try {
        const cachedTokens = await this.redis.get(`slack_tokens:${userId}`);
        if (cachedTokens) {
          return JSON.parse(cachedTokens);
        }
      } catch {}

      // Fallback to database
      const user = await this.db.users()
        .where('id', userId)
        .select('slack_tokens')
        .first();

      if (user && user.slack_tokens) {
        // Update cache (best-effort)
        try {
          await this.ensureRedisConnected();
          await this.redis.set(
            `slack_tokens:${userId}`,
            JSON.stringify(user.slack_tokens),
            86400 // 24 hours
          );
        } catch {}
        return user.slack_tokens;
      }

      return null;
    } catch (error) {
      logger.error('Failed to get Slack tokens:', error);
      return null;
    }
  }

  private getSeverityEmoji(severity: string): string {
    const emojiMap: { [key: string]: string } = {
      critical: '🔴',
      high: '🟡',
      medium: '🟠',
      low: '🟢'
    };
    return emojiMap[severity] || '⚪';
  }

  private getPriorityEmoji(priority: string): string {
    const emojiMap: { [key: string]: string } = {
      urgent: '🚨',
      high: '⚡',
      normal: '📋',
      low: '📝'
    };
    return emojiMap[priority] || '📋';
  }

  public async testConnection(accessToken: string): Promise<boolean> {
    try {
      await this.apiClient.get('auth.test', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return true;
    } catch (error) {
      logger.error('Slack connection test failed:', error);
      return false;
    }
  }
}
