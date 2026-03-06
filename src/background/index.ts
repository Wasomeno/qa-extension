import {
  ExtensionMessage,
  MessageType,
  BackgroundFetchRequest,
} from '../types/messages';
import { AIProcessor } from '../services/ai-processor';
import { RawEvent, TestRecording } from '../types/recording';
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
    for (const char of text) {
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
        unmodifiedText: char,
      });
      await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
        unmodifiedText: char,
      });
    }
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
  private pendingPlaybacks: Map<string, (result: any) => void> = new Map();
  private isStartingRecording = false;
  private thumbnailCache: Map<string, string> = new Map();
  private pendingThumbnails: Map<string, Array<(response: any) => void>> =
    new Map();

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
          const { input, session_id } = msg.data;

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
              reasons: [chrome.offscreen.Reason.LOCAL_STORAGE],
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

          // Convert base64 back to Blob
          const res = await fetch(base64);
          const blob = await res.blob();

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

          // Ensure blueprint has an ID
          if (!blueprint.id) {
            blueprint.id = `rec-${Date.now()}`;
          }

          // Map TestBlueprint to TestRecording if necessary, though they are very similar
          const recording: TestRecording = {
            id: blueprint.id,
            name: blueprint.name || 'Untitled Recording',
            description: blueprint.description || '',
            status: blueprint.status || 'ready',
            steps: (blueprint.steps || []).map((step: any) => ({
              action: step.action,
              description: step.description || '',
              selector: step.selector,
              selectorCandidates: step.selectorCandidates || [],
              value: step.value,
              assertionType: step.assertionType,
              expectedValue: step.expectedValue,
              elementHints: {
                tagName: step.elementHints?.tagName || 'div',
                attributes: step.elementHints?.attributes || {},
              },
            })),
            parameters: blueprint.parameters || [],
          };

          const response = await api.post<any>('/recordings', {
            body: recording,
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
            body: data,
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
          await CDPHandler.type(message.data.tabId, message.data.text);
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

      case MessageType.IFRAME_CLOSED_OVERLAY:
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
        } catch {}
        sendResponse({ success: true });
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

    // 3. Generate blueprint if we have events
    if (allEvents.length > 0) {
      try {
        // Save raw events as a temporary blueprint so it shows up immediately
        const tempBlueprint = {
          id: tempId,
          name: `Recording ${new Date().toLocaleTimeString()}`,
          steps: allEvents.map((e, i) => ({
            id: i.toString(),
            action: e.type,
            selector: e.element.selector,
            selectorCandidates: e.element.selectorCandidates || [
              e.element.selector,
            ],
            elementHints: {
              tagName: e.element.tagName,
              textContent: e.element.textContent,
              attributes: e.element.attributes,
            },
          })),
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

        // Generate blueprint
        const blueprint = await this.aiProcessor.generateBlueprint(
          allEvents,
          startUrl
        );
        console.log(
          '[Background] AI processing complete, generating enriched steps...'
        );

        const enrichedSteps = (blueprint.steps || []).map((step, index) => {
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
          const selectorCandidates = Array.from(
            new Set(
              [
                ...(step.selectorCandidates || []),
                ...(fallbackEvent?.element?.selectorCandidates || []),
                step.selector,
                fallbackSelector,
              ].filter(Boolean)
            )
          );

          return {
            ...step,
            value: resolvedValue,
            expectedValue: resolvedExpectedValue,
            selector: step.selector || fallbackSelector || 'body',
            selectorCandidates,
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

        const finalBlueprint = {
          ...blueprint,
          steps: enrichedSteps,
          id: tempId,
          status: 'ready',
          baseUrl: startUrl,
        };
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

        const failedBlueprint = {
          id: currentId,
          name: `Recording ${new Date().toLocaleTimeString()}`,
          steps: [],
          status: 'failed',
          error: e.message,
        } as any;
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
      console.warn('[Background] No events captured, clearing lastBlueprint');
      await chrome.storage.local.remove('lastBlueprint');
      this.broadcast({
        type: MessageType.BLUEPRINT_GENERATED,
        data: { blueprint: null },
      });
      await this.notifyTab(tab?.id, {
        type: MessageType.BLUEPRINT_GENERATED,
        data: { blueprint: null },
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'Recording Empty',
        message: 'No interactions were captured. Please try again.',
      });
    }

    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
    await chrome.storage.local.remove(['currentRecordingId']);
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
