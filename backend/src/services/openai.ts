import OpenAI from 'openai';
import { DatabaseService } from './database';
import { RedisService } from './redis';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export interface IssueGenerationRequest {
  browserInfo: {
    url: string;
    title: string;
    userAgent: string;
    viewport: {
      width: number;
      height: number;
    };
  };
  errorDetails?: {
    message: string;
    stack?: string;
    type: string;
  };
  userDescription?: string;
  reproductionSteps?: string[];
  screenshots?: string[];
  consoleErrors?: string[];
  networkErrors?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
}

export interface GeneratedIssue {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  labels: string[];
  estimatedEffort?: string;
  affectedComponents?: string[];
}

export interface TestScriptGenerationRequest {
  issueData: any;
  recordingSteps?: any[];
  browserInfo?: {
    url: string;
    title: string;
    userAgent: string;
  };
}

export interface GeneratedTestScript {
  framework: 'playwright' | 'selenium' | 'cypress';
  language: 'javascript' | 'typescript' | 'python';
  script: string;
  description: string;
  prerequisites: string[];
  expectedOutcome: string;
}

export interface VoiceTranscriptionRequest {
  audioBlob: Buffer;
  language?: string;
  prompt?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
}

export interface SeverityClassificationRequest {
  errorType: string;
  errorMessage: string;
  affectedFunctionality: string;
  userImpact: string;
  businessImpact?: string;
  frequency?: string;
}

export interface ClassificationResult {
  severity: 'critical' | 'high' | 'medium' | 'low';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  confidence: number;
  reasoning: string;
}

export class OpenAIService {
  private client: OpenAI | null = null;
  private db: DatabaseService;
  private redis: RedisService;
  private model: string;

  constructor() {
    // Only initialize OpenAI if API key is available
    if (EnvConfig.isServiceAvailable('openai')) {
      this.client = new OpenAI({
        apiKey: EnvConfig.OPENAI_API_KEY,
      });
    } else {
      logger.warn('OpenAI service not available - API key not configured');
    }

    this.db = new DatabaseService();
    this.redis = new RedisService();
    this.model = EnvConfig.OPENAI_MODEL;
  }

  /**
   * Generate a full Markdown issue description by applying a fixed template
   * as the structure and filling sections using the provided free-form text.
   */
  public async generateDescriptionFromTemplate(
    userText: string,
    templateMarkdown: string,
    issueFormat: string
  ): Promise<string> {
    this.ensureOpenAIAvailable();

    if (!userText || !userText.trim()) {
      return templateMarkdown; // nothing to merge, return template
    }

    try {
      const systemPrompt = `You are a meticulous QA technical writer.

You must output a complete Markdown issue description that strictly follows the provided template's structure and formatting (headings, checkboxes, tables, separators). Do not add extra sections beyond the template. Replace placeholder/example content in each section using the user's text. Keep checkboxes and tables intact and filled where appropriate. Include concrete, concise content; infer steps/expectation from user text when possible. If a section isn't applicable, keep it but write "N/A" briefly.

Rules:
- DONT ASSUME THINGS
- If the passed issue format value is multiple, create a new section in the template with the title of Main Checklist placed at the start of the template.
- The Main Checklist section should contain a list of checkboxes items derived from the multiple issues checklists.
- If the issue format is multiple, create a DISTINCT separation using ========== between the Main Checklist section, between the Multiple Issues section, and between each Issue in the Multiple Issues section.
- Preserve all headings and their order
- Preserve horizontal rules and code/table blocks
- Preserve checklist syntax (- [ ] item) where used
- Keep the checklist syntax unchecked
- Keep response under 5000 characters
- Return ONLY the final Markdown, no commentary`;

      const userPrompt = `Template (use as structure only):\n\n${templateMarkdown}\n\n---\n\nUser Description (source to extract details from):\n\n${userText}\n\n---\n\nIssue Format: ${issueFormat}`;

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        1800
      );

      if (!response) throw new Error('No response from OpenAI');
      await this.trackUsage('template_description', 0);
      return response.trim();
    } catch (error) {
      logger.error('Failed to generate description from template:', error);
      // Fallback: return the original user text appended to the template
      return `${templateMarkdown}\n\n---\n\nOriginal Notes:\n\n${userText}`.slice(
        0,
        5000
      );
    }
  }

  /**
   * Try both token parameter variants to support newer models that no longer accept max_tokens.
   */
  private async safeChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tokenLimit: number,
    temperature?: number
  ): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    // Prefer Chat Completions first with max_completion_tokens (supported per error hints)
    let lastErr: any = null;
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_completion_tokens: tokenLimit,
      } as any);
      const text = res.choices?.[0]?.message?.content || '';
      if (text && text.trim()) return text;
      throw new Error('Empty chat completion content');
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      // If parameter not supported, try Responses API
      if (!/unsupported parameter|not supported/i.test(msg)) {
        // Not a param issue; proceed to try Responses anyway
      }
    }

    // Try Responses API next (typed input and token cap)
    try {
      const text = await this.tryResponsesAPI(
        messages,
        tokenLimit,
        temperature
      );
      if (text && text.trim()) return text;
      throw new Error('Empty responses output');
    } catch (e: any) {
      lastErr = lastErr || e;
    }

    // Final fallback: legacy max_tokens
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: tokenLimit,
      } as any);
      const text = res.choices?.[0]?.message?.content || '';
      if (text && text.trim()) return text;
      throw new Error('Empty chat completion content');
    } catch (e: any) {
      lastErr = lastErr || e;
    }

    throw lastErr || new Error('All completion attempts failed');
  }

  private async tryResponsesAPI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tokenLimit: number,
    temperature?: number
  ): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialized');
    // Split system instructions and the last user message into the fields
    const systemParts = messages
      .filter(m => m.role === 'system')
      .map(m => m.content);
    const userParts = messages
      .filter(m => m.role === 'user')
      .map(m => m.content);
    const instructions = systemParts.join('\n\n');
    const userInput = userParts.join('\n\n');

    const attempts: Array<Record<string, any>> = [];
    // 1) instructions + typed input
    attempts.push({
      max_output_tokens: tokenLimit,
      useTemp: false,
      mode: 'typed',
    });
    // 2) instructions + plain string input
    attempts.push({
      max_output_tokens: tokenLimit,
      useTemp: false,
      mode: 'plain',
    });

    let lastErr: any = null;
    for (const attempt of attempts) {
      try {
        const payload: any = { model: this.model, modalities: ['text'] };
        if (instructions) payload.instructions = instructions;
        if (attempt.mode === 'typed') {
          payload.input = [
            {
              role: 'user',
              content: [{ type: 'input_text', text: userInput }],
            },
          ];
        } else {
          payload.input =
            userInput ||
            messages
              .map(m => `${m.role.toUpperCase()}: ${m.content}`)
              .join('\n\n');
        }
        if (attempt.useTemp && typeof temperature === 'number')
          payload.temperature = temperature;
        if ('max_output_tokens' in attempt)
          payload.max_output_tokens = attempt.max_output_tokens;
        const res: any = await (this.client as any).responses.create(payload);
        const text = this.extractResponsesText(res);
        if (text && text.trim()) return text;
        throw new Error('Empty responses output');
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err);
        if (
          /unsupported parameter|unsupported value|does not support|not supported|Empty responses output/i.test(
            msg
          )
        ) {
          continue;
        }
        break;
      }
    }
    throw lastErr || new Error('Responses API failed');
  }

  private extractResponsesText(res: any): string {
    if (!res) return '';
    // 1) Convenience property (newer SDKs)
    if (typeof res.output_text === 'string' && res.output_text.trim()) {
      return res.output_text as string;
    }
    // 2) RFC-style output array
    if (Array.isArray(res.output)) {
      for (const item of res.output) {
        const content = item?.content;
        if (Array.isArray(content)) {
          const texts: string[] = [];
          for (const c of content) {
            if (typeof c?.text === 'string') texts.push(c.text);
            if (typeof c?.content === 'string') texts.push(c.content);
            if (c?.type === 'output_text' && typeof c?.text === 'string')
              texts.push(c.text);
          }
          const joined = texts.join('\n').trim();
          if (joined) return joined;
        }
      }
    }
    // 3) Some variants place text under res.message or choices-like shape
    const fallback =
      res?.message?.content || res?.choices?.[0]?.message?.content || '';
    return typeof fallback === 'string' ? fallback : '';
  }

  private ensureOpenAIAvailable(): void {
    if (!this.client) {
      // Attempt lazy initialization in case env was loaded after construction
      if (EnvConfig.isServiceAvailable('openai')) {
        try {
          this.client = new OpenAI({ apiKey: EnvConfig.OPENAI_API_KEY });
          return;
        } catch (e) {
          logger.error('Failed to initialize OpenAI client lazily:', e);
        }
      }
      throw new Error(
        'OpenAI service is not available. Please configure OPENAI_API_KEY environment variable.'
      );
    }
  }

  public async generateIssueFromContext(
    request: IssueGenerationRequest
  ): Promise<GeneratedIssue> {
    this.ensureOpenAIAvailable();

    try {
      const cacheKey = `issue_generation:${this.hashRequest(request)}`;

      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Returning cached issue generation result');
        return JSON.parse(cached);
      }

      const systemPrompt = this.buildIssueGenerationSystemPrompt();
      const userPrompt = this.buildIssueGenerationUserPrompt(request);

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        2000,
        0.3
      );
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const generatedIssue = this.parseIssueResponse(response);

      // Cache the result for 1 hour
      await this.redis.set(cacheKey, JSON.stringify(generatedIssue), 3600);

      logger.info('Successfully generated issue from context');
      await this.trackUsage('issue_generation', response.length);
      return generatedIssue;
    } catch (error) {
      logger.error('Failed to generate issue from context:', error);
      throw new Error('Failed to generate issue description');
    }
  }

  public async generateAcceptanceCriteria(
    issueDescription: string,
    context?: any
  ): Promise<string[]> {
    this.ensureOpenAIAvailable();

    try {
      const cacheKey = `acceptance_criteria:${this.hashString(issueDescription + JSON.stringify(context || {}))}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const systemPrompt = `You are a QA expert who creates clear, testable acceptance criteria for software bugs and features.

Your acceptance criteria should be:
- Specific and measurable
- Written in Given-When-Then format when appropriate
- Cover both positive and negative test cases
- Include edge cases where relevant
- Be implementable by developers
- Be verifiable by testers

Return only a JSON array of acceptance criteria strings, no additional text.`;

      const userPrompt = `Create acceptance criteria for this issue:

Issue Description: ${issueDescription}

${context ? `Additional Context: ${JSON.stringify(context, null, 2)}` : ''}

Provide 3-7 clear, testable acceptance criteria.`;

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        1000,
        0.2
      );
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const criteria = JSON.parse(response.trim());

      // Cache for 24 hours
      await this.redis.set(cacheKey, JSON.stringify(criteria), 86400);

      logger.info('Successfully generated acceptance criteria');
      await this.trackUsage('acceptance_criteria', response.length);
      return criteria;
    } catch (error) {
      logger.error('Failed to generate acceptance criteria:', error);
      throw new Error('Failed to generate acceptance criteria');
    }
  }

  public async classifySeverityAndPriority(
    request: SeverityClassificationRequest
  ): Promise<ClassificationResult> {
    this.ensureOpenAIAvailable();

    try {
      const cacheKey = `classification:${this.hashRequest(request)}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const systemPrompt = `You are a QA expert who classifies bug severity and priority.

Severity Levels:
- CRITICAL: System crashes, data loss, security vulnerabilities, complete feature failure
- HIGH: Major functionality broken, significant user impact, workaround available but difficult
- MEDIUM: Moderate functionality issues, some user impact, reasonable workaround available
- LOW: Minor issues, cosmetic problems, minimal user impact

Priority Levels:
- URGENT: Must be fixed immediately, blocking release or causing major business impact
- HIGH: Should be fixed in current sprint/release
- NORMAL: Can be scheduled for upcoming releases
- LOW: Can be addressed in future releases

Consider: user impact, business impact, frequency, workarounds available, and affected user base.

Respond with JSON only: {"severity": "level", "priority": "level", "confidence": 0.95, "reasoning": "explanation"}`;

      const userPrompt = `Classify this issue:

Error Type: ${request.errorType}
Error Message: ${request.errorMessage}
Affected Functionality: ${request.affectedFunctionality}
User Impact: ${request.userImpact}
${request.businessImpact ? `Business Impact: ${request.businessImpact}` : ''}
${request.frequency ? `Frequency: ${request.frequency}` : ''}`;

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        500,
        0.1
      );
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const classification = JSON.parse(response.trim());

      // Cache for 24 hours
      await this.redis.set(cacheKey, JSON.stringify(classification), 86400);

      logger.info('Successfully classified issue severity and priority');
      await this.trackUsage('classification', response.length);
      return classification;
    } catch (error) {
      logger.error('Failed to classify issue:', error);
      // Return fallback classification
      return {
        severity: 'medium',
        priority: 'normal',
        confidence: 0.5,
        reasoning: 'Classification failed, using default values',
      };
    }
  }

  public async generateTestScript(
    request: TestScriptGenerationRequest
  ): Promise<GeneratedTestScript> {
    this.ensureOpenAIAvailable();

    try {
      const cacheKey = `test_script:${this.hashRequest(request)}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const framework = this.determineTestFramework(request);
      const language = this.determineLanguage(framework);

      const systemPrompt = this.buildTestScriptSystemPrompt(
        framework,
        language
      );
      const userPrompt = this.buildTestScriptUserPrompt(request);

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        2500,
        0.2
      );
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const testScript = this.parseTestScriptResponse(
        response,
        framework,
        language
      );

      // Cache for 1 hour
      await this.redis.set(cacheKey, JSON.stringify(testScript), 3600);

      logger.info(`Successfully generated ${framework} test script`);
      await this.trackUsage('test_script', response.length);
      return testScript;
    } catch (error) {
      logger.error('Failed to generate test script:', error);
      throw new Error('Failed to generate test script');
    }
  }

  public async improveIssueDescription(
    originalDescription: string,
    additionalContext?: any
  ): Promise<string> {
    this.ensureOpenAIAvailable();

    try {
      const systemPrompt = `You are a technical writer who improves bug reports and issue descriptions.

Make the description:
- Clear and concise
- Include relevant technical details
- Follow a consistent structure
- Add context where helpful
- Maintain professional tone
- Include steps to reproduce if missing
- Specify expected vs actual behavior

Return only the improved description, no additional text.`;

      const userPrompt = `Improve this issue description:

Original: ${originalDescription}

${additionalContext ? `Additional Context: ${JSON.stringify(additionalContext, null, 2)}` : ''}`;

      const response = await this.safeChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        1500,
        0.3
      );
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      logger.info('Successfully improved issue description');
      await this.trackUsage('improve_description', response.length);
      return response.trim();
    } catch (error) {
      logger.error('Failed to improve issue description:', error);
      return originalDescription; // Return original if improvement fails
    }
  }

  private buildIssueGenerationSystemPrompt(): string {
    return `You are a QA expert who creates detailed bug reports from user context and error information.

Generate a comprehensive issue report with:
- Clear, descriptive title
- Detailed description with context
- Acceptance criteria for fixing the issue
- Appropriate severity and priority levels
- Relevant labels
- Affected components if identifiable

Always consider user impact, technical severity, and business context.

Respond with JSON only in this format:
{
  "title": "Brief descriptive title",
  "description": "Detailed description with context and impact",
  "acceptanceCriteria": ["criteria1", "criteria2", "criteria3"],
  "severity": "critical|high|medium|low",
  "priority": "urgent|high|normal|low",
  "labels": ["label1", "label2"],
  "estimatedEffort": "1-2 hours|half day|1-2 days|1 week",
  "affectedComponents": ["component1", "component2"]
}`;
  }

  private buildIssueGenerationUserPrompt(
    request: IssueGenerationRequest
  ): string {
    let prompt = `Generate an issue report from this information:

Browser Context:
- URL: ${request.browserInfo.url}
- Page Title: ${request.browserInfo.title}
- User Agent: ${request.browserInfo.userAgent}
- Viewport: ${request.browserInfo.viewport.width}x${request.browserInfo.viewport.height}`;

    if (request.errorDetails) {
      prompt += `\n\nError Information:
- Type: ${request.errorDetails.type}
- Message: ${request.errorDetails.message}`;

      if (request.errorDetails.stack) {
        prompt += `\n- Stack Trace: ${request.errorDetails.stack.substring(0, 500)}...`;
      }
    }

    if (request.userDescription) {
      prompt += `\n\nUser Description: ${request.userDescription}`;
    }

    if (request.reproductionSteps && request.reproductionSteps.length > 0) {
      prompt += `\n\nReproduction Steps:\n${request.reproductionSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
    }

    if (request.expectedBehavior) {
      prompt += `\n\nExpected Behavior: ${request.expectedBehavior}`;
    }

    if (request.actualBehavior) {
      prompt += `\n\nActual Behavior: ${request.actualBehavior}`;
    }

    if (request.consoleErrors && request.consoleErrors.length > 0) {
      prompt += `\n\nConsole Errors:\n${request.consoleErrors.slice(0, 3).join('\n')}`;
    }

    if (request.networkErrors && request.networkErrors.length > 0) {
      prompt += `\n\nNetwork Errors:\n${request.networkErrors.slice(0, 3).join('\n')}`;
    }

    return prompt;
  }

  private buildTestScriptSystemPrompt(
    framework: string,
    language: string
  ): string {
    return `You are a test automation expert who creates ${framework} test scripts in ${language}.

Generate a complete, runnable test script that:
- Tests the specific issue or functionality
- Includes proper setup and teardown
- Uses best practices for ${framework}
- Has clear, descriptive test names
- Includes assertions
- Handles common edge cases
- Is maintainable and readable

Respond with JSON only:
{
  "framework": "${framework}",
  "language": "${language}",
  "script": "complete test script code",
  "description": "what this test validates",
  "prerequisites": ["prerequisite1", "prerequisite2"],
  "expectedOutcome": "expected test result"
}`;
  }

  private buildTestScriptUserPrompt(
    request: TestScriptGenerationRequest
  ): string {
    let prompt = `Create a test script for this issue:

Issue Title: ${request.issueData.title}
Issue Description: ${request.issueData.description}`;

    if (request.browserInfo) {
      prompt += `\n\nTarget URL: ${request.browserInfo.url}
Page Title: ${request.browserInfo.title}`;
    }

    // Recorded user actions removed

    if (request.issueData.acceptance_criteria) {
      prompt += `\n\nAcceptance Criteria:\n${request.issueData.acceptance_criteria
        .map((criteria: string, i: number) => `${i + 1}. ${criteria}`)
        .join('\n')}`;
    }

    return prompt;
  }

  private parseIssueResponse(response: string): GeneratedIssue {
    try {
      // Clean up the response and parse JSON
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      logger.error('Failed to parse OpenAI response:', error);
      // Return a basic issue structure
      return {
        title: 'Issue detected',
        description: response,
        acceptanceCriteria: [
          'Fix the issue',
          'Verify functionality works as expected',
        ],
        severity: 'medium',
        priority: 'normal',
        labels: ['bug'],
      };
    }
  }

  private parseTestScriptResponse(
    response: string,
    framework: string,
    language: string
  ): GeneratedTestScript {
    try {
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(cleanResponse);
    } catch (error) {
      logger.error('Failed to parse test script response:', error);
      return {
        framework: framework as any,
        language: language as any,
        script: response,
        description: 'Generated test script',
        prerequisites: ['Test environment setup'],
        expectedOutcome: 'Test should pass when issue is fixed',
      };
    }
  }

  private determineTestFramework(
    request: TestScriptGenerationRequest
  ): 'playwright' | 'selenium' | 'cypress' {
    // Simple logic to determine framework - can be made more sophisticated
    const url = request.browserInfo?.url || '';

    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return 'cypress'; // Good for local development
    }

    // Default to Playwright for modern web apps
    return 'playwright';
  }

  private determineLanguage(
    framework: string
  ): 'javascript' | 'typescript' | 'python' {
    // Prefer TypeScript for modern frameworks
    if (framework === 'playwright' || framework === 'cypress') {
      return 'typescript';
    }
    return 'javascript';
  }

  private hashRequest(request: any): string {
    const crypto = require('crypto');
    return crypto
      .createHash('md5')
      .update(JSON.stringify(request))
      .digest('hex');
  }

  private hashString(str: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex');
  }

  public async getUsageStats(): Promise<any> {
    try {
      // Get usage stats from Redis cache
      const stats = await this.redis.get('openai_usage_stats');
      return stats
        ? JSON.parse(stats)
        : {
            totalRequests: 0,
            totalTokens: 0,
            requestTypes: {},
          };
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      return null;
    }
  }

  public async transcribeVoice(
    request: VoiceTranscriptionRequest
  ): Promise<TranscriptionResult> {
    this.ensureOpenAIAvailable();

    try {
      const cacheKey = `transcription:${this.hashBuffer(request.audioBlob)}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Returning cached transcription result');
        return JSON.parse(cached);
      }

      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      // Convert buffer to file-like object for OpenAI API
      const audioFile = new File([request.audioBlob], 'audio.webm', {
        type: 'audio/webm',
      });

      const transcription = await this.client.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: request.language || 'en',
        prompt: request.prompt,
        response_format: 'verbose_json',
        temperature: 0.0,
      });

      const result: TranscriptionResult = {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
      };

      // Cache the result for 1 hour
      await this.redis.set(cacheKey, JSON.stringify(result), 3600);

      logger.info('Successfully transcribed voice input');
      await this.trackUsage('voice_transcription', transcription.text.length);

      return result;
    } catch (error) {
      logger.error('Failed to transcribe voice:', error);
      throw new Error('Failed to transcribe voice input');
    }
  }

  public async trackUsage(requestType: string, tokens: number): Promise<void> {
    try {
      const statsKey = 'openai_usage_stats';
      const currentStats = (await this.getUsageStats()) || {
        totalRequests: 0,
        totalTokens: 0,
        requestTypes: {},
      };

      currentStats.totalRequests += 1;
      currentStats.totalTokens += tokens;
      currentStats.requestTypes[requestType] =
        (currentStats.requestTypes[requestType] || 0) + 1;

      await this.redis.set(statsKey, JSON.stringify(currentStats), 86400 * 7); // Keep for 7 days
    } catch (error) {
      logger.error('Failed to track usage:', error);
    }
  }

  private hashBuffer(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}
