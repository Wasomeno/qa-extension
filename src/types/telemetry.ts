export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
}

export interface NetworkRequestEntry {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestPayload?: string;
  responsePayload?: string;
  timestamp: number;
  durationMs?: number;
  error?: string;
}

export interface JSErrorEntry {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: number;
}

export interface StorageSnapshot {
  type: 'localStorage' | 'sessionStorage' | 'cookies';
  data: Record<string, string>;
  timestamp: number;
}

export interface DOMMutationEntry {
  type: 'childList' | 'attributes' | 'characterData';
  target: string;
  summary: string;
  timestamp: number;
}

export interface StepContext {
  stepIndex: number;
  timestamp: number;
  screenshot?: string;
  surroundingLogs: ConsoleLogEntry[];
  surroundingRequests: NetworkRequestEntry[];
  surroundingErrors: JSErrorEntry[];
  domMutationCount: number;
}

export interface BrowserContext {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  url: string;
}

export interface SessionTelemetry {
  recordingId: string;
  startUrl: string;
  startTime: number;
  endTime?: number;
  browserContext: BrowserContext;
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  jsErrors: JSErrorEntry[];
  storageSnapshots: StorageSnapshot[];
  domMutations: DOMMutationEntry[];
  stepsWithContext: StepContext[];
}

export interface TelemetryExportOptions {
  includeScreenshots?: boolean;
  maxLogsPerStep?: number;
  maxRequestsPerStep?: number;
}

/**
 * Generates an LLM-optimized Markdown transcript from session telemetry.
 * This format is designed to be pasted into ChatGPT, Claude, etc.
 */
export function generateLLMTranscript(
  telemetry: SessionTelemetry,
  steps: { action: string; description: string; value?: string; selector?: string }[],
  options: TelemetryExportOptions = {}
): string {
  const { maxLogsPerStep = 10, maxRequestsPerStep = 10 } = options;

  const duration = telemetry.endTime
    ? `${((telemetry.endTime - telemetry.startTime) / 1000).toFixed(1)}s`
    : 'N/A';

  const bc = telemetry.browserContext;
  const userAgent = bc?.userAgent || 'N/A';
  const viewport = bc?.viewport ? `${bc.viewport.width}x${bc.viewport.height}` : 'N/A';

  let md = `# Test Session Transcript

**URL:** ${telemetry.startUrl || 'N/A'}  
**Duration:** ${duration}  
**Browser:** ${userAgent}  
**Viewport:** ${viewport}  

---

`;

  // Summary stats
  const consoleLogs = telemetry.consoleLogs || [];
  const networkRequests = telemetry.networkRequests || [];
  const jsErrors = telemetry.jsErrors || [];
  const domMutations = telemetry.domMutations || [];

  const errorCount = jsErrors.length;
  const failedRequests = networkRequests.filter(r => r.status && r.status >= 400).length;

  md += `## Summary
- **Steps:** ${steps.length}
- **Console Logs:** ${consoleLogs.length}
- **JS Errors:** ${errorCount}${errorCount > 0 ? ' ⚠️' : ''}
- **Network Requests:** ${networkRequests.length}
- **Failed Requests:** ${failedRequests}${failedRequests > 0 ? ' ⚠️' : ''}
- **DOM Mutations:** ${domMutations.length}

---

`;

  // Global console errors first (so LLM sees them upfront)
  if (jsErrors.length > 0) {
    md += `## JavaScript Errors
`;
    for (const err of jsErrors) {
      const time = new Date(err.timestamp).toISOString().split('T')[1].slice(0, -1);
      md += `- **[${time}]** \`${err.message}\``;
      if (err.source) md += ` at ${err.source}:${err.line}`;
      md += `\n`;
    }
    md += `\n---\n\n`;
  }

  // Failed network requests
  const failedReqs = networkRequests.filter(r => r.status && r.status >= 400);
  if (failedReqs.length > 0) {
    md += `## Failed Network Requests
`;
    for (const req of failedReqs) {
      const time = new Date(req.timestamp).toISOString().split('T')[1].slice(0, -1);
      md += `- **[${time}]** \`${req.method}\` ${req.url} → **${req.status} ${req.statusText}**`;
      if (req.error) md += ` (Error: ${req.error})`;
      md += `\n`;
    }
    md += `\n---\n\n`;
  }

  // Steps with context
  md += `## Steps\n\n`;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const ctx = telemetry.stepsWithContext?.find(c => c.stepIndex === i);
    const stepTime = ctx
      ? new Date(ctx.timestamp).toISOString().split('T')[1].slice(0, -1)
      : 'N/A';

    md += `### ${i + 1}. [${stepTime}] ${step.action.toUpperCase()}: ${step.description}\n`;
    if (step.value) {
      md += `- **Value:** \`${step.value}\`\n`;
    }
    if (step.selector) {
      md += `- **Selector:** \`${step.selector}\`\n`;
    }

    if (ctx) {
      // Surrounding logs
      const rawLogs = ctx.surroundingLogs || [];
      const logs = rawLogs.slice(0, maxLogsPerStep);
      if (logs.length > 0) {
        md += `- **Console:**\n`;
        for (const log of logs) {
          const icon = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '•';
          md += `  ${icon} \`${log.message}\`\n`;
        }
      }

      // Surrounding requests
      const rawReqs = ctx.surroundingRequests || [];
      const reqs = rawReqs.slice(0, maxRequestsPerStep);
      if (reqs.length > 0) {
        md += `- **Network:**\n`;
        for (const req of reqs) {
          const status = req.status || 'pending';
          const statusEmoji = req.status && req.status >= 400 ? '❌' : '✅';
          md += `  ${statusEmoji} \`${req.method}\` ${req.url} → ${status}`;
          if (req.durationMs) md += ` (${req.durationMs}ms)`;
          if (req.requestPayload) {
            md += `\n    - Payload: \`${truncatePayload(req.requestPayload, 150)}\``;
          }
          if (req.responsePayload) {
            md += `\n    - Response: \`${truncatePayload(req.responsePayload, 150)}\``;
          }
          md += `\n`;
        }
      }

      // Surrounding errors
      if ((ctx.surroundingErrors || []).length > 0) {
        md += `- **Errors:**\n`;
        for (const err of (ctx.surroundingErrors || [])) {
          md += `  ❌ \`${err.message}\`\n`;
        }
      }

      if (ctx.domMutationCount > 0) {
        md += `- **DOM Mutations:** ${ctx.domMutationCount}\n`;
      }
    }

    md += `\n`;
  }

  // Full console log appendix (for deep debugging)
  if (consoleLogs.length > 0) {
    md += `---\n\n## Full Console Log\n\n`;
    for (const log of consoleLogs) {
      const time = new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1);
      const icon = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '•';
      md += `- **[${time}]** ${icon} \`${log.message}\`\n`;
    }
  }

  // Full network log appendix
  if (networkRequests.length > 0) {
    md += `\n---\n\n## Full Network Log\n\n`;
    for (const req of networkRequests) {
      const time = new Date(req.timestamp).toISOString().split('T')[1].slice(0, -1);
      const statusEmoji = req.status && req.status >= 400 ? '❌' : req.status ? '✅' : '⏳';
      md += `- **[${time}]** ${statusEmoji} \`${req.method}\` ${req.url} → ${req.status || 'pending'} ${req.statusText || ''}`;
      if (req.durationMs) md += ` (${req.durationMs}ms)`;
      if (req.error) md += ` [Error: ${req.error}]`;
      if (req.requestPayload) {
        md += `\n  - Request Payload: \`${truncatePayload(req.requestPayload, 200)}\``;
      }
      if (req.responsePayload) {
        md += `\n  - Response: \`${truncatePayload(req.responsePayload, 200)}\``;
      }
      md += `\n`;
    }
  }

  return md;
}

function truncatePayload(payload: string, maxChars: number): string {
  const cleaned = payload.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + '...';
}
