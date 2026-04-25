import {
  ExtensionMessage,
  MessageType,
  BackgroundFetchRequest,
} from '../types/messages';
import { AIProcessor } from '../services/ai-processor';
import { RawEvent, TestRecording, TestStep } from '../types/recording';
import {
  SessionTelemetry,
  ConsoleLogEntry,
  NetworkRequestEntry,
  JSErrorEntry,
  StepContext,
} from '../types/telemetry';
import { api } from '../services/api';
import { SAMPLE_BLUEPRINT } from '../lib/seed-data';
import { isRestrictedUrl } from '../utils/domain-matcher';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const bucketName = process.env.R2_BUCKET_NAME;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'placeholder',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'placeholder',
  },
});

export class CDPHandler {
  private static attachedTabs: Set<number> = new Set();

  public static async attach(tabId: number): Promise<void> {
    if (this.attachedTabs.has(tabId)) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          this.attachedTabs.add(tabId);
          resolve();
        }
      });
    });
  }

  public static async detach(tabId: number): Promise<void> {
    if (!this.attachedTabs.has(tabId)) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          this.attachedTabs.delete(tabId);
          resolve();
        }
      });
    });
  }

  public static async sendCommand(
    tabId: number,
    method: string,
    params: any
  ): Promise<any> {
    await this.attach(tabId);
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  public static async click(
    tabId: number,
    x: number,
    y: number
  ): Promise<void> {
    // Playwright-style click: move, press, release
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  public static async type(tabId: number, text: string): Promise<void> {
    if (!text) return;

    console.log(`[CDPHandler.type] Using Input.insertText for: "${text}"`);
    
    // Use Input.insertText which handles all characters correctly
    // This is more reliable than individual key events for special characters
    await this.sendCommand(tabId, 'Input.insertText', {
      text: text,
    });
    
    console.log(`[CDPHandler.type] Input.insertText completed`);
  }

  public static async clearInput(tabId: number): Promise<void> {
    // Use JavaScript to clear the focused element's value
    // This is more reliable than keyboard shortcuts for handling autofill
    await this.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.activeElement;
          if (!el) return false;
          
          // Check if it's an input-like element
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            // Store the old value to check if change occurred
            const oldValue = el.value;
            
            // Clear the value
            el.value = '';
            
            // Dispatch events that frameworks listen to (React, Vue, etc.)
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Also try to clear any framework-specific state
            // React 16+
            const reactKey = Object.keys(el).find(key => 
              key.startsWith('__reactProps') || key.startsWith('__reactFiber')
            );
            if (reactKey) {
              const props = el[reactKey];
              if (props && typeof props.onChange === 'function') {
                props.onChange({ target: el });
              }
            }
            
            return oldValue !== '';
          }
          
          // For contenteditable elements
          if (el.isContentEditable) {
            const oldValue = el.textContent;
            el.textContent = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return oldValue !== '';
          }
          
          return false;
        })()
      `,
      returnByValue: true,
    });
  }

  public static async scroll(
    tabId: number,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY,
    });
  }
}

class BackgroundService {
  private aiProcessor: AIProcessor;
  private recordingEvents: RawEvent[] = [];
  private telemetry: Partial<SessionTelemetry> = {};
  private networkRequests: NetworkRequestEntry[] = [];
  private consoleLogs: ConsoleLogEntry[] = [];
  private jsErrors: JSErrorEntry[] = [];
  private pendingPlaybacks: Map<string, (result: any) => void> = new Map();
  private isStartingRecording = false;
  private thumbnailCache: Map<string, string> = new Map();
  private pendingThumbnails: Map<string, Array<(response: any) => void>> =
    new Map();
  private pendingVideoUrls: Map<string, string> = new Map();
  private pendingVideoUpload: Map<
    string,
    {
      promise: Promise<string | undefined>;
      resolve: (url: string | undefined) => void;
    }
  > = new Map();
  private cdpNetworkEnabled = false;

  constructor() {
    this.aiProcessor = new AIProcessor(__GOOGLE_API_KEY__);
    this.setupListeners();
  }

  private async uploadToR2(
    body: Uint8Array,
    fileName: string,
    contentType: string
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: body,
      ContentType: contentType,
    });

    await s3Client.send(command);
    const publicDomain =
      process.env.R2_PUBLIC_DOMAIN || 'YOUR_R2_PUBLIC_DOMAIN_HERE';
    return `${publicDomain}/${fileName}`;
  }

  private broadcast(payload: any) {
    // Send to extension contexts (popup, options page, etc.)
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
    // Also send to all tabs so content scripts receive the message
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) {
        if (tab.id) {
          try {
            chrome.tabs.sendMessage(tab.id, payload, () => {
              void chrome.runtime.lastError;
            });
          } catch {}
        }
      }
    });
  }

  private async notifyTab(tabId: number | undefined, payload: any) {
    if (!tabId) {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabId = tab?.id;
    }
    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, payload, () => {
          void chrome.runtime.lastError;
        });
      } catch {}
    }
  }

  private async withAuthHeaders(
    init?: RequestInit | null
  ): Promise<RequestInit> {
    const headers = { ...(init?.headers as Record<string, string>) };
    if (!headers['Authorization']) {
      try {
      } catch {}
    }
    return { ...(init || {}), headers } as RequestInit;
  }

  private setupListeners() {
    chrome.runtime.onInstalled.addListener(async () => {
      // Allow content scripts to access storage.session
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.setAccessLevel({
          accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        try {
          await this.handleMessage(message, sender, sendResponse);
        } catch (error) {
          try {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          } catch {}
        }
      })();
      return true;
    });

    // Port-based bridge
    chrome.runtime.onConnect.addListener(port => {
      if (!port) return;

      if (port.name === 'agent-chat-sse') {
        port.onMessage.addListener(async msg => {
          if (msg.type !== MessageType.AGENT_CHAT_SSE) return;
          const { input, session_id, attachments } = msg.data;

          try {
            const response = await fetch(
              'https://playground-qa-extension.online/api/agent/chat',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  input,
                  session_id,
                  attachments: attachments || [],
                }),
              }
            );

            if (!response.ok) {
              port.postMessage({
                event: 'error',
                data: `HTTP error! status: ${response.status}`,
              });
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              port.postMessage({
                event: 'error',
                data: 'Failed to get reader from response body',
              });
              return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

            const processBuffer = (text: string, isFinal: boolean = false) => {
              buffer += text;

              // Handle both \n\n and \r\n\r\n as event separators
              const blocks = buffer.split(/\r?\n\r?\n/);

              // If not final, the last block might be incomplete, keep it in buffer
              if (!isFinal) {
                buffer = blocks.pop() || '';
              } else {
                // If it is final, everything in buffer should be processed
                buffer = '';
              }

              for (const eventBlock of blocks) {
                const trimmedBlock = eventBlock.trim();
                if (!trimmedBlock) continue;

                const lines = trimmedBlock.split(/\r?\n/);
                let eventType = 'message';
                let dataString = '';

                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.startsWith('event:')) {
                    eventType = trimmedLine.substring(6).trim();
                  } else if (trimmedLine.startsWith('data:')) {
                    dataString = trimmedLine.substring(5).trim();
                  }
                }

                if (!dataString) {
                  console.log(
                    `[Background] SSE Block with no data:`,
                    trimmedBlock
                  );
                  continue;
                }

                let data = null;
                try {
                  data = JSON.parse(dataString);
                } catch (e) {
                  data = dataString;
                }

                console.log(
                  `[Background] SSE Forwarding - Event: ${eventType}`,
                  data
                );
                port.postMessage({ event: eventType, data });
              }
            };

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                console.log(
                  '[Background] SSE Stream Done. Finalizing buffer:',
                  buffer
                );
                processBuffer('', true);
                break;
              }

              processBuffer(decoder.decode(value, { stream: true }));
            }
          } catch (error: any) {
            port.postMessage({
              event: 'error',
              data: error.message || 'Unknown stream error',
            });
          }
        });
        return;
      }

      if (port.name === 'agent-fix-sse') {
        port.onMessage.addListener(async msg => {
          if (msg.type !== MessageType.AGENT_FIX_ISSUE_SSE) return;
          const { project_id, issue_iid, repo_project_id, target_branch, runner } = msg.data;

          try {
            const response = await fetch(
              'https://playground-qa-extension.online/api/agent/fix-issue',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                  project_id,
                  issue_iid,
                  repo_project_id,
                  target_branch,
                  runner,
                }),
              }
            );

            if (!response.ok) {
              port.postMessage({
                event: 'error',
                data: `HTTP error! status: ${response.status}`,
              });
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              port.postMessage({
                event: 'error',
                data: 'Failed to get reader from response body',
              });
              return;
            }

            const decoder = new TextDecoder();
            let buffer = '';

            const processBuffer = (text: string, isFinal: boolean = false) => {
              buffer += text;

              // Handle both \n\n and \r\n\r\n as event separators
              const blocks = buffer.split(/\r?\n\r?\n/);

              // If not final, the last block might be incomplete, keep it in buffer
              if (!isFinal) {
                buffer = blocks.pop() || '';
              } else {
                // If it is final, everything in buffer should be processed
                buffer = '';
              }

              for (const eventBlock of blocks) {
                const trimmedBlock = eventBlock.trim();
                if (!trimmedBlock) continue;

                const lines = trimmedBlock.split(/\r?\n/);
                let eventType = 'message';
                let dataString = '';

                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.startsWith('event:')) {
                    eventType = trimmedLine.substring(6).trim();
                  } else if (trimmedLine.startsWith('data:')) {
                    dataString = trimmedLine.substring(5).trim();
                  }
                }

                if (!dataString) {
                  console.log(
                    `[Background] SSE Block with no data:`,
                    trimmedBlock
                  );
                  continue;
                }

                let data = null;
                try {
                  data = JSON.parse(dataString);
                } catch (e) {
                  data = dataString;
                }

                console.log(
                  `[Background] SSE Forwarding - Event: ${eventType}`,
                  data
                );
                port.postMessage({ event: eventType, data });
              }
            };

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                console.log(
                  '[Background] SSE Stream Done. Finalizing buffer:',
                  buffer
                );
                processBuffer('', true);
                break;
              }

              processBuffer(decoder.decode(value, { stream: true }));
            }
          } catch (error: any) {
            port.postMessage({
              event: 'error',
              data: error.message || 'Unknown stream error',
            });
          }
        });
        return;
      }

      if (port.name !== 'bridge') return;
      port.onMessage.addListener(async msg => {
        let _reqId: string | undefined;
        try {
          if (!msg || msg.type !== MessageType.BACKGROUND_FETCH) return;
          _reqId = msg.reqId;
          const { url, init, responseType, includeHeaders } =
            msg.data as BackgroundFetchRequest;

          if (!url) {
            port.postMessage({
              ok: false,
              error: 'Missing URL',
              reqId: _reqId,
            });
            return;
          }

          const authInit = await this.withAuthHeaders(init);
          const resp = await fetch(url, { ...authInit } as RequestInit);

          const ct = resp.headers.get('content-type') || '';
          const want: 'json' | 'text' | 'arrayBuffer' =
            responseType ||
            (ct.includes('application/json')
              ? 'json'
              : ct.startsWith('text/')
                ? 'text'
                : 'arrayBuffer');

          let body: any = undefined;
          try {
            if (want === 'json') body = await resp.json();
            else if (want === 'text') body = await resp.text();
            else {
              const buf = await resp.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let bin = '';
              for (let i = 0; i < bytes.length; i++)
                bin += String.fromCharCode(bytes[i]);
              body = btoa(bin);
            }
          } catch {}

          const headers = includeHeaders
            ? (() => {
                const obj: Record<string, string> = {};
                resp.headers.forEach((v, k) => {
                  obj[k] = v;
                });
                return obj;
              })()
            : undefined;

          port.postMessage({
            ok: true,
            reqId: _reqId,
            data: {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              url: resp.url,
              headers,
              body,
            },
          });
        } catch (e: any) {
          port.postMessage({
            ok: false,
            error: e?.message || 'Fetch failed',
            reqId: _reqId,
          });
        }
      });
    });

    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));
    chrome.contextMenus.onClicked.addListener(
      this.handleContextMenu.bind(this)
    );
    chrome.contextMenus.removeAll(() => {
      this.setupContextMenus();
    });

    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        // No dynamic injection needed anymore as scripts are in manifest.json
      }
    });
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    switch (message.type) {
      case MessageType.VIDEO_CAPTURE_COMPLETE:
        try {
          const {
            recordingId,
            videoData,
            videoUrl: existingUrl,
          } = message.data || {};

          if (!recordingId) {
            console.error(
              '[Background] Received VIDEO_CAPTURE_COMPLETE without recordingId'
            );
            return;
          }

          if (existingUrl && recordingId) {
            console.log(
              `[Background] Video capture already uploaded: ${existingUrl}`
            );
            this.pendingVideoUrls.set(
              recordingId as string,
              existingUrl as string
            );
            const pending = this.pendingVideoUpload.get(recordingId as string);
            if (pending) pending.resolve(existingUrl as string);
            return;
          }

          if (!videoData) {
            console.error(
              `[Background] Video capture failed for ${recordingId}`
            );
            const pending = this.pendingVideoUpload.get(recordingId as string);
            if (pending) pending.resolve(undefined);
            return;
          }

          console.log(
            `[Background] Uploading video data for ${recordingId} (${videoData.length} bytes)...`
          );
          const fileName = `recordings/${recordingId}.webm`;
          const videoUrl = await this.uploadToR2(
            new Uint8Array(videoData),
            fileName,
            'video/webm'
          );

          console.log(`[Background] Video capture complete: ${videoUrl}`);
          this.pendingVideoUrls.set(recordingId as string, videoUrl);

          const pending = this.pendingVideoUpload.get(recordingId as string);
          if (pending) {
            pending.resolve(videoUrl);
          }
        } catch (e) {
          console.error(`[Background] Failed to process video capture:`, e);
          const rId = message.data?.recordingId;
          if (rId) {
            const pending = this.pendingVideoUpload.get(rId as string);
            if (pending) pending.resolve(undefined);
          }
        }
        break;

      case MessageType.GET_VIDEO_THUMBNAIL:
        try {
          const { url, timeInSeconds = 3 } = message.data || {};
          if (!url) {
            sendResponse({ success: false, error: 'Missing URL' });
            return;
          }

          const cacheKey = `${url}_${timeInSeconds}`;

          // Check memory cache first
          if (this.thumbnailCache.has(cacheKey)) {
            sendResponse({
              success: true,
              data: this.thumbnailCache.get(cacheKey),
            });
            return;
          }

          // Check if a request for this thumbnail is already in progress
          if (this.pendingThumbnails.has(cacheKey)) {
            this.pendingThumbnails.get(cacheKey)!.push(sendResponse);
            return;
          }

          // Mark as pending
          this.pendingThumbnails.set(cacheKey, [sendResponse]);

          // Ensure offscreen document exists
          if (!(await chrome.offscreen.hasDocument())) {
            await chrome.offscreen.createDocument({
              url: 'offscreen.html',
              reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
              justification: 'Generate video thumbnails from R2 bucket',
            });
          }

          // Send message to offscreen document
          chrome.runtime.sendMessage(
            {
              type: 'GENERATE_THUMBNAIL_INTERNAL',
              data: { url, timeInSeconds },
            },
            response => {
              const callbacks = this.pendingThumbnails.get(cacheKey) || [];
              this.pendingThumbnails.delete(cacheKey);

              if (response?.success) {
                this.thumbnailCache.set(cacheKey, response.data);
                callbacks.forEach(cb =>
                  cb({ success: true, data: response.data })
                );
              } else {
                callbacks.forEach(cb =>
                  cb({
                    success: false,
                    error: response?.error || 'Offscreen generation failed',
                  })
                );
              }
            }
          );
        } catch (e: any) {
          sendResponse({
            success: false,
            error: e?.message || 'Thumbnail generation failed',
          });
        }
        break;

      case MessageType.AUTH_LOGOUT:
        this.broadcast({ type: MessageType.AUTH_SESSION_UPDATED, data: null });
        sendResponse({ success: true });
        break;

      case MessageType.TEST_SCENARIO_UPLOAD:
        try {
          const { projectId, base64, fileName, contentType, authConfig } =
            message.data || {};
          if (!projectId || !base64) {
            sendResponse({
              success: false,
              error: 'Missing projectId or file data',
            });
            return;
          }

          // Convert base64 back to Blob manually to avoid MV3 fetch(dataURI) limits
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], {
            type: contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });

          const formData = new FormData();
          formData.append('file', blob, fileName || 'scenario.xlsx');
          formData.append('projectId', projectId);
          if (authConfig) {
            formData.append('authConfig', JSON.stringify(authConfig));
          }

          const authInit = await this.withAuthHeaders({
            method: 'POST',
            body: formData,
          });

          const uploadUrl = `https://playground-qa-extension.online/api/test-scenarios/upload`;
          const uploadResp = await fetch(uploadUrl, authInit);

          if (!uploadResp.ok) {
            const errorData = await uploadResp.json().catch(() => ({}));
            sendResponse({
              success: false,
              error:
                errorData.error ||
                errorData.message ||
                `Upload failed: ${uploadResp.status} ${uploadResp.statusText}`,
            });
            return;
          }

          const data = await uploadResp.json();
          sendResponse({ success: true, data });
        } catch (e: any) {
          sendResponse({
            success: false,
            error: e?.message || 'Scenario upload failed',
          });
        }
        break;

      case MessageType.FILE_UPLOAD:
        try {
          const { projectId, base64, fileName, contentType } =
            message.data || {};
          if (!projectId || !base64) {
            sendResponse({
              success: false,
              error: 'Missing projectId or file data',
            });
            return;
          }

          // Convert base64 back to Blob manually
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], {
            type: contentType || 'application/octet-stream',
          });

          const formData = new FormData();
          formData.append('file', blob, fileName || 'upload.mp4');

          const authInit = await this.withAuthHeaders({
            method: 'POST',
            body: formData,
          });

          const uploadUrl = `https://playground-qa-extension.online/api/projects/${projectId}/uploads`;
          const uploadResp = await fetch(uploadUrl, authInit);

          if (!uploadResp.ok) {
            const errorData = await uploadResp.json().catch(() => ({}));
            sendResponse({
              success: false,
              error:
                errorData.message ||
                `Upload failed: ${uploadResp.status} ${uploadResp.statusText}`,
            });
            return;
          }

          const data = await uploadResp.json();
          sendResponse({ success: true, data });
        } catch (e: any) {
          sendResponse({
            success: false,
            error: e?.message || 'Upload failed',
          });
        }
        break;

      case MessageType.R2_UPLOAD:
        try {
          const { body, fileName, contentType } = message.data || {};
          if (!body) {
            sendResponse({ success: false, error: 'Missing body' });
            return;
          }

          // Convert back to Uint8Array if it was sent as an array/object
          const data = new Uint8Array(Object.values(body));
          const url = await this.uploadToR2(data, fileName, contentType);
          sendResponse({ success: true, data: url });
        } catch (e: any) {
          sendResponse({
            success: false,
            error: e?.message || 'R2 Upload failed',
          });
        }
        break;

      case MessageType.GET_TAB_ID:
        sendResponse({ success: true, data: { tabId: sender.tab?.id } });
        break;

      case MessageType.BACKGROUND_FETCH:
        try {
          const req = (message.data || {}) as BackgroundFetchRequest;
          const authInit = await this.withAuthHeaders(req.init);
          const resp = await fetch(req.url, { ...authInit } as RequestInit);
          // Simplified response handling...
          const body = await (resp.headers.get('content-type')?.includes('json')
            ? resp.json()
            : resp.text());
          const headers: Record<string, string> = {};
          resp.headers.forEach((v, k) => (headers[k] = v));

          sendResponse({
            success: true,
            data: {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              url: resp.url,
              headers,
              body,
            },
          });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_ISSUE_CREATOR:
        await this.openIssueCreator();
        sendResponse({ success: true });
        break;

      case MessageType.GENERATE_BLUEPRINT:
        try {
          const { events } = message.data || {};
          if (!events || !Array.isArray(events)) {
            sendResponse({
              success: false,
              error: 'Missing or invalid events',
            });
            return;
          }
          const blueprint = await this.aiProcessor.generateBlueprint(events);
          sendResponse({ success: true, data: { blueprint } });
        } catch (e: any) {
          sendResponse({
            success: false,
            error: e?.message || 'AI processing failed',
          });
        }
        break;

      case MessageType.SAVE_BLUEPRINT:
        try {
          const { blueprint } = message.data || {};
          if (!blueprint) {
            sendResponse({ success: false, error: 'Missing blueprint' });
            return;
          }
          
          // Debug: Check if incoming blueprint has xpath (skip navigate step)
          console.log('[Background] SAVE_BLUEPRINT received blueprint, checking steps:');
          if (blueprint.steps && blueprint.steps.length > 1) {
            for (let i = 1; i < Math.min(blueprint.steps.length, 4); i++) {
              const step = blueprint.steps[i];
              console.log(`[Background] SAVE_BLUEPRINT: Step ${i} (${step.action}) xpath:`, step.xpath);
              console.log(`[Background] SAVE_BLUEPRINT: Step ${i} (${step.action}) xpathCandidates length:`, step.xpathCandidates?.length);
            }
          }

          // Ensure blueprint has an ID
          if (!blueprint.id) {
            blueprint.id = `rec-${Date.now()}`;
          }

          // Ensure navigate step is always first if baseUrl is available
          let finalSteps = blueprint.steps || [];
          if (blueprint.baseUrl && finalSteps.length > 0) {
            const hasNavigateStep =
              finalSteps[0].action === 'navigate' &&
              (finalSteps[0].value === blueprint.baseUrl ||
                finalSteps[0].value?.includes(blueprint.baseUrl));

            if (!hasNavigateStep) {
              console.log('[Background] SAVE_BLUEPRINT: Prepending navigate step');
              finalSteps = [
                {
                  action: 'navigate',
                  selector: 'body',
                  selectorCandidates: ['body'],
                  value: blueprint.baseUrl,
                  description: `Navigate to ${blueprint.baseUrl}`,
                  elementHints: { tagName: 'body' },
                },
                ...finalSteps,
              ];
            }
          }

          // Map TestBlueprint to TestRecording if necessary, though they are very similar
          const recording: TestRecording = {
            id: blueprint.id,
            name: blueprint.name || 'Untitled Recording',
            description: blueprint.description || '',
            status: blueprint.status || 'ready',
            project_id: blueprint.project_id || blueprint.projectId?.toString(),
            issue_id: blueprint.issue_id || blueprint.issueId,
            created_at: new Date(
              blueprint.created_at || blueprint.createdAt || Date.now()
            ).toISOString(),
            steps: finalSteps.map((step: any) => ({
              action: step.action,
              description: step.description || '',
              selector: step.selector,
              selectorCandidates: step.selectorCandidates || [],
              xpath: step.xpath,
              xpathCandidates: step.xpathCandidates || [],
              value: step.value,
              assertionType: step.assertionType,
              expectedValue: step.expectedValue,
              elementHints: {
                tagName: step.elementHints?.tagName || 'div',
                attributes: step.elementHints?.attributes || {},
              },
            })),
            parameters: blueprint.parameters || [],
            video_url: blueprint.video_url || blueprint.videoUrl,
            telemetry: blueprint.telemetry,
          };

          console.log('[Background] Saving recording payload:', recording);
          
          // Debug: Check if xpath is in the steps (skip navigate step)
          if (recording.steps && recording.steps.length > 1) {
            for (let i = 1; i < Math.min(recording.steps.length, 3); i++) {
              const step = recording.steps[i];
              console.log(`[Background] DEBUG: Step ${i} (${step.action}) has xpath:`, step.xpath);
              console.log(`[Background] DEBUG: Step ${i} (${step.action}) has xpathCandidates:`, step.xpathCandidates);
            }
          }

          const response = await api.post<any>('/recordings', {
            body: recording as any,
          });

          if (!response.success) {
            sendResponse({ success: false, error: response.error });
            return;
          }

          // Clear last blueprint after saving
          await chrome.storage.local.remove('lastBlueprint');

          this.broadcast({
            type: MessageType.BLUEPRINT_SAVED,
            data: { blueprint: response.data },
          });
          sendResponse({ success: true, data: { blueprint: response.data } });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.UPDATE_BLUEPRINT:
        try {
          const { id, data } = message.data || {};
          if (!id || !data) {
            sendResponse({
              success: false,
              error: 'Missing blueprint ID or data',
            });
            return;
          }

          const response = await api.patch<any>(`/recordings/${id}`, {
            body: data as any,
          });
          if (!response.success) {
            sendResponse({ success: false, error: response.error });
            return;
          }

          this.broadcast({
            type: MessageType.BLUEPRINT_SAVED,
            data: { blueprint: response.data },
          });
          sendResponse({ success: true, data: response.data });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.DELETE_BLUEPRINT:
        try {
          const { id } = message.data || {};
          if (!id) {
            sendResponse({ success: false, error: 'Missing blueprint ID' });
            return;
          }

          const response = await api.delete<any>(`/recordings/${id}`);
          if (!response.success) {
            sendResponse({ success: false, error: response.error });
            return;
          }

          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_URL:
        try {
          const { url, active } = message.data || {};
          if (!url) {
            sendResponse({ success: false, error: 'Missing URL' });
            return;
          }
          chrome.tabs.create({ url, active: active ?? true });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_MAIN_MENU_PAGE:
        try {
          const { initialView, initialIssue } = message.data || {};
          const url = new URL(chrome.runtime.getURL('main-menu.html'));
          if (initialView) {
            url.searchParams.set('initialView', initialView);
          }
          if (initialIssue) {
            url.searchParams.set('initialIssue', JSON.stringify(initialIssue));
          }
          chrome.tabs.create({ url: url.toString(), active: true });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.GET_RECORDED_TESTS:
        try {
          const response = await api.get<TestRecording[]>('/recordings');
          sendResponse({
            success: response.success,
            data: response.data || [],
            error: response.error,
          });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.START_PLAYBACK:
        try {
          const { blueprint, waitForCompletion } = message.data || {};
          if (!blueprint) {
            sendResponse({ success: false, error: 'Missing blueprint' });
            return;
          }

          const firstNavigateStep = blueprint.steps.find(
            (s: any) => s.action === 'navigate'
          );
          let startUrl =
            firstNavigateStep?.value || blueprint.baseUrl || 'about:blank';

          // Resolve relative URLs against baseUrl
          if (
            startUrl &&
            !/^https?:\/\//i.test(startUrl) &&
            blueprint.baseUrl
          ) {
            try {
              startUrl = new URL(startUrl, blueprint.baseUrl).href;
            } catch {
              startUrl = blueprint.baseUrl;
            }
          }

          // Create tab
          const tab = await chrome.tabs.create({
            url: startUrl,
            active: message.data.active ?? true,
          });

          if (!tab.id) {
            sendResponse({
              success: false,
              error: 'No valid tab for playback',
            });
            return;
          }

          // Wait for the new tab to load before continuing
          await this.waitForTabComplete(tab.id);

          // Persist state with playbackTabId to identify the correct tab on auto-resume
          await chrome.storage.local.set({
            activePlayback: {
              isActive: true,
              blueprint,
              currentStepIndex: 0,
              status: 'playing',
              playbackTabId: tab.id,
            },
          });

          // Send message to start
          chrome.tabs.sendMessage(tab.id!, {
            type: MessageType.START_PLAYBACK,
            data: { blueprint, playbackTabId: tab.id },
          });

          if (waitForCompletion) {
            this.pendingPlaybacks.set(blueprint.id, sendResponse);
          } else {
            sendResponse({ success: true });
          }
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.STOP_PLAYBACK:
        await chrome.storage.local.remove('activePlayback');
        this.broadcast({ type: MessageType.STOP_PLAYBACK });
        sendResponse({ success: true });
        break;

      case MessageType.PLAYBACK_STATUS_UPDATE:
        // Could be used to update UI or logs
        if (
          message.data.status === 'completed' ||
          message.data.status === 'failed'
        ) {
          // Stop recording if active
          const { isRecording } = await chrome.storage.local.get([
            'isRecording',
          ]);
          if (isRecording) {
            await this.stopRecording();
          }

          const blueprintId = message.data.blueprint?.id;
          if (blueprintId && this.pendingPlaybacks.has(blueprintId)) {
            const resolve = this.pendingPlaybacks.get(blueprintId);
            this.pendingPlaybacks.delete(blueprintId);
            if (resolve) {
              resolve({
                success: message.data.status === 'completed',
                data: message.data,
              });
            }
            // Close the playback tab after completion
            const storage = await chrome.storage.local.get(['activePlayback']);
            if (storage.activePlayback?.playbackTabId) {
              chrome.tabs.remove(storage.activePlayback.playbackTabId);
            }
            await chrome.storage.local.remove('activePlayback');
          }
        }
        sendResponse({ success: true });
        break;

      case MessageType.START_RECORDING:
        try {
          const { projectId } = message.data || {};

          let targetTabId = sender.tab?.id;
          if (!targetTabId) {
            const tabs = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            targetTabId = tabs[0]?.id;
          }

          if (targetTabId) {
            chrome.tabs
              .sendMessage(targetTabId, {
                type: 'OPEN_RECORDING_OVERLAY',
                data: { projectId },
              })
              .catch(() => {});
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active tab found' });
          }
          return true;
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.ACTUAL_START_RECORDING:
        try {
          const { projectId, id } = message.data || {};
          const targetTabId = sender.tab?.id;
          if (targetTabId) {
            this.startRecordingFlow(projectId, targetTabId, id).catch(
              console.error
            );
          }
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.STOP_RECORDING:
        try {
          await this.stopRecording();
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.CLOSE_MAIN_MENU:
        this.broadcast({ type: MessageType.CLOSE_MAIN_MENU });
        sendResponse({ success: true });
        break;

      case MessageType.CDP_ATTACH:
        try {
          await CDPHandler.attach(message.data.tabId);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.CDP_DETACH:
        try {
          await CDPHandler.detach(message.data.tabId);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.CDP_CLICK:
        try {
          await CDPHandler.click(
            message.data.tabId,
            message.data.x,
            message.data.y
          );
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.CDP_TYPE:
        try {
          console.log(`[CDPHandler] Typing "${message.data.text}" on tab ${message.data.tabId}`);
          await CDPHandler.type(message.data.tabId, message.data.text);
          console.log(`[CDPHandler] Type completed successfully`);
          sendResponse({ success: true });
        } catch (e: any) {
          console.error(`[CDPHandler] Type failed:`, e);
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.CDP_CLEAR_INPUT:
        try {
          await CDPHandler.clearInput(message.data.tabId);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.CDP_SCROLL:
        try {
          await CDPHandler.scroll(
            message.data.tabId,
            message.data.x,
            message.data.y,
            message.data.deltaX,
            message.data.deltaY
          );
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case MessageType.TRACK_INTERACTION:
        if (message.data) {
          this.recordingEvents.push(message.data);
          // Also persist to session storage for recovery
          chrome.storage.session.get(['currentRecording'], result => {
            const recording = result.currentRecording || { events: [] };
            recording.events.push(message.data);
            chrome.storage.session.set({ currentRecording: recording });
          });
        }
        sendResponse({ success: true });
        break;

      case MessageType.TELEMETRY_UPDATE:
        if (message.data) {
          const data = message.data as Partial<SessionTelemetry>;
          if (data.consoleLogs) this.consoleLogs = data.consoleLogs;
          if (data.jsErrors) this.jsErrors = data.jsErrors;
          if (data.storageSnapshots) this.telemetry.storageSnapshots = data.storageSnapshots;
          if (data.domMutations) this.telemetry.domMutations = data.domMutations;
        }
        sendResponse({ success: true });
        break;

      case MessageType.GET_TELEMETRY:
        if (message.data) {
          const data = message.data as Partial<SessionTelemetry>;
          this.telemetry = { ...this.telemetry, ...data };
          if (data.consoleLogs) this.consoleLogs = data.consoleLogs;
          if (data.jsErrors) this.jsErrors = data.jsErrors;
        }
        sendResponse({ success: true, telemetry: this.telemetry });
        break;

      case MessageType.IFRAME_CLOSED_OVERLAY:
        // When the overlay is closed (cancel), ensure any active offscreen capture is stopped
        chrome.runtime.sendMessage({ type: MessageType.STOP_VIDEO_CAPTURE });
        // Relay to the tab where it came from
        if (sender.tab?.id) {
          this.notifyTab(sender.tab.id, message);
        }
        // Also relay to extension components (popup, options page)
        try {
          chrome.runtime.sendMessage(message, () => {
            void chrome.runtime.lastError;
          });
        } catch (e) {}
        break;

      case MessageType.IFRAME_STARTED_RECORDING:
      case MessageType.IFRAME_PREPARE_RECORDING:
      case MessageType.IFRAME_STOP_RECORDING:
      case MessageType.IFRAME_LOG_EVENT:
      case MessageType.RESIZE_IFRAME:
        // Relay to the tab where it came from
        if (sender.tab?.id) {
          this.notifyTab(sender.tab.id, message);
        }
        // Also relay to extension components (popup, options page)
        try {
          chrome.runtime.sendMessage(message, () => {
            void chrome.runtime.lastError;
          });
        } catch (e) {}
        break;
      default:
      // Forward to content script if needed or ignore
    }
  }

  private setupContextMenus() {
    chrome.contextMenus.create({
      id: 'create-issue-context',
      title: 'Create Issue from Selection',
      contexts: ['selection', 'page'],
    });

    chrome.contextMenus.create({
      id: 'start-recording-context',
      title: 'Start Recording (QA Tool)',
      contexts: ['page'],
    });
  }

  private async handleCommand(command: string) {
    if (command === 'create-issue') await this.openIssueCreator();
  }

  private async handleContextMenu(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) {
    if (info.menuItemId === 'start-recording-context') {
      try {
        if (!tab?.id) throw new Error('Could not identify target tab');
        const targetTabId = tab.id;

        chrome.tabs
          .sendMessage(targetTabId, {
            type: 'OPEN_RECORDING_OVERLAY',
            data: {},
          })
          .catch(() => {});
      } catch (e: any) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Recording Failed',
          message: e.message || 'Could not start recording',
        });
      }
      return;
    }

    if (tab?.id && info.menuItemId === 'create-issue-context') {
      chrome.tabs.sendMessage(tab.id, {
        type: MessageType.CREATE_ISSUE_FROM_CONTEXT,
        data: { selection: info.selectionText, url: info.pageUrl },
      });
    }
  }

  private async openIssueCreator() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: MessageType.OPEN_ISSUE_CREATOR,
      });
    }
  }

  private async waitForTabComplete(tabId: number, timeoutMs = 30000) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Tab load timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const listener = (id: number, change: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && change.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
  private async startRecordingFlow(
    projectId: number | undefined,
    targetTabId: number,
    recordingId?: string
  ) {
    if (this.isStartingRecording) {
      console.warn(
        '[Background] Recording start already in progress, ignoring request.'
      );
      return;
    }
    this.isStartingRecording = true;

    try {
      const currentRecordingId = recordingId || `rec-${Date.now()}`;
      console.log(
        `[Background] Starting recording session: ${currentRecordingId} for tab ${targetTabId}`
      );

      // 1. Immediate State
      this.recordingEvents = [];
      this.telemetry = {};
      this.networkRequests = [];
      this.consoleLogs = [];
      this.jsErrors = [];

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const startUrl = tab?.url;

      await chrome.storage.session.remove('currentRecording');
      await chrome.storage.local.set({
        isRecording: true,
        currentRecordingProjectId: projectId,
        currentRecordingId,
        currentRecordingStartUrl: startUrl,
      });

      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

      // Enable CDP Network domain for network capture
      try {
        await CDPHandler.attach(targetTabId);
        await CDPHandler.sendCommand(targetTabId, 'Network.enable', {});
        this.cdpNetworkEnabled = true;
        this.setupCDPNetworkListener(targetTabId);
        console.log('[Background] CDP Network domain enabled');
      } catch (e) {
        console.warn('[Background] Failed to enable CDP Network:', e);
      }

      // 2. Start Video Capture in Offscreen Document
      // Creating the offscreen document with reason DISPLAY_MEDIA.
      // This is the "Loom" way to satisfy the user gesture requirement if triggered from UI.
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
          justification:
            'Capture screen video natively via getDisplayMedia for recording',
        });
      }

      // Send message to offscreen document to initiate native capture
      // This is triggered by a user gesture from the Iframe Start button
      const captureResponse = await chrome.runtime.sendMessage({
        type: MessageType.START_VIDEO_CAPTURE,
        data: { recordingId: currentRecordingId },
      });

      // If the user cancelled the native Chrome tab picker, clean up
      if (captureResponse?.success === false) {
        console.warn('[Background] User cancelled the tab picker, cleaning up recording state');
        await chrome.storage.local.set({ isRecording: false });
        chrome.action.setBadgeText({ text: '' });
        await this.notifyTab(targetTabId, {
          type: MessageType.IFRAME_CLOSED_OVERLAY,
        });
        return;
      }
    } catch (e) {
      this.isStartingRecording = false;
      throw e;
    } finally {
      this.isStartingRecording = false;
    }
  }

  private async stopRecording() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Disable CDP Network capture
    if (tab?.id) {
      await this.disableCDPNetwork(tab.id);
    }

    // Get the pre-generated ID and start URL
    const { currentRecordingId, currentRecordingStartUrl } =
      await chrome.storage.local.get([
        'currentRecordingId',
        'currentRecordingStartUrl',
      ]);
    const tempId = currentRecordingId || `rec-${Date.now()}`;
    const startUrl = currentRecordingStartUrl || tab?.url;
    console.log(
      `[Background] Stopping recording session: ${tempId} (Started at: ${startUrl})`
    );

    // Create a promise that resolves when video upload completes
    const videoPromise = new Promise<string | undefined>(resolve => {
      const timeout = setTimeout(() => {
        console.warn(`[Background] Video upload timed out for ${tempId} - continuing without video`);
        this.pendingVideoUpload.delete(tempId);
        resolve(undefined);
      }, 60_000); // 60 seconds for video upload

      this.pendingVideoUpload.set(tempId, {
        promise: Promise.resolve(undefined), // placeholder
        resolve: (url: string | undefined) => {
          clearTimeout(timeout);
          this.pendingVideoUpload.delete(tempId);
          resolve(url);
        },
      });
    });

    // Stop Video Capture
    chrome.runtime.sendMessage({ type: MessageType.STOP_VIDEO_CAPTURE });

    // Set immediate processing state to update UI instantly
    const initialSteps = [];
    if (startUrl) {
      initialSteps.push({
        id: 'start-nav',
        action: 'navigate',
        value: startUrl,
        description: `Navigate to ${startUrl}`,
        selector: 'body',
        selectorCandidates: ['body'],
      });
    }

    const processingBlueprint = {
      id: tempId,
      name: `Recording ${new Date().toLocaleTimeString()}`,
      steps: initialSteps,
      status: 'processing',
    };
    await chrome.storage.local.set({ lastBlueprint: processingBlueprint });
    this.broadcast({
      type: MessageType.BLUEPRINT_PROCESSING,
      data: { blueprint: processingBlueprint },
    });
    // Explicitly notify the active tab so content scripts (compact-list) update immediately
    await this.notifyTab(tab?.id, {
      type: MessageType.BLUEPRINT_PROCESSING,
      data: { blueprint: processingBlueprint },
    });

    await chrome.storage.local.set({ isRecording: false });
    chrome.action.setBadgeText({ text: '' });

    // 1. Collect events from all possible sources
    const allEvents: RawEvent[] = [...this.recordingEvents];
    console.log(
      `[Background] Collected ${allEvents.length} events from internal buffer`
    );

    // Try session storage fallback
    try {
      const sessionData = await chrome.storage.session.get([
        'currentRecording',
      ]);
      if (sessionData.currentRecording?.events?.length > 0) {
        console.log(
          `[Background] Syncing ${sessionData.currentRecording.events.length} events from session storage`
        );
        // Merge and deduplicate by timestamp + type
        const existing = new Set(
          allEvents.map(e => `${e.timestamp}-${e.type}`)
        );
        sessionData.currentRecording.events.forEach((e: RawEvent) => {
          if (!existing.has(`${e.timestamp}-${e.type}`)) {
            allEvents.push(e);
          }
        });
      }
    } catch (e) {
      console.error('[Background] Session storage sync failed:', e);
    }

    // Try tab fallback (final sync)
    if (tab?.id) {
      try {
        console.log('[Background] Requesting final event sync from tab...');
        const response = await new Promise<any>(resolve => {
          chrome.tabs.sendMessage(
            tab.id!,
            { type: MessageType.STOP_RECORDING },
            reply => {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(reply);
            }
          );
        });
        if (response?.events?.length > 0) {
          console.log(
            `[Background] Syncing ${response.events.length} events from tab content script`
          );
          // Merge and deduplicate
          const existing = new Set(
            allEvents.map(e => `${e.timestamp}-${e.type}`)
          );
          response.events.forEach((e: RawEvent) => {
            if (!existing.has(`${e.timestamp}-${e.type}`)) {
              allEvents.push(e);
            }
          });
        }
      } catch (e) {
        console.error('[Background] Tab fallback sync failed:', e);
      }
    }

    console.log(
      `[Background] Final event count after deduplication: ${allEvents.length}`
    );

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    // ALWAYS add the navigate step as the first step
    const navigateStep: TestStep = {
      id: '0-nav',
      action: 'navigate' as const,
      value: startUrl,
      description: `Navigate to ${startUrl || 'page'}`,
      selector: 'body',
      selectorCandidates: ['body'],
      elementHints: {
        tagName: 'body',
      },
      expectedValue: undefined,
    };

    // 3. Generate blueprint if we have events
    if (allEvents.length > 0) {
      try {
        // Save raw events as a temporary blueprint so it shows up immediately
        // ALWAYS include the navigate step first
        const tempBlueprint = {
          id: tempId,
          name: `Recording ${new Date().toLocaleTimeString()}`,
          steps: [
            navigateStep,
            ...allEvents.map((e, i) => ({
              id: (i + 1).toString(),
              action: e.type,
              selector: e.element.selector,
              selectorCandidates: e.element.selectorCandidates || [
                e.element.selector,
              ],
              xpath: e.element.xpath,
              xpathCandidates: e.element.xpathCandidates || [],
              elementHints: {
                tagName: e.element.tagName,
                textContent: e.element.textContent,
                attributes: e.element.attributes,
                parentInfo: e.element.parentInfo,
                structuralInfo: e.element.structuralInfo,
              },
            })),
          ],
          status: 'processing',
        } as any;

        await chrome.storage.local.set({ lastBlueprint: tempBlueprint });
        this.broadcast({
          type: MessageType.BLUEPRINT_PROCESSING,
          data: { blueprint: tempBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: MessageType.BLUEPRINT_PROCESSING,
          data: { blueprint: tempBlueprint },
        });

        console.log('[Background] Running AI processing...');

        // Generate blueprint (with telemetry for better context)
        const blueprint = await this.aiProcessor.generateBlueprint(
          allEvents,
          startUrl,
          this.telemetry as any
        );
        console.log(
          '[Background] AI processing complete, generating enriched steps...'
        );

        // Wait for video upload to complete (runs in parallel with AI)
        const resolvedVideoUrl = await videoPromise;

        const enrichedSteps = (blueprint.steps || []).map((step, index): TestStep => {
          // Find the corresponding event. Note that AI might group events, so this is heuristic.
          // If the first step is navigate and we prepended it, we need to adjust indexing
          const isPrependedNav =
            index === 0 &&
            step.action === 'navigate' &&
            step.value === startUrl;
          const eventIndex = isPrependedNav
            ? -1
            : index - (blueprint.steps[0]?.action === 'navigate' ? 1 : 0);

          const fallbackEvent = eventIndex >= 0 ? allEvents[eventIndex] : null;
          const isPlaceholder = (value?: string) =>
            typeof value === 'string' && /\$\{[^}]+\}/.test(value);

          const fallbackValue =
            step.action === 'navigate'
              ? fallbackEvent?.url
              : step.action === 'type' || step.action === 'select'
                ? fallbackEvent?.value
                : undefined;

          const fallbackExpectedValue =
            step.action === 'assert'
              ? fallbackEvent?.value || fallbackEvent?.element?.textContent
              : undefined;

          const resolvedValue = isPlaceholder(step.value)
            ? fallbackValue || undefined
            : step.value;

          const resolvedExpectedValue = isPlaceholder(step.expectedValue)
            ? fallbackExpectedValue || undefined
            : step.expectedValue;

          const fallbackSelector = fallbackEvent?.element?.selector;
          
          // FIX: Use elementHints.attributes as source of truth for THIS element's identity
          // Do NOT rely on fallbackEvent index matching which can be wrong when AI groups/reorders events
          const thisElementAttrs = step.elementHints?.attributes || fallbackEvent?.element?.attributes || {};
          
          const thisElementUniqueValues = {
            name: thisElementAttrs['name'],
            id: thisElementAttrs['id'],
            placeholder: thisElementAttrs['placeholder'],
            type: thisElementAttrs['type'],
            role: thisElementAttrs['role'],
          };
          
          // Generate selectorCandidates from the AI's primary selector + hints
          // This ensures they match the actual element, not a misaligned fallback event
          const aiCandidates = step.selectorCandidates || [];
          
          // Simple CSS selector escape function (background script doesn't have CSS API)
          const escapeCssSelector = (value: string): string => {
            // Escape special CSS selector characters
            return value.replace(/[!#"$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~]/g, '\\\\$&');
          };
          
          // Helper to generate a specific selector for an attribute
          const generateAttrSelector = (attr: string, value: string, tagName?: string): string | null => {
            if (!value) return null;
            const escapedValue = value.replace(/'/g, "\\'");
            if (attr === 'id') {
              const escapedId = escapeCssSelector(value);
              return tagName ? `${tagName}#${escapedId}` : `#${escapedId}`;
            }
            return tagName ? `${tagName}[${attr}='${escapedValue}']` : `[${attr}='${escapedValue}']`;
          };
          
          const tagName = step.elementHints?.tagName || fallbackEvent?.element?.tagName;
          
          // Generate candidates from element hints attributes (GUARANTEED to be for THIS element)
          const generatedFromHints: string[] = [];
          const generatedXPathFromHints: string[] = [];
          const singleAttrXPaths: string[] = [];
          
          // Collect single-attribute XPaths (order: id > name > type > placeholder > role)
          // Most specific attributes first
          if (thisElementAttrs['id']) {
            const sel = generateAttrSelector('id', thisElementAttrs['id'], tagName);
            if (sel) generatedFromHints.unshift(sel); // unshift to put first
            singleAttrXPaths.push(`//*[@id='${thisElementAttrs['id'].replace(/'/g, "&apos;")}']`);
          }
          if (thisElementAttrs['name']) {
            const sel = generateAttrSelector('name', thisElementAttrs['name'], tagName);
            if (sel) generatedFromHints.push(sel);
            singleAttrXPaths.push(`//${tagName}[@name='${thisElementAttrs['name'].replace(/'/g, "&apos;")}']`);
          }
          if (thisElementAttrs['placeholder']) {
            const sel = generateAttrSelector('placeholder', thisElementAttrs['placeholder'], tagName);
            if (sel) generatedFromHints.push(sel);
            singleAttrXPaths.push(`//${tagName}[@placeholder='${thisElementAttrs['placeholder'].replace(/'/g, "&apos;")}']`);
          }
          if (thisElementAttrs['type'] && tagName === 'input') {
            const sel = generateAttrSelector('type', thisElementAttrs['type'], tagName);
            if (sel) generatedFromHints.push(sel);
            singleAttrXPaths.push(`//${tagName}[@type='${thisElementAttrs['type'].replace(/'/g, "&apos;")}']`);
          }
          if (thisElementAttrs['role']) {
            singleAttrXPaths.push(`//${tagName}[@role='${thisElementAttrs['role'].replace(/'/g, "&apos;")}']`);
          }
          
          // Generate combined attribute xpath (most specific) - ADD FIRST
          const combinedAttrs: string[] = [];
          // Order: id > name > type > role (most specific first)
          if (thisElementAttrs['id']) {
            combinedAttrs.push(`@id='${thisElementAttrs['id'].replace(/'/g, "&apos;")}'`);
          }
          if (thisElementAttrs['name']) {
            combinedAttrs.push(`@name='${thisElementAttrs['name'].replace(/'/g, "&apos;")}'`);
          }
          if (thisElementAttrs['type']) {
            combinedAttrs.push(`@type='${thisElementAttrs['type'].replace(/'/g, "&apos;")}'`);
          }
          if (thisElementAttrs['role']) {
            combinedAttrs.push(`@role='${thisElementAttrs['role'].replace(/'/g, "&apos;")}'`);
          }
          if (combinedAttrs.length > 0) {
            generatedXPathFromHints.push(`//${tagName}[${combinedAttrs.join(' and ')}]`);
          }
          
          // Add single-attribute XPaths (less specific) - ADD AFTER combined
          generatedXPathFromHints.push(...singleAttrXPaths);
          
          // Filter AI candidates: only keep selectors that match THIS element's attributes
          const isValidForThisElement = (selector: string): boolean => {
            // If selector references an attribute, it must match THIS element's value
            
            // Check name attribute - selector with [name='X'] must have X = this element's name
            if (thisElementUniqueValues.name) {
              const nameMatch = selector.match(/\[name=['"]([^'"]*)['"]/);
              if (nameMatch && nameMatch[1] !== thisElementUniqueValues.name) {
                return false; // Selector says name=X but this element has name=Y
              }
            } else if (/\[name=['"][^'"]*['"]\]/.test(selector)) {
              // Element has no name, but selector requires one - reject if selector is specific about name
              return false;
            }
            
            // Check id attribute
            if (thisElementUniqueValues.id) {
              const idMatch = selector.match(/#([^[\s,]+)/);
              if (idMatch && idMatch[1] !== thisElementUniqueValues.id) {
                return false;
              }
            } else if (/#([^[\s,]+)/.test(selector)) {
              // Element has no id, but selector specifies one
              return false;
            }
            
            // Check placeholder
            if (thisElementUniqueValues.placeholder) {
              const phMatch = selector.match(/\[placeholder=['"]([^'"]*)['"]/);
              if (phMatch && phMatch[1] !== thisElementUniqueValues.placeholder) {
                return false;
              }
            }
            
            // Check type (only for inputs)
            if (thisElementUniqueValues.type) {
              const typeMatch = selector.match(/\[type=['"]([^'"]*)['"]/);
              if (typeMatch && typeMatch[1] !== thisElementUniqueValues.type) {
                return false;
              }
            }
            
            return true;
          };
          
          // Combine: generated from hints (most reliable) + filtered AI candidates
          const filteredAiCandidates = aiCandidates
            .filter(isValidForThisElement)
            .filter(c => !generatedFromHints.includes(c)); // Avoid duplicates
          
          const allCandidates = [...generatedFromHints, ...filteredAiCandidates];
          
          // Deduplicate
          const seen = new Set<string>();
          const uniqueCandidates: string[] = [];
          for (const candidate of allCandidates) {
            if (candidate && !seen.has(candidate)) {
              seen.add(candidate);
              uniqueCandidates.push(candidate);
            }
          }
          
          // Reorder: specific selectors first (match this element's attrs)
          const uniqueAttrs = ['name', 'id', 'placeholder', 'type', 'role'];
          const isSpecific = (selector: string): boolean => {
            for (const attr of uniqueAttrs) {
              const value = thisElementUniqueValues[attr as keyof typeof thisElementUniqueValues];
              if (value) {
                if (selector.includes(`[${attr}='${value}']`) || 
                    selector.includes(`[${attr}="${value}"]`) || 
                    selector.includes(`#${value}`)) {
                  return true;
                }
              }
            }
            return false;
          };
          
          // CONVERT :has-text() to XPath normalize-space() and move to xpathCandidates
          const xpathCandidates: string[] = [];
          
          // Helper: extract text and escape it for XPath from :has-text() selector
          const extractTextFromHasText = (selector: string): string | null => {
            const match = selector.match(/:has-text\(['"](.+)['"]\)/);
            if (!match) return null;
            return match[1].replace(/'/g, '&apos;');
          };
          
          // Helper: convert CSS :has-text() to XPath normalize-space()
          const convertHasTextToXPath = (selector: string, tag?: string, text?: string): string | null => {
            if (!text) return null;
            const elementTag = tag || '*';
            // Build XPath with normalize-space() - handles whitespace variations
            return `//${elementTag}[normalize-space(.)='${text}']`;
          };
          
          // Reorder: specific selectors first (match this element's attrs)
          const specificFirst = uniqueCandidates.filter(isSpecific);
          const genericLast = uniqueCandidates.filter(s => !isSpecific(s));
          
          // Combine and reorder before converting :has-text()
          const combinedCandidates = [...specificFirst, ...genericLast];
          
          // Separate :has-text() selectors from regular ones
          const cssOnlyCandidates: string[] = [];
          for (const candidate of combinedCandidates) {
            if (candidate.includes(':has-text(')) {
              const escapedText = extractTextFromHasText(candidate);
              // Convert to XPath and add to xpathCandidates
              const xpath = convertHasTextToXPath(candidate, tagName, escapedText || undefined);
              if (xpath) {
                xpathCandidates.push(xpath);
              }
              // Also add role+text combination if role is available
              if (thisElementAttrs['role'] && escapedText) {
                const roleXPath = `//*[@role='${thisElementAttrs['role']}' and normalize-space(.)='${escapedText}']`;
                xpathCandidates.push(roleXPath);
              }
            } else {
              cssOnlyCandidates.push(candidate);
            }
          }
          
          // CRITICAL: Also convert the PRIMARY selector if it contains :has-text()
          const primarySelector = step.selector || fallbackSelector || 'body';
          let finalPrimarySelector = primarySelector;
          
          if (primarySelector.includes(':has-text(')) {
            const escapedText = extractTextFromHasText(primarySelector);
            const primaryXPath = convertHasTextToXPath(primarySelector, tagName, escapedText || undefined);
            if (primaryXPath) {
              xpathCandidates.unshift(primaryXPath); // Add as first priority
            }
            // Try to find a fallback CSS selector from the candidates
            const fallbackCSS = cssOnlyCandidates[0] || generatedFromHints[0];
            if (fallbackCSS) {
              finalPrimarySelector = fallbackCSS;
            } else {
              // Generate a selector from attributes
              if (thisElementAttrs['role']) {
                finalPrimarySelector = `[role='${thisElementAttrs['role']}']`;
              } else if (thisElementAttrs['id']) {
                finalPrimarySelector = tagName ? `${tagName}#${thisElementAttrs['id']}` : `#${thisElementAttrs['id']}`;
              } else if (thisElementAttrs['name']) {
                finalPrimarySelector = tagName ? `${tagName}[name='${thisElementAttrs['name']}']` : `[name='${thisElementAttrs['name']}']`;
              }
            }
          }
          
          // Add AI's existing xpathCandidates and filter out invalid ones
          const aiXPathCandidates = step.xpathCandidates || [];
          
          // Filter AI xpathCandidates - reject any that reference DIFFERENT elements' attributes
          // Also reject GENERIC xpaths (like @role='textbox') when we have more specific attributes
          const validAiXPath = aiXPathCandidates.filter(xpath => {
            // Check if xpath references this element's attributes - reject if different
            if (thisElementUniqueValues.name) {
              const nameMatch = xpath.match(/@name=['"]([^'"]*)['"]/);
              if (nameMatch && nameMatch[1] !== thisElementUniqueValues.name) return false;
            }
            if (thisElementUniqueValues.id) {
              const idMatch = xpath.match(/@id=['"]([^'"]*)['"]/);
              if (idMatch && idMatch[1] !== thisElementUniqueValues.id) return false;
            }
            if (thisElementUniqueValues.placeholder) {
              const phMatch = xpath.match(/@placeholder=['"]([^'"]*)['"]/);
              if (phMatch && phMatch[1] !== thisElementUniqueValues.placeholder) return false;
            }
            
            // If element has id, name, or placeholder, REJECT generic role-only xpaths
            // UNLESS it's a combined xpath with more attributes
            if ((thisElementUniqueValues.id || thisElementUniqueValues.name || thisElementUniqueValues.placeholder)) {
              // Check if this is a generic single-attribute xpath (role only)
              const isGenericRoleOnly = 
                /^\/\/[a-z\*]+\[@role=['"][^'"]*['"]\]$/.test(xpath) &&
                !xpath.includes('@name=') && 
                !xpath.includes('@id=') &&
                !xpath.includes('@placeholder=') &&
                !xpath.includes('@type=');
              
              if (isGenericRoleOnly && thisElementUniqueValues.name) {
                return false; // Reject generic role xpath when we have name
              }
              if (isGenericRoleOnly && thisElementUniqueValues.id) {
                return false; // Reject generic role xpath when we have id
              }
            }
            
            return true;
          });
          
          // Merge xpathCandidates: generated hints FIRST (most specific), then filtered AI xpaths
          // Generated hints use name/id/placeholder/type - most specific attributes
          // Then AI's valid xpaths (may have text-based xpaths)
          const allXPathCandidates = [...new Set([...generatedXPathFromHints, ...xpathCandidates, ...validAiXPath])];
          
          // Reorder xpathCandidates by specificity:
          // 1. Combined attributes (id+name+type+role) - MOST specific
          // 2. Text-based (normalize-space) - MORE specific (identifies specific element)
          // 3. Text + role combined - specific
          // 4. ID/name/type/placeholder - specific
          // 5. Role-only - LEAST specific (matches many elements)
          const reorderBySpecificity = (xpaths: string[]): string[] => {
            const hasText = (x: string) => x.includes('normalize-space(.)') || x.includes('[.=');
            const hasRole = (x: string) => x.includes('@role=');
            const hasCombinedAttrs = (x: string) => {
              const attrCount = (x.match(/\[/g) || []).length;
              return attrCount >= 3; // 3+ attributes = combined
            };
            
            const grouped: { priority: number; xpath: string }[] = xpaths.map((x, i) => {
              let priority = 10; // default lowest priority
              
              if (hasCombinedAttrs(x)) {
                priority = 1; // Combined attrs = most specific
              } else if (hasText(x) && hasRole(x)) {
                priority = 2; // Text + role = very specific
              } else if (hasText(x)) {
                priority = 3; // Text only = more specific (identifies element)
              } else if (x.includes('@id=') || x.includes('@name=') || x.includes('@placeholder=') || x.includes('@type=')) {
                priority = 4; // ID/name/type/placeholder = specific
              } else if (hasRole(x)) {
                priority = 5; // Role only = generic
              } else {
                priority = 6; // Other/fallback
              }
              
              return { priority, xpath: x, originalIndex: i };
            });
            
            // Sort by priority (ascending), then by original index (stable sort)
            grouped.sort((a, b) => {
              if (a.priority !== b.priority) return a.priority - b.priority;
              return a.originalIndex - b.originalIndex;
            });
            
            return grouped.map(g => g.xpath);
          };
          
          const reorderedXPathCandidates = reorderBySpecificity(allXPathCandidates);
          
          // CRITICAL: Always include xpath data - fall back to original event's xpath if empty
          // Use the MOST SPECIFIC xpath as primary (first in array after reordering)
          const finalXPath = reorderedXPathCandidates[0] || fallbackEvent?.element?.xpath;
          const finalXPathCandidates = reorderedXPathCandidates.length > 0 
            ? reorderedXPathCandidates 
            : (fallbackEvent?.element?.xpathCandidates || []);
          
          // Final CSS candidates (without :has-text)
          // Combine generated hints + AI's CSS candidates
          let finalCssCandidates = [...generatedFromHints, ...cssOnlyCandidates];
          
          // If no CSS candidates and element has role, add role-based CSS
          if (finalCssCandidates.length === 0 && thisElementAttrs['role']) {
            finalCssCandidates.push(`[role='${thisElementAttrs['role']}']`);
          }
          
          // Reorder CSS selectors by specificity (similar to XPath):
          // 1. Combined attributes first (tag[name][type]) - MOST specific
          // 2. ID-based: #id or tag#id
          // 3. Name/Type/Placeholder-based: [name=X] or [type=X]
          // 4. Role-based: [role=X] - LEAST specific
          const hasId = (s: string) => /#[\w-]+/.test(s);
          const hasName = (s: string) => s.includes("[name='") || s.includes('[name="');
          const hasType = (s: string) => s.includes("[type='") || s.includes('[type="');
          const hasPlaceholder = (s: string) => s.includes("[placeholder='") || s.includes('[placeholder="');
          const hasRole = (s: string) => s.includes("[role='") || s.includes('[role="');
          const hasCombinedAttrs = (s: string) => {
            const match = s.match(/\[/g);
            return match && match.length >= 2; // 2+ attributes = combined
          };
          
          const cssReorderFn = (cssList: string[]): string[] => {
            const tagged: { priority: number; css: string }[] = cssList.map((c, i) => {
              let priority = 10;
              
              if (hasCombinedAttrs(c)) {
                priority = 1; // Combined = most specific
              } else if (hasId(c)) {
                priority = 2; // ID-based
              } else if (hasName(c)) {
                priority = 3; // Name-based
              } else if (hasType(c)) {
                priority = 4; // Type-based
              } else if (hasPlaceholder(c)) {
                priority = 5; // Placeholder-based
              } else if (hasRole(c)) {
                priority = 6; // Role-based = generic
              } else {
                priority = 7; // Other/fallback
              }
              
              return { priority, css: c, index: i };
            });
            
            tagged.sort((a, b) => {
              if (a.priority !== b.priority) return a.priority - b.priority;
              return a.index - b.index; // Stable sort
            });
            
            return tagged.map(t => t.css);
          };
          
          const finalSelectorCandidates = cssReorderFn(finalCssCandidates);
          
          return {
            ...step,
            value: resolvedValue,
            expectedValue: resolvedExpectedValue,
            selector: finalPrimarySelector,
            selectorCandidates: finalSelectorCandidates,
            xpath: finalXPath,
            xpathCandidates: finalXPathCandidates,
            elementHints:
              step.elementHints ||
              (fallbackEvent
                ? {
                    tagName: fallbackEvent.element.tagName,
                    textContent: fallbackEvent.element.textContent,
                    attributes: fallbackEvent.element.attributes,
                  }
                : undefined),
          };
        });

        const { lastBlueprint: currentLast } = await chrome.storage.local.get([
          'lastBlueprint',
        ]);

        // ENSURE NAVIGATE STEP IS ALWAYS FIRST
        // The AI might not include it, so we need to check and prepend if missing
        let finalSteps = enrichedSteps;
        const hasNavigateStep =
          enrichedSteps.length > 0 &&
          enrichedSteps[0].action === 'navigate' &&
          (enrichedSteps[0].value === startUrl ||
            enrichedSteps[0].value?.includes(startUrl || ''));

        if (!hasNavigateStep && startUrl) {
          console.log('[Background] AI did not include navigate step, prepending it');
          finalSteps = [
            navigateStep,
            ...enrichedSteps,
          ];
        }

        // Build correlated telemetry
        const sessionTelemetry = this.buildCorrelatedTelemetry(finalSteps, allEvents, startUrl);
        this.telemetry = sessionTelemetry;

        const finalBlueprint = {
          ...blueprint,
          steps: finalSteps,
          id: tempId,
          status: 'ready' as const,
          baseUrl: startUrl,
          created_at: new Date().toISOString(),
          video_url:
            resolvedVideoUrl ||
            this.pendingVideoUrls.get(tempId) ||
            currentLast?.video_url ||
            currentLast?.videoUrl,
          videoUrl:
            resolvedVideoUrl ||
            this.pendingVideoUrls.get(tempId) ||
            currentLast?.video_url ||
            currentLast?.videoUrl,
          telemetry: sessionTelemetry,
        };
        
        // DEBUG: Check if finalBlueprint has xpath before storing
        console.log('[Background] DEBUG BLUEPRINT_GENERATED: Checking xpath in finalBlueprint:');
        if (finalBlueprint.steps && finalBlueprint.steps.length > 1) {
          for (let i = 1; i < Math.min(finalBlueprint.steps.length, 4); i++) {
            const step = finalBlueprint.steps[i];
            console.log(`[Background] DEBUG: Step ${i} (${step.action}) xpath:`, step.xpath);
          }
        }
        
        await chrome.storage.local.set({ lastBlueprint: finalBlueprint });

        this.broadcast({
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: finalBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: finalBlueprint },
        });
      } catch (e: any) {
        console.error('[Background] Final processing failed:', e);
        const result = await chrome.storage.local.get(['currentRecordingId']);
        const currentId = result.currentRecordingId || tempId;

        const failedTelemetry = this.buildCorrelatedTelemetry(
          [
            navigateStep,
            ...allEvents.map((e, i) => ({
              id: (i + 1).toString(),
              action: e.type,
              selector: e.element.selector,
              value: e.value,
              description: `${e.type} on ${e.element.tagName}`,
            })),
          ] as any,
          allEvents,
          startUrl
        );
        this.telemetry = failedTelemetry;

        const failedBlueprint = {
          id: currentId,
          name: `Recording ${new Date().toLocaleTimeString()}`,
          steps: [
            navigateStep,
            ...allEvents.map((e, i) => ({
              id: (i + 1).toString(),
              action: e.type,
              selector: e.element.selector,
              selectorCandidates: e.element.selectorCandidates || [e.element.selector],
              xpath: e.element.xpath,
              xpathCandidates: e.element.xpathCandidates || [],
              elementHints: {
                tagName: e.element.tagName,
                textContent: e.element.textContent,
                attributes: e.element.attributes,
                parentInfo: e.element.parentInfo,
                structuralInfo: e.element.structuralInfo,
              },
            })),
          ],
          status: 'failed' as const,
          error: e.message,
          telemetry: failedTelemetry,
        };
        await chrome.storage.local.set({ lastBlueprint: failedBlueprint });
        this.broadcast({
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: failedBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: failedBlueprint },
        });
      }
    } else {
      console.warn('[Background] No events captured, but showing navigate step');
      // Even with no events, show a blueprint with just the navigate step
      const emptyTelemetry = this.buildCorrelatedTelemetry([navigateStep], allEvents, startUrl);
      this.telemetry = emptyTelemetry;

      const emptyBlueprint = {
        id: tempId,
        name: `Recording ${new Date().toLocaleTimeString()}`,
        steps: [navigateStep],
        status: 'ready' as const,
        baseUrl: startUrl,
        description: 'Recording with no interactions captured',
        telemetry: emptyTelemetry,
      };
      
      await chrome.storage.local.set({ lastBlueprint: emptyBlueprint });
      this.broadcast({
        type: MessageType.BLUEPRINT_GENERATED,
        data: { blueprint: emptyBlueprint },
      });
      await this.notifyTab(tab?.id, {
        type: MessageType.BLUEPRINT_GENERATED,
        data: { blueprint: emptyBlueprint },
      });
    }

    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
    await chrome.storage.local.remove(['currentRecordingId']);
  }

  private setupCDPNetworkListener(tabId: number) {
    // Listen for CDP events via chrome.debugger.onEvent
    const listener = (source: any, method: string, params: any) => {
      if (source.tabId !== tabId) return;

      if (method === 'Network.requestWillBeSent') {
        const entry: NetworkRequestEntry = {
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          timestamp: Date.now(),
          requestHeaders: params.request.headers || {},
        };
        // Store temporarily to pair with response
        (this as any).__pendingNetworkRequests = (this as any).__pendingNetworkRequests || new Map();
        (this as any).__pendingNetworkRequests.set(params.requestId, { entry, startTime: Date.now() });
      } else if (method === 'Network.responseReceived') {
        const pending = (this as any).__pendingNetworkRequests?.get(params.requestId);
        if (pending) {
          pending.entry.status = params.response.status;
          pending.entry.statusText = params.response.statusText;
          pending.entry.responseHeaders = params.response.headers || {};
        }
      } else if (method === 'Network.loadingFinished') {
        const pending = (this as any).__pendingNetworkRequests?.get(params.requestId);
        if (pending) {
          pending.entry.durationMs = Date.now() - pending.startTime;
          this.networkRequests.push(pending.entry);
          (this as any).__pendingNetworkRequests.delete(params.requestId);
          // Flush every 20 requests
          if (this.networkRequests.length % 20 === 0) {
            this.flushNetworkBuffer();
          }
        }
      } else if (method === 'Network.loadingFailed') {
        const pending = (this as any).__pendingNetworkRequests?.get(params.requestId);
        if (pending) {
          pending.entry.error = params.errorText || params.type || 'Network error';
          pending.entry.durationMs = Date.now() - pending.startTime;
          this.networkRequests.push(pending.entry);
          (this as any).__pendingNetworkRequests.delete(params.requestId);
        }
      }
    };

    chrome.debugger.onEvent.addListener(listener);

    // Store reference so we can remove it later
    (this as any).__cdpNetworkListener = listener;
  }

  private flushNetworkBuffer() {
    // Network requests are kept in memory until stopRecording
  }

  private async disableCDPNetwork(tabId: number) {
    if (!this.cdpNetworkEnabled) return;
    try {
      await CDPHandler.sendCommand(tabId, 'Network.disable', {});
      this.cdpNetworkEnabled = false;
      console.log('[Background] CDP Network domain disabled');
    } catch (e) {
      console.warn('[Background] Failed to disable CDP Network:', e);
    }
    // Remove listener
    const listener = (this as any).__cdpNetworkListener;
    if (listener) {
      chrome.debugger.onEvent.removeListener(listener);
      (this as any).__cdpNetworkListener = null;
    }
  }

  private buildCorrelatedTelemetry(
    steps: TestStep[],
    allEvents: RawEvent[],
    startUrl?: string
  ): SessionTelemetry {
    const stepContexts: StepContext[] = [];
    const WINDOW_MS = 2000; // ±2 seconds around each step

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      // Find the event timestamp that corresponds to this step
      let stepTimestamp: number;
      if (i === 0 && step.action === 'navigate') {
        stepTimestamp = this.telemetry.startTime || Date.now();
      } else {
        const eventIndex = step.action === 'navigate' ? -1 : i - 1;
        const event = eventIndex >= 0 ? allEvents[eventIndex] : null;
        stepTimestamp = event?.timestamp || Date.now();
      }

      const surroundingLogs = this.consoleLogs.filter(
        log => Math.abs(log.timestamp - stepTimestamp) <= WINDOW_MS
      );
      const surroundingRequests = this.networkRequests.filter(
        req => Math.abs(req.timestamp - stepTimestamp) <= WINDOW_MS
      );
      const surroundingErrors = this.jsErrors.filter(
        err => Math.abs(err.timestamp - stepTimestamp) <= WINDOW_MS
      );
      const domMutationCount = this.telemetry.domMutations?.filter(
        m => Math.abs(m.timestamp - stepTimestamp) <= WINDOW_MS
      ).length || 0;

      stepContexts.push({
        stepIndex: i,
        timestamp: stepTimestamp,
        surroundingLogs,
        surroundingRequests,
        surroundingErrors,
        domMutationCount,
      });
    }

    return {
      recordingId: this.telemetry.recordingId || '',
      startUrl: startUrl || this.telemetry.startUrl || '',
      startTime: this.telemetry.startTime || Date.now(),
      endTime: Date.now(),
      browserContext: this.telemetry.browserContext || {
        userAgent: 'Chrome Extension (Service Worker)',
        viewport: { width: 1920, height: 1080 },
        url: startUrl || '',
      },
      consoleLogs: this.consoleLogs,
      networkRequests: this.networkRequests,
      jsErrors: this.jsErrors,
      storageSnapshots: this.telemetry.storageSnapshots || [],
      domMutations: this.telemetry.domMutations || [],
      stepsWithContext: stepContexts,
    };
  }
}

// Hot reload (Development only)
if (process.env.NODE_ENV === 'development') {
  const connect = () => {
    try {
      const ws = new WebSocket('ws://localhost:8080');

      ws.onopen = () => {};

      ws.onmessage = e => {
        if (JSON.parse(e.data).type === 'reload') {
          chrome.runtime.reload();
        }
      };

      ws.onclose = () => {
        setTimeout(connect, 2000);
      };

      ws.onerror = err => {
        ws.close();
      };
    } catch (e) {
      setTimeout(connect, 2000);
    }
  };
  connect();
}

// Initialize the background service
new BackgroundService();
