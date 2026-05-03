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
  // Video Editor Flow - stores pending recording data for editing
  private pendingEditRecordings: Map<string, {
    events: RawEvent[];
    videoBlobKey: string;
    startUrl: string;
    startTime: number;
    endTime: number;
    telemetry: any;
  }> = new Map();

  constructor() {
    this.aiProcessor = new AIProcessor(__GOOGLE_API_KEY__);
    this.setupListeners();
  }

  private async uploadToR2(
    body: Uint8Array,
    fileName: string,
    contentType: string
  ): Promise<string> {
    console.log(`[Background] PutObjectCommand for ${fileName}, body size: ${body.length} bytes`);
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
    if (!headers['Authorization'] && !headers['X-Session-ID']) {
      try {
        if (chrome.storage && chrome.storage.session) {
          const result = await chrome.storage.session.get('session_id');
          if (result.session_id) {
            headers['X-Session-ID'] = result.session_id;
          }
        }
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

      // Video Editor Flow - Jam.dev style
      case MessageType.VIDEO_CAPTURE_READY:
        try {
          const { recordingId, videoBlobKey, duration, size } = message.data || {};
          console.log(`[Background] Video capture ready for editing: ${recordingId}, duration: ${duration}s, size: ${size}`);
          
          // Update the pending edit recording with video metadata if it exists
          const existing = this.pendingEditRecordings.get(recordingId);
          if (existing) {
            // Events already stored, just update with video info
            this.pendingEditRecordings.set(recordingId, {
              ...existing,
              videoBlobKey,
              endTime: Date.now(),
            });
            console.log(`[Background] Updated pending recording ${recordingId} with video blob key`);
          }
          // If not exists, the video is ready before stopRecording finished
          // stopRecording will store the events and use this videoBlobKey
          
          sendResponse({ success: true });
        } catch (e) {
          console.error(`[Background] Failed to handle VIDEO_CAPTURE_READY:`, e);
          sendResponse({ success: false, error: (e as Error).message });
        }
        break;

      case MessageType.GET_PENDING_EDIT_RECORDING:
        try {
          const { recordingId } = message.data || {};
          const pending = this.pendingEditRecordings.get(recordingId);
          
          if (!pending) {
            sendResponse({ success: false, error: 'No pending recording found' });
            return;
          }
          
          sendResponse({
            success: true,
            data: {
              recordingId,
              events: pending.events,
              videoBlobKey: pending.videoBlobKey,
              startUrl: pending.startUrl,
              startTime: pending.startTime,
              endTime: pending.endTime,
              telemetry: pending.telemetry,
            }
          });
        } catch (e) {
          console.error(`[Background] Failed to get pending recording:`, e);
          sendResponse({ success: false, error: (e as Error).message });
        }
        break;

      case MessageType.FINALIZE_EDITED_RECORDING:
        try {
          const { recordingId, trimStart, trimEnd, title, description } = message.data || {};
          console.log(`[Background] Finalizing edited recording: ${recordingId}, trim: ${trimStart}s - ${trimEnd}s`);
          
          const pending = this.pendingEditRecordings.get(recordingId);
          if (!pending) {
            sendResponse({ success: false, error: 'No pending recording found' });
            return;
          }
          
          // Start finalization process (this will take time)
          sendResponse({ success: true, data: { status: 'processing' } });
          
          // Process the finalized recording
          await this.finalizeEditedRecording(recordingId, pending, trimStart, trimEnd, title, description);
          
        } catch (e) {
          console.error(`[Background] Failed to finalize recording:`, e);
          sendResponse({ success: false, error: (e as Error).message });
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
            try {
              const response = await chrome.tabs.sendMessage(targetTabId, {
                type: 'OPEN_RECORDING_OVERLAY',
                data: { projectId },
              });
              sendResponse({ success: true, data: response });
            } catch {
              sendResponse({
                success: false,
                error:
                  'Failed to open recording overlay. The recorder content script may not be loaded on this page.',
              });
            }
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
      this.networkRequests = [];
      this.consoleLogs = [];
      this.jsErrors = [];
      (this as any).__pendingNetworkRequests = new Map();
      this.telemetry = {
        recordingId: currentRecordingId,
        startTime: Date.now(),
        startUrl: startUrl || '',
      };

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const startUrl = tab?.url;

      await chrome.storage.session.remove('currentRecording');
      await chrome.storage.local.set({
        currentRecordingProjectId: projectId,
        currentRecordingId,
        currentRecordingStartUrl: startUrl,
      });

      // CDP is enabled, but we don't set isRecording: true yet

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

      // 3. Update global recording state ONLY AFTER success
      await chrome.storage.local.set({ isRecording: true });
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
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

    // Stop Video Capture (offscreen will store blob in IndexedDB and send VIDEO_CAPTURE_READY)
    chrome.runtime.sendMessage({ type: MessageType.STOP_VIDEO_CAPTURE });

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

    // Generate a default title based on the start URL or action
    let defaultTitle = `Recording ${new Date().toLocaleTimeString()}`;
    if (startUrl) {
      try {
        const url = new URL(startUrl);
        const path = url.pathname.split('/').filter(Boolean).pop();
        if (path) {
          const capitalized = path.charAt(0).toUpperCase() + path.slice(1).replace(/[-_]/g, ' ');
          defaultTitle = `${capitalized} Flow`;
        } else {
          defaultTitle = `${url.hostname.replace('www.', '')} Recording`;
        }
      } catch (e) {}
    }

    // ========================================
    // VIDEO EDITOR FLOW (Jam.dev style)
    // Instead of immediately running AI, we store the recording data
    // and open the video editor for the user to trim/edit first
    // ========================================

    // Wait for video blob to be ready (from VIDEO_CAPTURE_READY message)
    const videoBlobKey = `recording-${tempId}`;
    const recordingStartTime = this.telemetry.startTime || Date.now();
    
    // Store pending recording data for the video editor
    this.pendingEditRecordings.set(tempId, {
      events: allEvents,
      videoBlobKey,
      startUrl: startUrl || '',
      startTime: recordingStartTime,
      endTime: Date.now(),
      title: defaultTitle,
      telemetry: { 
        ...this.telemetry,
        consoleLogs: this.consoleLogs,
        networkRequests: this.networkRequests,
        jsErrors: this.jsErrors,
      },
    });
    
    console.log(`[Background] Stored pending recording ${tempId} for video editor`);
    
    // Clear recording state
    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
    await chrome.storage.local.remove(['currentRecordingId']);
    
    // Open video editor in a new tab
    const videoEditorUrl = chrome.runtime.getURL(`video-editor.html?id=${tempId}`);
    await chrome.tabs.create({ url: videoEditorUrl });
    
    console.log(`[Background] Opened video editor for recording ${tempId}`);
  }

  /**
   * Finalize an edited recording after the user finishes trimming/editing in the video editor.
   * This method:
   * 1. Gets the video blob from IndexedDB
   * 2. Uploads the (trimmed) video to R2
   * 3. Filters events based on trim points
   * 4. Runs AI blueprint generation
   * 5. Saves the final blueprint
   */
  private async saveBlueprintToApi(blueprint: any): Promise<any> {
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

    // Map to API format
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

    console.log(`[Background] Saving recording ${blueprint.id} to API...`);
    const response = await api.post<any>('/recordings', {
      body: recording as any,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to save recording to database');
    }

    return response.data;
  }

  private async finalizeEditedRecording(
    recordingId: string,
    pendingData: {
      events: RawEvent[];
      videoBlobKey: string;
      startUrl: string;
      startTime: number;
      endTime: number;
      telemetry: any;
    },
    trimStart: number,
    trimEnd: number,
    title?: string,
    description?: string
  ): Promise<void> {
    console.log(`[Background] Finalizing recording ${recordingId}, trim: ${trimStart}s - ${trimEnd}s`);
    
    try {
      // Broadcast processing status
      const processingBlueprint = {
        id: recordingId,
        name: title || `Recording ${new Date().toLocaleTimeString()}`,
        steps: [],
        status: 'processing' as const,
        description: description || '',
      };
      
      await chrome.storage.local.set({ lastBlueprint: processingBlueprint });
      this.broadcast({
        type: MessageType.BLUEPRINT_PROCESSING,
        data: { blueprint: processingBlueprint },
      });

      // 1. Get trimmed video blob from offscreen document
      console.log(`[Background] Requesting trimmed video from offscreen: ${trimStart}s - ${trimEnd}s`);
      const videoBlob = await new Promise<Blob | null>((resolve) => {
        chrome.runtime.sendMessage(
          { 
            type: 'TRIM_VIDEO', 
            data: { 
              key: pendingData.videoBlobKey,
              trimStart,
              trimEnd
            } 
          },
          (response) => {
            if (response?.success && response.data?.videoData) {
              let rawData = response.data.videoData;
              
              // Fix object serialization if needed
              if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && !(rawData instanceof Uint8Array)) {
                const keys = Object.keys(rawData).map(Number).sort((a, b) => a - b);
                const arr = new Uint8Array(keys.length);
                for (let i = 0; i < keys.length; i++) {
                  arr[i] = rawData[keys[i]];
                }
                rawData = arr;
              }
              
              resolve(new Blob([rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)], {
                type: response.data.type || 'video/webm'
              }));
            } else {
              console.error('[Background] Failed to trim video:', response?.error);
              resolve(null);
            }
          }
        );
      });
      
      let videoUrl: string | undefined;
      
      // 2. Upload video to R2 if we have it
      if (videoBlob) {
        console.log(`[Background] Uploading trimmed video, size: ${videoBlob.size} bytes`);
        const fileName = `recordings/${recordingId}.webm`;
        const buffer = await videoBlob.arrayBuffer();
        
        videoUrl = await this.uploadToR2(
          new Uint8Array(buffer),
          fileName,
          'video/webm'
        );
        console.log(`[Background] Trimmed video uploaded: ${videoUrl}`);
        
        // Clean up the original blob from IndexedDB
        await this.deleteVideoBlobFromIndexedDB(pendingData.videoBlobKey);
      } else {
        console.warn(`[Background] Could not get trimmed video, falling back to original...`);
        // Fallback to original if trim failed
        const originalBlob = await this.getVideoBlobFromIndexedDB(pendingData.videoBlobKey);
        if (originalBlob) {
          const fileName = `recordings/${recordingId}.webm`;
          videoUrl = await this.uploadToR2(
            new Uint8Array(await originalBlob.arrayBuffer()),
            fileName,
            'video/webm'
          );
          await this.deleteVideoBlobFromIndexedDB(pendingData.videoBlobKey);
        }
      }
      
      // 3. Filter events based on trim points
      const recordingStartTime = pendingData.startTime;
      const trimStartMs = recordingStartTime + (trimStart * 1000);
      const trimEndMs = recordingStartTime + (trimEnd * 1000);
      
      const filteredEvents = pendingData.events.filter(event => {
        return event.timestamp >= trimStartMs && event.timestamp <= trimEndMs;
      });
      
      console.log(`[Background] Filtered events: ${filteredEvents.length} of ${pendingData.events.length} within trim range`);
      
      // 4. Run AI blueprint generation
      if (filteredEvents.length > 0) {
        console.log(`[Background] Running AI processing on ${filteredEvents.length} events...`);
        
        const blueprint = await this.aiProcessor.generateBlueprint(
          filteredEvents,
          pendingData.startUrl,
          pendingData.telemetry
        );
        
        if (!blueprint || typeof blueprint !== 'object') {
          throw new Error('AI generated an invalid blueprint');
        }
        
        console.log(`[Background] AI processing complete, enriching steps...`);
        
        // Enrich steps with selectors and xpath
        const enrichedSteps = this.enrichBlueprintSteps(blueprint.steps || [], filteredEvents, pendingData.startUrl);
        
        // Build final blueprint
        const finalBlueprint = {
          id: recordingId,
          name: title || blueprint.name || `Recording ${new Date().toLocaleTimeString()}`,
          description: description || blueprint.description || '',
          steps: enrichedSteps,
          status: 'ready' as const,
          baseUrl: pendingData.startUrl,
          video_url: videoUrl,
          created_at: Date.now(),
          telemetry: pendingData.telemetry,
        };
        
        // --- AUTO-SAVE TO DATABASE ---
        console.log(`[Background] Auto-saving recording to database...`);
        try {
          await this.saveBlueprintToApi(finalBlueprint);
          console.log(`[Background] Successfully saved recording to database`);
          
          // Clear "Recent Recording" card from UI since it's now saved
          await chrome.storage.local.remove('lastBlueprint');
          
          this.broadcast({
            type: MessageType.BLUEPRINT_SAVED,
            data: { blueprint: finalBlueprint },
          });
        } catch (apiError) {
          console.error(`[Background] Failed to auto-save to database:`, apiError);
          // Fallback: still show in "Recent Draft" if save failed
          await chrome.storage.local.set({ lastBlueprint: finalBlueprint });
        }
        
        this.broadcast({
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: finalBlueprint },
        });
        
        console.log(`[Background] Blueprint finalized for ${recordingId}`);
      } else {
        // No events after trimming - create empty blueprint
        const emptyBlueprint = {
          id: recordingId,
          name: title || `Recording ${new Date().toLocaleTimeString()}`,
          description: description || 'No events in trimmed range',
          steps: [{
            id: '0-nav',
            action: 'navigate' as const,
            value: pendingData.startUrl,
            description: `Navigate to ${pendingData.startUrl}`,
            selector: 'body',
            selectorCandidates: ['body'],
          }],
          status: 'ready' as const,
          baseUrl: pendingData.startUrl,
          video_url: videoUrl,
          created_at: Date.now(),
        };
        
        // --- AUTO-SAVE TO DATABASE ---
        try {
          await this.saveBlueprintToApi(emptyBlueprint);
          await chrome.storage.local.remove('lastBlueprint');
          
          this.broadcast({
            type: MessageType.BLUEPRINT_SAVED,
            data: { blueprint: emptyBlueprint },
          });
        } catch (e) {
          await chrome.storage.local.set({ lastBlueprint: emptyBlueprint });
        }

        this.broadcast({
          type: MessageType.BLUEPRINT_GENERATED,
          data: { blueprint: emptyBlueprint },
        });
      }
      
      // Clean up pending recording
      this.pendingEditRecordings.delete(recordingId);
      
    } catch (error) {
      console.error(`[Background] Failed to finalize recording ${recordingId}:`, error);
      
      // Broadcast error
      const failedBlueprint = {
        id: recordingId,
        name: title || `Recording ${new Date().toLocaleTimeString()}`,
        status: 'error' as const,
        error: (error as Error).message,
      };
      
      await chrome.storage.local.set({ lastBlueprint: failedBlueprint });
      
      // Clear pending state even on error so user isn't stuck
      await chrome.storage.local.remove('pendingRecording');

      this.broadcast({
        type: MessageType.BLUEPRINT_GENERATED,
        data: { blueprint: failedBlueprint },
      });
    }
  }

  /**
   * Get video blob from IndexedDB via offscreen document
   */
  private async getVideoBlobFromIndexedDB(key: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'GET_VIDEO_BLOB', data: { key } },
        (response) => {
          if (response?.success && response.data?.videoData) {
            let rawData = response.data.videoData;
            
            // Handle potentially mangled serialization
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && !(rawData instanceof Uint8Array)) {
              console.log('[Background] Fixing object-based Uint8Array from offscreen');
              const keys = Object.keys(rawData).map(Number).sort((a, b) => a - b);
              const arr = new Uint8Array(keys.length);
              for (let i = 0; i < keys.length; i++) {
                arr[i] = rawData[keys[i]];
              }
              rawData = arr;
            }
            
            const blob = new Blob([rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)], {
              type: response.data.type || 'video/webm'
            });
            resolve(blob);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Delete video blob from IndexedDB via offscreen document
   */
  private async deleteVideoBlobFromIndexedDB(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'DELETE_VIDEO_BLOB', data: { key } },
        () => resolve()
      );
    });
  }

  /**
   * Enrich blueprint steps with selector and xpath data from events
   */
  private enrichBlueprintSteps(steps: any[], events: RawEvent[], startUrl?: string): TestStep[] {
    return steps.map((step, index): TestStep => {
      const eventIndex = index - (steps[0]?.action === 'navigate' ? 1 : 0);
      const event = eventIndex >= 0 ? events[eventIndex] : null;
      
      return {
        id: index.toString(),
        action: step.action,
        value: step.value,
        description: step.description,
        selector: step.selector || event?.element?.selector || 'body',
        selectorCandidates: step.selectorCandidates || event?.element?.selectorCandidates || [],
        xpath: step.xpath || event?.element?.xpath,
        xpathCandidates: step.xpathCandidates || event?.element?.xpathCandidates || [],
        elementHints: step.elementHints || (event ? {
          tagName: event.element.tagName,
          textContent: event.element.textContent,
          attributes: event.element.attributes,
        } : undefined),
        expectedValue: step.expectedValue,
      };
    });
  }

  // Legacy method - kept for reference
  private async stopRecordingLegacy() {
    console.log(`[Background] LEGACY STOP_RECORDING - THIS SHOULD NOT BE CALLED`);
    // This method is no longer used. The new flow uses:
    // 1. stopRecording() - collects events and opens video editor
    // 2. finalizeEditedRecording() - processes after user edits video
  }

  private setupCDPNetworkListener(tabId: number) {
    console.log(`[Background] Setting up CDP Network listener for tab ${tabId}`);
    // Listen for CDP events via chrome.debugger.onEvent
    const listener = (source: any, method: string, params: any) => {
      if (source.tabId !== tabId) return;

      if (method === 'Network.requestWillBeSent') {
        console.log(`[Background] CDP Network: requestWillBeSent ${params.request.url}`);
        const entry: NetworkRequestEntry = {
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          timestamp: Date.now(),
          requestHeaders: params.request.headers || {},
          requestPayload: params.request.postData || undefined,
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

          // Try to fetch response body for text-based content types
          const ct = (pending.entry.responseHeaders?.['content-type'] || pending.entry.responseHeaders?.['Content-Type'] || '').toLowerCase();
          const isTextBased = ct && (ct.includes('json') || ct.includes('text') || ct.includes('xml') || ct.includes('html') || ct.includes('form-urlencoded') || ct.includes('graphql') || ct.includes('javascript'));
          if (isTextBased) {
            CDPHandler.sendCommand(tabId, 'Network.getResponseBody', { requestId: params.requestId })
              .then((result: { body: string; base64Encoded: boolean }) => {
                if (result && result.body) {
                  const body = result.base64Encoded ? atob(result.body) : result.body;
                  pending.entry.responsePayload = body.length > 10240 ? body.slice(0, 10240) + '\n... [truncated]' : body;
                }
              })
              .catch(() => {
                // Response body not available (e.g., redirect, opaque)
              });
          }

          this.networkRequests.push(pending.entry);
          console.log(`[Background] CDP Network: loadingFinished ${pending.entry.url} (${this.networkRequests.length} total)`);
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
