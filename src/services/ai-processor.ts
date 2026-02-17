import { RawEvent, TestBlueprint } from '@/types/recording';

export class AIProcessor {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async generateBlueprint(events: RawEvent[]): Promise<TestBlueprint> {
    if (!this.apiKey) {
      throw new Error('Google API Key is not configured');
    }

    const prompt = this.constructPrompt(events);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Gemini API Error: ${response.status} ${errorData.error?.message || response.statusText}`
        );
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      return JSON.parse(text) as TestBlueprint;
    } catch (error) {
      throw error;
    }
  }

  private constructPrompt(events: RawEvent[]): string {
    const eventsSummary = events.map(e => ({
      type: e.type,
      tagName: e.element.tagName,
      selector: e.element.selector,
      text: e.element.textContent,
      value: e.value,
      url: e.url,
    }));

    return `You are a test automation expert. Convert the following raw browser recording events into a clean, structured, and parameterized test blueprint.
Analyze the events to identify the main user flow and group them into logical steps.
Parameterize dynamic values like usernames, search queries, or form inputs using the \${parameterName} syntax.

Input Events:
${JSON.stringify(eventsSummary, null, 2)}

Return ONLY a JSON object matching this TypeScript interface:
interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  value?: string;
  description: string;
}

interface TestBlueprint {
  name: string;
  description: string;
  steps: TestStep[];
  parameters: string[]; // List of parameter names used in steps
}
`;
  }
}
