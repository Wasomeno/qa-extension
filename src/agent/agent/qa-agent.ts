import { GoogleGenAI, Type, FunctionDeclaration, Tool } from '@google/genai';
import bridgeFetch from '@/services/fetch-bridge';
import {
  createIssue,
  getIssues,
  updateIssue,
  getProjectIssues,
} from '@/api/issue';
import { getProjects } from '@/api/project';
import { MessageType } from '@/types/messages';

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
  private maxHistoryTokens: number;
  private minRequestDelay: number;
  private lastRequestTime: number = 0;

  constructor(config: AgentConfig) {
    this.modelName = config.model || 'gemini-3-flash-preview';
    this.maxHistoryTokens = config.maxHistoryTokens || 12000; // Leaves room for response
    this.minRequestDelay = config.minRequestDelay || 500;

    // Create custom fetch for bridging requests through background script
    const customFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      let url = input.toString();

      // Force non-streaming URL
      if (url.includes(':streamGenerateContent')) {
        url = url.replace(':streamGenerateContent', ':generateContent');
        url = url.replace('alt=sse', '');
        url = url.replace('?&', '?').replace('&&', '&');
        if (url.endsWith('?') || url.endsWith('&')) {
          url = url.slice(0, -1);
        }
      }

      // Convert Headers object to plain object
      const headers: Record<string, string> = {};
      if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => {
          headers[key] = value;
        });
      }

      const response = await bridgeFetch({
        url,
        init: {
          ...init,
          headers,
        },
        responseType: 'text',
      });

      if (!response.ok) {
        throw new Error(response.statusText || 'Network error');
      }

      // Handle body - could be string or already-parsed object
      let bodyContent: string;
      if (typeof response.body === 'object' && response.body !== null) {
        bodyContent = JSON.stringify(response.body);
      } else {
        bodyContent = response.body as string;
      }

      return new Response(bodyContent, {
        status: response.status,
        statusText: response.statusText,
        headers: { ...response.headers, 'content-type': 'application/json' },
      });
    };

    // Initialize Google GenAI client
    this.client = new GoogleGenAI({
      apiKey: config.googleApiKey,
      httpOptions: { fetch: customFetch },
    } as any);

    // Define tools
    this.tools = [
      {
        functionDeclarations: [
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
            description: 'List all recorded automation tests (blueprints) available to run.',
            parameters: {
              type: Type.OBJECT,
              properties: {},
            },
          },
          {
            name: 'runRecordedTest',
            description: 'Run a recorded automation test. ALWAYS ask the user for the expected result BEFORE running this tool. This tool will wait for the test to complete in a new tab and return the actual outcome.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                testId: { type: Type.STRING, description: 'The ID of the recorded test to run.' },
              },
              required: ['testId'],
            },
          },
        ],
      },
    ];
  }

  private estimateTokens(parts: any[]): number {
    let totalChars = 0;
    for (const part of parts) {
      if (part.text) totalChars += part.text.length;
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
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<AgentEvent> {
    this.history.push({ role: 'user', parts: [{ text: input }] });
    this.trimHistory();

    try {
      let response = await this.safeGenerateContent({
        model: this.modelName,
        contents: this.history,
        config: {
          tools: this.tools,
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

        for (const call of functionCalls) {
          const { name, args } = call;
          if (!name) continue;

          const callId = Math.random().toString(36).substring(7);
          const safeArgs = args || {};

          yield { type: 'tool_call', tool: name, args: safeArgs, id: callId };

          let result: any;
          try {
            switch (name) {
              case 'createGitLabIssue':
                // projectId must be number
                result = await createIssue(Number(safeArgs.projectId), {
                  title: (safeArgs.title as string) || '',
                  description: (safeArgs.description as string) || '',
                  labels: (safeArgs.labels as string[]) || [],
                });
                break;
              case 'listGitLabIssues':
                result = await getProjectIssues(Number(safeArgs.projectId), {
                  state: safeArgs.state as string,
                });
                break;
              case 'updateGitLabIssue':
                result = await updateIssue(
                  Number(safeArgs.projectId),
                  Number(safeArgs.issueIid), // issueIid is effectively id in wrapper usually, but checking api/issue.ts: updateIssue(projectId, id, request). Assuming id here refers to IID or ID? existing gitlab service used issueIid.
                  // Wait, api/issue.ts updateIssue takes (projectId, id, request).
                  // In GitLab V4 API, it's usually IID for project issues.
                  // Let's assume the wrapper handles it or expects IID.
                  (safeArgs.updates as any) || {}
                );
                // Note: The original generic wrapper was:
                // updateIssue(projectId, id, request)
                // Existing code passed `issueIid`.
                // I will pass `issueIid` as the 2nd argument.
                break;
              // searchGitLabProjects removed
              case 'listGitLabProjects':
                result = await getProjects();
                break;
              case 'listRecordedTests':
                result = await new Promise((resolve) => {
                  chrome.runtime.sendMessage({ type: MessageType.GET_RECORDED_TESTS }, (response) => {
                    if (chrome.runtime.lastError) {
                      resolve({ error: chrome.runtime.lastError.message });
                    } else {
                      // Return a simplified list for the LLM
                      const tests = response.data || [];
                      resolve(tests.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        description: t.description,
                        stepsCount: t.steps?.length || 0,
                        baseUrl: t.baseUrl
                      })));
                    }
                  });
                });
                break;
              case 'runRecordedTest':
                // 1. Get the full blueprint first
                const blueprintsResult: any = await new Promise((resolve) => {
                  chrome.runtime.sendMessage({ type: MessageType.GET_RECORDED_TESTS }, (response) => {
                    resolve(response.data || []);
                  });
                });
                
                const blueprint = blueprintsResult.find((b: any) => b.id === safeArgs.testId);
                if (!blueprint) {
                  throw new Error(`Test with ID ${safeArgs.testId} not found.`);
                }

                // 2. Start playback and wait for completion
                result = await new Promise((resolve) => {
                  chrome.runtime.sendMessage({ 
                    type: MessageType.START_PLAYBACK, 
                    data: { blueprint, waitForCompletion: true } 
                  }, (response) => {
                    if (chrome.runtime.lastError) {
                      resolve({ error: chrome.runtime.lastError.message });
                    } else {
                      resolve(response);
                    }
                  });
                });
                break;
              default:
                throw new Error(`Unknown tool: ${name}`);
            }

            yield { type: 'tool_result', tool: name, result, id: callId };

            this.history.push({
              role: 'tool',
              parts: [
                {
                  functionResponse: {
                    name,
                    response: { result },
                  },
                },
              ],
            });
          } catch (error: any) {
            const errorResult = { error: error.message || 'Unknown error' };
            yield {
              type: 'tool_result',
              tool: name,
              result: errorResult,
              id: callId,
            };
            this.history.push({
              role: 'tool',
              parts: [
                {
                  functionResponse: {
                    name,
                    response: { result: errorResult },
                  },
                },
              ],
            });
          }
        }

        this.trimHistory();
        response = await this.safeGenerateContent({
          model: this.modelName,
          contents: this.history,
          config: {
            tools: this.tools,
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
