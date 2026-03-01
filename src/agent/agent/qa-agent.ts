import { GoogleGenAI, Type, Tool } from '@google/genai';
import { createIssue, updateIssue, getProjectIssues } from '@/api/issue';
import { getProjects } from '@/api/project';
import { MessageType } from '@/types/messages';

const GITLAB_SPECIALIST_INSTRUCTION = `You are a GitLab Specialist. Your role is strictly limited to GitLab Issue and Project management.
 Use the available tools to list projects, list issues, create issues, or update issues.
 Be concise and report the outcome clearly.`;

const TEST_SPECIALIST_INSTRUCTION = `You are a Test Automation Specialist. Your role is strictly limited to listing and running recorded automation tests.
 Use the available tools to list tests and execute them.
 Be concise and report the outcome clearly.`;

const SYSTEM_INSTRUCTION = `You are a QA Assistant embedded in a Chrome extension. Your role is strictly limited to helping users with:

1. **GitLab Issue Management** — Creating, listing, updating, and discussing GitLab issues and projects.
2. **Recorded Automation Tests** — Listing and running recorded test blueprints, and comparing results against user expectations.

## Rules

- You MUST use the available tools (createGitLabIssue, listGitLabIssues, updateGitLabIssue, listGitLabProjects, listRecordedTests, runRecordedTest) to fulfill requests within your scope.
- If a user asks something OUTSIDE your scope (e.g., general knowledge, coding help, math, creative writing, weather, news, or any topic unrelated to GitLab issues and QA testing), respond with: "I'm focused on QA workflows and GitLab issue management. Can I help you with something in that area instead?"
- You MAY respond to basic greetings (hi, hello, how are you, thanks, etc.) in a friendly manner, but always briefly mention your capabilities so the user knows what you can help with.
- Do NOT generate code, explain programming concepts, answer trivia, or perform any task outside of GitLab issue management and automation test execution.
- When discussing issues or tests, be concise, structured, and actionable.
- Before running a recorded test, ALWAYS ask the user what the expected result should be.`;

export interface AgentConfig {
  googleApiKey: string;
  model?: string;
  maxHistoryTokens?: number;
  minRequestDelay?: number;
}

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: string; args: any; id: string }
  | { type: 'tool_result'; tool: string; result: any; id: string }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'done'; content: string };

export class QAAgent {
  private client: GoogleGenAI;
  private modelName: string;
  private history: any[] = [];
  private tools: Tool[];
  private systemInstruction: string = SYSTEM_INSTRUCTION;
  private maxHistoryTokens: number;
  private minRequestDelay: number;
  private lastRequestTime: number = 0;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.modelName = config.model || 'gemini-3-flash-preview';
    this.maxHistoryTokens = config.maxHistoryTokens || 12000; // Leaves room for response
    this.minRequestDelay = config.minRequestDelay || 500;

    // Initialize Google GenAI client
    this.client = new GoogleGenAI({
      apiKey: config.googleApiKey,
    } as any);

    // Define tools
    this.tools = [
      {
        functionDeclarations: [
          {
            name: 'delegateTask',
            description: 'Delegate a specific specialized task to a subagent.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                role: {
                  type: Type.STRING,
                  enum: ['gitlab_specialist', 'test_specialist'],
                  description: 'The specialized role required for the task.',
                },
                task: {
                  type: Type.STRING,
                  description: 'The specific instruction for the subagent.',
                },
              },
              required: ['role', 'task'],
            },
          },
          {
            name: 'createGitLabIssue',
            description: 'Create a new issue in GitLab.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                projectId: { type: Type.NUMBER }, // backend expects number
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                labels: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['projectId', 'title', 'description'],
            },
          },
          {
            name: 'listGitLabIssues',
            description: 'List issues from a GitLab project.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                projectId: { type: Type.NUMBER }, // backend expects number
                state: { type: Type.STRING },
              },
              required: ['projectId'],
            },
          },
          {
            name: 'updateGitLabIssue',
            description: 'Update an existing issue in GitLab.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                projectId: { type: Type.NUMBER }, // backend expects number
                issueIid: { type: Type.NUMBER },
                updates: { type: Type.OBJECT },
              },
              required: ['projectId', 'issueIid', 'updates'],
            },
          },
          // searchGitLabProjects removed as backend doesn't have a direct search endpoint wrapper yet,
          // but we can use listGitLabProjects with local filter or add search later if needed.
          // For now, I'll keep listGitLabProjects which calls getProjects.
          {
            name: 'listGitLabProjects',
            description: 'List all available projects.',
            parameters: {
              type: Type.OBJECT,
              properties: {},
            },
          },
          {
            name: 'listRecordedTests',
            description:
              'List all recorded automation tests (blueprints) available to run.',
            parameters: {
              type: Type.OBJECT,
              properties: {},
            },
          },
          {
            name: 'runRecordedTest',
            description:
              'Run a recorded automation test. ALWAYS ask the user for the expected result BEFORE running this tool. This tool will wait for the test to complete in a new tab and return the actual outcome. You can provide variables to override recorded values (e.g. email, password).',
            parameters: {
              type: Type.OBJECT,
              properties: {
                testId: {
                  type: Type.STRING,
                  description: 'The ID of the recorded test to run.',
                },
                variables: {
                  type: Type.OBJECT,
                  description:
                    'Optional key-value pairs to override parameterized values in the test (e.g., {"email": "user@example.com"}).',
                },
              },
              required: ['testId'],
            },
          },
        ],
      },
    ];
  }

  public async uploadFile(file: string | Blob, config?: { mimeType: string }) {
    return await (this.client as any).files.upload({
      file,
      config,
    });
  }

  private estimateTokens(parts: any[]): number {
    let totalChars = 0;
    for (const part of parts) {
      if (part.text) totalChars += part.text.length;
      if (part.inlineData) totalChars += part.inlineData.data.length;
      if (part.fileData) totalChars += 100; // Reference is small, constant estimate
      if (part.functionCall)
        totalChars += JSON.stringify(part.functionCall).length;
      if (part.functionResponse)
        totalChars += JSON.stringify(part.functionResponse).length;
    }
    // Very rough heuristic: 1 token ≈ 4 characters
    return Math.ceil(totalChars / 4);
  }

  private trimHistory(): void {
    let currentTokens = 0;
    const estimatedTokens = this.history.map(msg =>
      this.estimateTokens(msg.parts || [])
    );
    currentTokens = estimatedTokens.reduce((sum, t) => sum + t, 0);

    if (currentTokens <= this.maxHistoryTokens) return;

    // Always keep the system message/initial prompt if it's there (history[0])
    // And always keep the most recent N messages
    while (currentTokens > this.maxHistoryTokens && this.history.length > 3) {
      // Remove from the beginning (after any system message)
      const removedTokens = estimatedTokens.splice(1, 1)[0];
      this.history.splice(1, 1);
      currentTokens -= removedTokens;
    }
  }

  private async adaptiveDelay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestDelay) {
      const waitTime = this.minRequestDelay - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  private async safeGenerateContent(
    options: any,
    retries = 3,
    delay = 2000
  ): Promise<any> {
    await this.adaptiveDelay();
    try {
      return await this.client.models.generateContent(options);
    } catch (error: any) {
      if (
        retries > 0 &&
        (error.message?.includes('429') ||
          error.status === 429 ||
          error.message?.includes('Too Many Requests'))
      ) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.safeGenerateContent(options, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  public async *chat(
    input: string,
    options?: {
      signal?: AbortSignal;
      attachments?: Array<{ mimeType: string; data?: string; fileUri?: string }>;
    }
  ): AsyncGenerator<AgentEvent> {
    const parts: any[] = [{ text: input }];

    if (options?.attachments && options.attachments.length > 0) {
      options.attachments.forEach(attachment => {
        if (attachment.fileUri) {
          parts.push({
            fileData: {
              mimeType: attachment.mimeType,
              fileUri: attachment.fileUri,
            },
          });
        } else if (attachment.data) {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.data,
            },
          });
        }
      });
    }

    this.history.push({ role: 'user', parts });
    this.trimHistory();

    try {
      let response = await this.safeGenerateContent({
        model: this.modelName,
        contents: this.history,
        config: {
          tools: this.tools,
          systemInstruction: this.systemInstruction,
        },
      });

      let responseText = response.text;
      let functionCalls = response.functionCalls;
      let currentStep = 0;
      const MAX_STEPS = 5;

      while (functionCalls && functionCalls.length > 0) {
        if (currentStep >= MAX_STEPS) {
          yield {
            type: 'error',
            message: 'Agent reached maximum function call limit.',
          };
          break;
        }
        currentStep++;

        if (response.candidates?.[0]?.content) {
          this.history.push(response.candidates[0].content);
        }

        const toolPromises = functionCalls.map(async (call: any) => {
          const { name, args } = call;
          if (!name) return null;

          const callId = Math.random().toString(36).substring(7);
          const safeArgs = args || {};

          // We can't yield from within map/Promise.all easily while maintaining generator flow,
          // but we can return the event to be yielded by the main loop.
          // Actually, we'll yield the tool_call event before starting Promise.all.
          return { name, safeArgs, callId };
        });

        const activeCalls = (await Promise.all(toolPromises)).filter(
          c => c !== null
        );

        for (const call of activeCalls) {
          yield {
            type: 'tool_call',
            tool: call.name,
            args: call.safeArgs,
            id: call.callId,
          };
        }

        const results = await Promise.all(
          activeCalls.map(async call => {
            const { name, safeArgs, callId } = call;
            let result: any;
            try {
              switch (name) {
                case 'createGitLabIssue': {
                  const projectId = Number(safeArgs.projectId);
                  if (isNaN(projectId)) throw new Error('Invalid project ID');
                  result = await createIssue(projectId, {
                    title: (safeArgs.title as string) || '',
                    description: (safeArgs.description as string) || '',
                    labels: (safeArgs.labels as string[]) || [],
                  });
                  break;
                }
                case 'listGitLabIssues':
                  result = await getProjectIssues(Number(safeArgs.projectId), {
                    state: safeArgs.state as string,
                  });
                  break;
                case 'updateGitLabIssue': {
                  const projectId = Number(safeArgs.projectId);
                  const issueIid = Number(safeArgs.issueIid);
                  if (isNaN(projectId) || isNaN(issueIid))
                    throw new Error('Invalid project ID or issue IID');
                  result = await updateIssue(
                    projectId,
                    issueIid,
                    (safeArgs.updates as any) || {}
                  );
                  break;
                }
                case 'listGitLabProjects':
                  result = await getProjects();
                  break;
                case 'delegateTask':
                  const subAgent = new QAAgent({
                    ...this.config,
                  });
                  // Filter tools based on role
                  if (safeArgs.role === 'gitlab_specialist') {
                    subAgent['systemInstruction'] =
                      GITLAB_SPECIALIST_INSTRUCTION;
                    subAgent.tools = [
                      {
                        functionDeclarations:
                          this.tools[0].functionDeclarations?.filter(f =>
                            [
                              'createGitLabIssue',
                              'listGitLabIssues',
                              'updateGitLabIssue',
                              'listGitLabProjects',
                            ].includes(f.name || '')
                          ) || [],
                      },
                    ];
                    // Run subagent chat
                    const subStream = subAgent.chat(safeArgs.task as string);
                    let finalContent = '';
                    for await (const event of subStream) {
                      if (event.type === 'text') finalContent += event.content;
                      if (event.type === 'done') finalContent = event.content;
                    }
                    result = finalContent || 'Task completed with no summary.';
                  } else if (safeArgs.role === 'test_specialist') {
                    subAgent['systemInstruction'] = TEST_SPECIALIST_INSTRUCTION;
                    subAgent.tools = [
                      {
                        functionDeclarations:
                          this.tools[0].functionDeclarations?.filter(f =>
                            ['listRecordedTests', 'runRecordedTest'].includes(
                              f.name || ''
                            )
                          ) || [],
                      },
                    ];
                    const subStream = subAgent.chat(safeArgs.task as string);
                    let finalContent = '';
                    for await (const event of subStream) {
                      if (event.type === 'text') finalContent += event.content;
                      if (event.type === 'done') finalContent = event.content;
                    }
                    result = finalContent || 'Task completed with no summary.';
                  } else {
                    throw new Error(`Unknown role: ${safeArgs.role}`);
                  }
                  break;
                case 'listRecordedTests':
                  result = await new Promise(resolve => {
                    chrome.runtime.sendMessage(
                      { type: MessageType.GET_RECORDED_TESTS },
                      async response => {
                        if (chrome.runtime.lastError) {
                          resolve({ error: chrome.runtime.lastError.message });
                        } else {
                          const tests = (response.data || []) as any[];
                          const storage = await chrome.storage.local.get([
                            'lastBlueprint',
                          ]);
                          const lastDraft = storage.lastBlueprint;
                          if (
                            lastDraft &&
                            lastDraft.status === 'ready' &&
                            !tests.some(t => t.id === lastDraft.id)
                          ) {
                            tests.unshift({
                              ...lastDraft,
                              name: `${lastDraft.name} (Draft)`,
                            });
                          }
                          resolve(
                            tests.map((t: any) => ({
                              id: t.id,
                              name: t.name,
                              description: t.description,
                              stepsCount: t.steps?.length || 0,
                              baseUrl: t.baseUrl,
                            }))
                          );
                        }
                      }
                    );
                  });
                  break;
                case 'runRecordedTest':
                  const blueprintsResult: any = await new Promise(resolve => {
                    chrome.runtime.sendMessage(
                      { type: MessageType.GET_RECORDED_TESTS },
                      async response => {
                        const tests = (response.data || []) as any[];
                        const storage = await chrome.storage.local.get([
                          'lastBlueprint',
                        ]);
                        if (storage.lastBlueprint) {
                          tests.push(storage.lastBlueprint);
                        }
                        resolve(tests);
                      }
                    );
                  });
                  const blueprint = blueprintsResult.find(
                    (b: any) => b.id === safeArgs.testId
                  );
                  if (!blueprint)
                    throw new Error(
                      `Test with ID ${safeArgs.testId} not found.`
                    );
                  if (!blueprint.steps || blueprint.steps.length === 0)
                    throw new Error(
                      `Test "${blueprint.name}" has no steps to execute.`
                    );
                  result = await new Promise(resolve => {
                    chrome.runtime.sendMessage(
                      {
                        type: MessageType.START_PLAYBACK,
                        data: {
                          blueprint,
                          waitForCompletion: true,
                          variables: safeArgs.variables || {},
                        },
                      },
                      response => {
                        if (chrome.runtime.lastError) {
                          resolve({ error: chrome.runtime.lastError.message });
                        } else {
                          resolve(response);
                        }
                      }
                    );
                  });
                  break;
                default:
                  throw new Error(`Unknown tool: ${name}`);
              }
              return { name, result, callId };
            } catch (error: any) {
              return {
                name,
                result: { error: error.message || 'Unknown error' },
                callId,
              };
            }
          })
        );

        for (const res of results) {
          yield {
            type: 'tool_result',
            tool: res.name,
            result: res.result,
            id: res.callId,
          };
          this.history.push({
            role: 'tool',
            parts: [
              {
                functionResponse: {
                  name: res.name,
                  response: { result: res.result },
                },
              },
            ],
          });
        }

        this.trimHistory();
        response = await this.safeGenerateContent({
          model: this.modelName,
          contents: this.history,
          config: {
            tools: this.tools,
            systemInstruction: this.systemInstruction,
          },
        });

        responseText = response.text;
        functionCalls = response.functionCalls;
      }

      if (responseText) {
        if (response.candidates?.[0]?.content) {
          this.history.push(response.candidates[0].content);
        }
        yield { type: 'text', content: responseText };
        yield { type: 'done', content: responseText };
      }
    } catch (error: any) {
      yield { type: 'error', message: error.message || 'An error occurred.' };
    }
  }
}
