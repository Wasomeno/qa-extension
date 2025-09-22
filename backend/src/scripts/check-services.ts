#!/usr/bin/env npx ts-node

import { EnvConfig } from '../config/env';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';

/**
 * Service availability checker
 * Provides clear guidance on what's running and what's not
 */
class ServiceChecker {
  async checkAll(): Promise<void> {
    console.log('🔍 Checking service availability...\n');

    const results = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      openai: this.checkOpenAI(),
      gitlab: this.checkGitLab(),
      slack: this.checkSlack(),
    };

    this.printSummary(results);
    this.printGuidance(results);
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      const db = new DatabaseService();
      await db.connect();
      await db.disconnect();
      console.log('✅ PostgreSQL: Connected successfully');
      return true;
    } catch (error) {
      console.log('❌ PostgreSQL: Not available');
      console.log(`   Error: ${(error as Error).message}`);
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const redis = new RedisService();
      await redis.connect();
      await redis.disconnect();
      console.log('✅ Redis: Connected successfully');
      return true;
    } catch (error) {
      console.log('❌ Redis: Not available');
      console.log(`   Error: ${(error as Error).message}`);
      return false;
    }
  }

  private checkOpenAI(): boolean {
    const available = EnvConfig.isServiceAvailable('openai');
    if (available) {
      console.log('✅ OpenAI: API key configured');
    } else {
      console.log('⚠️  OpenAI: API key not configured (AI features disabled)');
    }
    return available;
  }

  private checkGitLab(): boolean {
    const available = EnvConfig.isServiceAvailable('gitlab');
    if (available) {
      console.log('✅ GitLab: OAuth configured');
    } else {
      console.log(
        '⚠️  GitLab: OAuth not configured (GitLab integration disabled)'
      );
    }
    return available;
  }

  private checkSlack(): boolean {
    const available = EnvConfig.isServiceAvailable('slack');
    if (available) {
      console.log('✅ Slack: OAuth configured');
    } else {
      console.log(
        '⚠️  Slack: OAuth not configured (Slack integration disabled)'
      );
    }
    return available;
  }

  private printSummary(results: any): void {
    const total = Object.keys(results).length;
    const available = Object.values(results).filter(Boolean).length;
    const critical = results.database ? 1 : 0;

    console.log('\n📊 Summary:');
    console.log(`   Services available: ${available}/${total}`);
    console.log(
      `   Critical services: ${critical}/1 ${critical ? '✅' : '❌'}`
    );

    if (critical === 0 && EnvConfig.NODE_ENV === 'development') {
      console.log('   🚀 Development mode: Server will start anyway');
    } else if (critical === 0) {
      console.log('   🚨 Production mode: Server may not start properly');
    }
  }

  private printGuidance(results: any): void {
    console.log('\n💡 Quick Setup Guide:');

    if (!results.database) {
      console.log('\n📦 PostgreSQL Setup:');
      console.log('   # macOS (Homebrew)');
      console.log('   brew install postgresql');
      console.log('   brew services start postgresql');
      console.log('   createdb qa_command_center');
      console.log('');
      console.log('   # Or use Docker');
      console.log('   docker run -d --name postgres -p 5432:5432 \\');
      console.log('     -e POSTGRES_PASSWORD=qa_password \\');
      console.log('     -e POSTGRES_USER=qa_user \\');
      console.log('     -e POSTGRES_DB=qa_command_center \\');
      console.log('     postgres:13');
    }

    if (!results.redis) {
      console.log('\n🔄 Redis Setup:');
      console.log('   # macOS (Homebrew)');
      console.log('   brew install redis');
      console.log('   brew services start redis');
      console.log('');
      console.log('   # Or use Docker');
      console.log('   docker run -d --name redis -p 6379:6379 redis:6-alpine');
    }

    if (!results.openai) {
      console.log('\n🤖 OpenAI Setup (Optional):');
      console.log('   1. Get API key: https://platform.openai.com/api-keys');
      console.log('   2. Add to .env: OPENAI_API_KEY=sk-your-key-here');
    }

    if (!results.gitlab) {
      console.log('\n🦊 GitLab Setup (Optional):');
      console.log(
        '   1. Create OAuth app: https://gitlab.com/-/profile/applications'
      );
      console.log(
        '   2. Add to .env: GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET'
      );
    }

    if (!results.slack) {
      console.log('\n💬 Slack Setup (Optional):');
      console.log('   1. Create Slack app: https://api.slack.com/apps');
      console.log('   2. Add to .env: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET');
    }

    console.log('\n🎯 Ready to start:');
    console.log('   npm run dev    # Development with auto-reload');
    console.log('   npm start      # Production mode');
  }
}

// Run the checker
if (require.main === module) {
  const checker = new ServiceChecker();
  checker.checkAll().catch(console.error);
}
