import { GoogleGenerativeAI } from '@google/generative-ai';
import { RawEvent, TestBlueprint } from '@/types/recording';

export class AIProcessor {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Google API Key is not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  public async generateBlueprint(
    events: RawEvent[],
    startUrl?: string
  ): Promise<TestBlueprint> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = this.constructPrompt(events, startUrl);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      return JSON.parse(text) as TestBlueprint;
    } catch (error) {
      console.error('[AIProcessor] Error generating blueprint:', error);
      throw error;
    }
  }

  private constructPrompt(events: RawEvent[], startUrl?: string): string {
    const eventsSummary = events.map(e => ({
      type: e.type,
      tagName: e.element.tagName,
      selector: e.element.selector,
      selectorCandidates: e.element.selectorCandidates,
      xpath: e.element.xpath,
      xpathCandidates: e.element.xpathCandidates,
      attributes: e.element.attributes,
      text: e.element.textContent,
      value: e.value,
      url: e.url,
    }));

    return `You are a test automation expert specialized in Playwright. Your goal is to convert browser recording events into a ROCK-SOLID test blueprint that avoids flakiness.

Analyze the events and follow these STRICT guidelines for selector selection:

1. INITIAL NAVIGATION (MANDATORY):
   - The first step in 'steps' MUST ALWAYS be a 'navigate' action to the starting URL: ${startUrl || events[0]?.url || 'the current page'}.

2. SELECTOR PRIORITY (Highest to Lowest):
   - Unique IDs: #submit-button
   - Data Test Attributes: [data-testid="login-btn"]
   - Semantic Roles + Text (Playwright-First): If you combine role and text, use the Playwright-style :has-text() pseudo-class.
     Example: "li[role='menuitem']:has-text('Master Data')" or "a[role='link']:has-text('District')"
   - Unique XPath: Use a stable XPath from 'xpathCandidates' if CSS is too generic.

3. FORBIDDEN SELECTORS:
   - NEVER use double quotes (") inside the 'selector' string. ALWAYS use single quotes ('). This is CRITICAL to avoid backslash escaping in JSON.
     Correct: "//li[@role='menuitem']"
     Incorrect: "//li[@role=\"menuitem\"]"
   - NEVER use naked generic tags like "div", "span", "a", "li", "input" without identifying attributes or text.
   - NEVER use naked roles like "[role='menuitem']" or "[role='link']" if they appear multiple times on a page.
   - Avoid brittle nth-child selectors (e.g., "li:nth-child(9) > div") unless absolutely no other option exists.

4. STICKINESS & DISAMBIGUATION:
   - Every selector you choose must be "strict". It should ideally point to exactly one element.
   - Use 'elementHints' to provide extra context (tagName, textContent, attributes) to the execution engine.
   - For 'has-text' filters, use the most unique part of the text.

Input Events:
${JSON.stringify(eventsSummary, null, 2)}

Return ONLY a JSON object matching this TypeScript interface:
interface TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string; // MANDATORY: Use Playwright-compatible selector with single quotes
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
3. Prefer Playwright selectors (using :has-text) from 'selectorCandidates' or stable XPaths.
4. ENSURE ALL SELECTORS USE SINGLE QUOTES (') TO PREVENT BACKSLASH ESCAPING IN JSON.
5. Add 'elementHints' from input event data for click/type/select/assert steps (tagName, textContent, attributes).
6. Group repetitive clicks or inputs into logical high-level steps.
7. If a step is a verification (e.g., checking if a login was successful by looking for a username or success message), use the 'assert' action with 'assertionType': 'contains' or 'equals' and set 'expectedValue' to the text recorded in that event.
8. Do NOT parameterize values. Never output placeholders like \${baseUrl} or \${inputValue}. Preserve literal recorded values in 'value' and 'expectedValue'.
9. Always return "parameters": [].
`;
  }
}
