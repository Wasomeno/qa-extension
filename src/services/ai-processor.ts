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
      selectorCandidates: e.element.selectorCandidates,
      attributes: e.element.attributes,
      text: e.element.textContent,
      value: e.value,
      url: e.url,
    }));

    return `You are a test automation expert. Convert the following raw browser recording events into a clean and structured test blueprint.
Analyze the events to identify the main user flow and group them into logical steps.
Keep literal recorded values exactly as captured for URLs and inputs.

Input Events:
${JSON.stringify(eventsSummary, null, 2)}

Return ONLY a JSON object matching this TypeScript interface:
interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string;
  selectorCandidates?: string[];
  elementHints?: {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  };
  value?: string; // For 'navigate', this MUST be the URL. For 'type' and 'select', this is the input value.
  description: string;
  expectedValue?: string; // For 'assert', this is what the value/text should be.
  assertionType?: 'equals' | 'contains' | 'exists' | 'not_exists'; // Default is 'exists' if not specified.
}

interface TestBlueprint {
  name: string;
  description: string;
  steps: TestStep[];
  parameters: string[]; // Must always be an empty array
}

Guidelines:
1. For 'navigate' actions, use the 'url' from the input event as the 'value' property.
2. For 'type' actions, use the 'value' from the input event.
3. Prefer stable selectors from 'selectorCandidates' over brittle full DOM paths. Keep 'selectorCandidates' when available.
4. Add 'elementHints' from input event data for click/type/select/assert steps (tagName, textContent, attributes).
5. Group repetitive clicks or inputs into logical high-level steps.
6. If a step is a verification (e.g., checking if a login was successful by looking for a username or success message), use the 'assert' action with 'assertionType': 'contains' or 'equals' and set 'expectedValue' to the text recorded in that event.
7. Do NOT parameterize values. Never output placeholders like \${baseUrl} or \${inputValue}. Preserve literal recorded values in 'value' and 'expectedValue'.
8. Always return "parameters": [].
`;
  }
}
