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
      parentInfo: e.element.parentInfo,
      structuralInfo: e.element.structuralInfo,
    }));

    return `You are a test automation expert specialized in Playwright. Your goal is to convert browser recording events into a ROCK-SOLID test blueprint that avoids flakiness.

Analyze the events and follow these STRICT guidelines for selector selection:

1. INITIAL NAVIGATION (MANDATORY):
   - The first step in 'steps' MUST ALWAYS be a 'navigate' action to the starting URL: ${startUrl || events[0]?.url || 'the current page'}.

2. SELECTOR PRIORITY (Highest to Lowest):
   - Priority 1 - Unique IDs: #submit-button
   - Priority 2 - Data Test Attributes: [data-testid="login-btn"]
   - Priority 3 - Semantic Roles + Text: Use Playwright-style :has-text() pseudo-class.
     Example: "li[role='menuitem']:has-text('Master Data')" or "a[role='link']:has-text('District')"
   - Priority 4 - Unique XPath: Use stable XPath from 'xpathCandidates' (prefer normalize-space() patterns)

3. FORBIDDEN SELECTORS (CRITICAL):
   - NEVER use double quotes (") inside the 'selector' string. ALWAYS use single quotes (').
   - NEVER use naked generic tags like "div", "span", "a", "li", "input" without attributes or text.
   - NEVER use naked roles like "[role='menuitem']" or "[role='link']" if they appear multiple times.
   - Avoid brittle nth-child selectors (e.g., "li:nth-child(9) > div") unless last resort.

4. ELEMENT HINTS (CRITICAL FOR RELIABILITY):
   ALWAYS populate 'elementHints' with ALL available information from the input event:
   
   - tagName: Element tag (e.g., 'button', 'a', 'li', 'div')
   - textContent: Visible text (e.g., 'Submit Form', 'Settings')
   - attributes: Key attributes ({ role: 'button', 'aria-label': 'Submit' })
   - parentInfo: Parent element context { tagName: 'div', id: 'menu', selector: '#menu' }
   - structuralInfo: DOM position context { depth: 3, siblingIndex: 2, totalSiblings: 5 }
   
   These hints are used as FALLBACK when selectors fail - make them comprehensive!

5. BLUEPRINT STRUCTURE:
   Return a JSON object with:
   - name: Descriptive test name
   - description: What this test does
   - setup: Pre-test actions (login, navigate to base) - use empty array if not needed
   - steps: Main test actions (your recorded interactions)
   - teardown: Cleanup actions (logout, clear data) - use empty array if not needed
   - parameters: Must be empty array []
   - fallbackPolicy: 'agent_resolve' or 'fail' - how to handle selector failures

6. FALLBACK POLICY:
   - Set 'fallbackPolicy': 'agent_resolve' when selector might be fragile
   - The engine will use elementHints for resolution when primary selector fails

7. STICKINESS & DISAMBIGUATION:
   - Every selector must be "strict" - ideally point to exactly ONE element
   - For 'has-text' filters, use the most unique part of the text
   - Prefer XPath with normalize-space() for text matching (handles whitespace variations)

Input Events:
${JSON.stringify(eventsSummary, null, 2)}

Return ONLY a JSON object with these interfaces:

TestStep {
  action: 'click' | 'type' | 'navigate' | 'select' | 'assert';
  selector: string (MANDATORY - Playwright-compatible with single quotes);
  selectorCandidates?: string[] (alternative selectors if primary fails);
  xpath?: string (XPath alternative - prefer normalize-space patterns);
  xpathCandidates?: string[];
  elementHints?: {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    parentInfo?: { tagName: string; id?: string; selector?: string };
    structuralInfo?: { depth: number; siblingIndex: number; totalSiblings: number };
  };
  value?: string;
  description: string;
  expectedValue?: string;
  assertionType?: 'equals' | 'contains' | 'exists' | 'not_exists' | 'visible' | 'hidden';
  isAssertion?: boolean;
  fallbackPolicy?: 'agent_resolve' | 'fail';
  timeoutMs?: number;
  retryCount?: number;
}

TestBlueprint {
  name: string;
  description: string;
  baseUrl?: string;
  setup?: TestStep[];
  steps: TestStep[];
  teardown?: TestStep[];
  parameters: string[];
  fallbackPolicy?: 'agent_resolve' | 'fail';
}

FINAL RULES:
1. 'navigate' actions: value = URL from the input event
2. 'type' actions: value = typed text from input event
3. 'click' actions: No value needed, use selector for target
4. ENSURE ALL SELECTORS USE SINGLE QUOTES (') TO PREVENT BACKSLASH ESCAPING IN JSON
5. Add comprehensive 'elementHints' for ALL non-navigate steps (they are critical fallbacks!)
6. Group repetitive clicks/inputs into logical high-level steps
7. For 'assert' actions: set assertionType and expectedValue
8. Do NOT parameterize - preserve literal recorded values
9. Always return "parameters": []
10. Prefer XPath with normalize-space() for text-based matching (most robust)
`;
  }
}
