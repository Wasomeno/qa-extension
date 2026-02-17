import {
  ExtensionMessage,
  MessageType,
  BackgroundFetchRequest,
} from '../types/messages';
import { AIProcessor } from '../services/ai-processor';
import { videoStorage } from '../services/video-storage';
import { RawEvent } from '../types/recording';
import { SAMPLE_BLUEPRINT } from '../lib/seed-data';
import { isRestrictedUrl } from '../utils/domain-matcher';

class BackgroundService {
  private aiProcessor: AIProcessor;
  private recordingEvents: RawEvent[] = [];
  private pendingPlaybacks: Map<string, (result: any) => void> = new Map();
  private isStartingRecording = false;

  constructor() {
    this.aiProcessor = new AIProcessor(__GOOGLE_API_KEY__);
    this.setupListeners();
  }

  private broadcast(payload: any) {
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
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

      // Seed sample data if empty
      const result = await chrome.storage.local.get(['test-blueprints']);
      if (
        !result['test-blueprints'] ||
        result['test-blueprints'].length === 0
      ) {
        await chrome.storage.local.set({
          'test-blueprints': [SAMPLE_BLUEPRINT],
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
      if (!port || port.name !== 'bridge') return;
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

    // Global relay for offscreen logs
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === 'OFFSCREEN_LOG') {
        console.log(
          `[Offscreen Relay] ${message.data.message}`,
          ...(message.data.args || [])
        );
      }
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
      case MessageType.AUTH_LOGOUT:
        this.broadcast({ type: MessageType.AUTH_SESSION_UPDATED, data: null });
        sendResponse({ success: true });
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

      case 'START_OFFSCREEN_RECORDING' as any:
      case 'STOP_OFFSCREEN_RECORDING' as any:
        // Relay to offscreen document
        chrome.runtime.sendMessage(message);
        sendResponse({ success: true });
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

          const result = await chrome.storage.local.get(['test-blueprints']);
          const blueprints = result['test-blueprints'] || [];

          // Ensure blueprint has an ID
          if (!blueprint.id) {
            blueprint.id = `rec-${Date.now()}`;
          }

          // Add or update
          const index = blueprints.findIndex((b: any) => b.id === blueprint.id);
          if (index >= 0) {
            blueprints[index] = blueprint;
          } else {
            blueprints.push(blueprint);
          }

          await chrome.storage.local.set({ 'test-blueprints': blueprints });
          // Clear last blueprint after saving
          await chrome.storage.local.remove('lastBlueprint');

          this.broadcast({ type: 'BLUEPRINT_SAVED', data: { blueprint } });
          sendResponse({ success: true, data: { blueprint } });
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

          const result = await chrome.storage.local.get(['test-blueprints']);
          const blueprints = result['test-blueprints'] || [];
          const filtered = blueprints.filter((b: any) => b.id !== id);

          await chrome.storage.local.set({ 'test-blueprints': filtered });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.GET_VIDEO_BLOB:
        try {
          const { id } = message.data || {};
          if (!id) {
            sendResponse({ success: false, error: 'Missing ID' });
            return;
          }
          const blob = await videoStorage.getVideo(id);
          if (!blob) {
            sendResponse({ success: false, error: 'Video not found' });
            return;
          }
          // Convert blob to base64 for messaging
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ success: true, data: { base64: reader.result } });
          };
          reader.onerror = () => {
            sendResponse({ success: false, error: 'Failed to read blob' });
          };
          reader.readAsDataURL(blob);
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.OPEN_URL:
        try {
          const { url } = message.data || {};
          if (!url) {
            sendResponse({ success: false, error: 'Missing URL' });
            return;
          }
          chrome.tabs.create({ url });
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e?.message });
        }
        break;

      case MessageType.GET_RECORDED_TESTS:
        try {
          const result = await chrome.storage.local.get(['test-blueprints']);
          sendResponse({
            success: true,
            data: result['test-blueprints'] || [],
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
          const startUrl = firstNavigateStep?.value || 'about:blank';

          const tab = await chrome.tabs.create({ url: startUrl });

          // Wait for the new tab to load before continuing
          await new Promise<void>(resolve => {
            const listener = (
              tabId: number,
              changeInfo: chrome.tabs.TabChangeInfo
            ) => {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });

          if (!tab.id) {
            sendResponse({
              success: false,
              error: 'No valid tab for playback',
            });
            return;
          }

          // Persist state
          await chrome.storage.local.set({
            activePlayback: {
              isActive: true,
              blueprint,
              currentStepIndex: 0,
              status: 'playing',
            },
          });

          // Send message to start
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id!, {
              type: MessageType.START_PLAYBACK,
              data: { blueprint },
            });
          }, 500);

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
          }
        }
        sendResponse({ success: true });
        break;

      case MessageType.START_RECORDING:
        try {
          const { projectId } = message.data || {};
          await this.startRecording(projectId, sender.tab);
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
        if (!tab) throw new Error('Could not identify target tab');

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'QA Recorder',
          message: 'Starting recording session...',
        });

        await this.startRecording(undefined, tab);
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

  private async startRecording(
    projectId?: number,
    targetTab?: chrome.tabs.Tab
  ) {
    if (this.isStartingRecording) {
      console.warn(
        '[Background] Recording start already in progress, ignoring request.'
      );
      return;
    }
    this.isStartingRecording = true;

    try {
      let tab = targetTab;
      if (!tab) {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tab = activeTab;
      }

      if (!tab?.id) throw new Error('No active tab found');
      const targetTabId = tab.id;

      const currentRecordingId = `rec-${Date.now()}`;
      console.log(
        `[Background] Starting recording session: ${currentRecordingId} for tab ${targetTabId}`
      );

      // 1. Immediate State
      this.recordingEvents = [];
      await chrome.storage.session.remove('currentRecording');
      await chrome.storage.local.set({
        isRecording: true,
        currentRecordingProjectId: projectId,
        currentRecordingId,
      });

      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'Recording Active',
        message: 'The recorder is now active on this page.',
      });

      // Notify tab immediately (it's already injected via manifest)
      setTimeout(() => {
        chrome.tabs
          .sendMessage(targetTabId, {
            type: MessageType.START_RECORDING,
            data: { isRecording: true, projectId, id: currentRecordingId },
          })
          .catch(() => {
            /* ignore if tab not ready yet */
          });
      }, 200);

      // 2. Background Video Capture via Bridge Window + Offscreen
      (async () => {
        try {
          // Create offscreen document first (for receiving the stream later)
          const existingContexts = await (chrome.runtime as any).getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
          });
          if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
              url: 'offscreen.html',
              reasons: [chrome.offscreen.Reason.USER_MEDIA],
              justification: 'Recording tab video',
            });
          }

          console.log('[Background] Opening Recorder Bridge Window...');
          let bridgeWindowId: number | undefined;

          const response = await new Promise<any>(resolve => {
            chrome.windows.create(
              {
                url: 'picker.html',
                type: 'popup',
                width: 1,
                height: 1,
                focused: false,
                top: 0,
                left: 0,
              },
              window => {
                if (!window?.id) {
                  resolve({
                    success: false,
                    error: 'Failed to open recorder window',
                  });
                  return;
                }
                bridgeWindowId = window.id;

                // Store window ID for cleanup
                chrome.storage.local.set({ recorderWindowId: bridgeWindowId });

                // Wait for window load then start
                setTimeout(() => {
                  chrome.runtime.sendMessage(
                    {
                      type: 'START_RECORDER_PROXY',
                      data: { id: currentRecordingId },
                    },
                    res => {
                      if (chrome.runtime.lastError)
                        resolve({
                          success: false,
                          error: chrome.runtime.lastError.message,
                        });
                      else resolve(res);
                    }
                  );
                }, 500);
              }
            );
          });

          if (response?.success) {
            console.log('[Background] Recorder Bridge started successfully');
          } else {
            console.error(
              '[Background] Recorder Bridge failed:',
              response?.error
            );
            if (bridgeWindowId) chrome.windows.remove(bridgeWindowId);
            throw new Error(`Recorder failure: ${response?.error}`);
          }
        } catch (videoError) {
          console.error('[Background] Video recording flow error:', videoError);
        } finally {
          this.isStartingRecording = false;
        }
      })();
    } catch (e) {
      this.isStartingRecording = false;
      throw e;
    }
  }

  private async stopRecording() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Get the pre-generated ID
    const { currentRecordingId } = await chrome.storage.local.get([
      'currentRecordingId',
    ]);
    const tempId = currentRecordingId || `rec-${Date.now()}`;
    console.log(`[Background] Stopping recording session: ${tempId}`);

    await chrome.storage.local.set({ isRecording: false });
    chrome.action.setBadgeText({ text: '' });

    // 1. Collect events from all possible sources
    let allEvents: RawEvent[] = [...this.recordingEvents];
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

    // Check if we already know there's no video (due to permission error)
    const noVideoResult = await chrome.storage.local.get([
      `no_video_${tempId}`,
    ]);
    const skipVideo = noVideoResult[`no_video_${tempId}`];

    // 2. Setup listener for video saved confirmation BEFORE signaling stop
    let responseReceived = false;
    let videoSavedSuccess = false;
    const videoSavedPromise = skipVideo
      ? Promise.resolve(false)
      : new Promise<boolean>(resolve => {
          console.log(
            `[Background] Registering VIDEO_SAVED listener for ID: ${tempId}`
          );
          const listener = (message: any) => {
            if (message.type === 'VIDEO_SAVED' && message.data?.id === tempId) {
              chrome.runtime.onMessage.removeListener(listener);
              const success = !!message.data?.success;
              console.log(
                `[Background] Received VIDEO_SAVED confirmation. ID: ${tempId}, Success: ${success}`
              );
              if (message.data?.error)
                console.error(
                  `[Background] Offscreen error: ${message.data.error}`
                );

              responseReceived = true;
              videoSavedSuccess = success;
              resolve(success);
            }
          };
          chrome.runtime.onMessage.addListener(listener);
          // Timeout after 15 seconds
          setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            if (!responseReceived) {
              console.warn(
                '[Background] Timed out waiting for VIDEO_SAVED for ID:',
                tempId
              );
            }
            resolve(videoSavedSuccess);
          }, 15000);
        });

    // Tell Recorder Window to stop
    if (!skipVideo) {
      console.log('[Background] Signaling Recorder Window to stop...');
      chrome.runtime.sendMessage({
        type: 'STOP_RECORDER_PROXY',
        data: { id: tempId },
      });
    }

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
          })),
          status: 'processing',
          hasVideo: !skipVideo,
        } as any;

        await chrome.storage.local.set({ lastBlueprint: tempBlueprint });
        this.broadcast({
          type: 'BLUEPRINT_PROCESSING',
          data: { blueprint: tempBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: 'BLUEPRINT_PROCESSING',
          data: { blueprint: tempBlueprint },
        });

        console.log(
          '[Background] Running AI processing and waiting for video save...'
        );
        // Run AI and Video Save in parallel
        const [blueprint, wasVideoSaved] = await Promise.all([
          this.aiProcessor.generateBlueprint(allEvents),
          videoSavedPromise,
        ]);

        const finalBlueprint = {
          ...blueprint,
          id: tempId,
          status: 'ready',
          hasVideo: wasVideoSaved,
        };
        await chrome.storage.local.set({ lastBlueprint: finalBlueprint });

        this.broadcast({
          type: 'BLUEPRINT_GENERATED',
          data: { blueprint: finalBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: 'BLUEPRINT_GENERATED',
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
          hasVideo: !skipVideo,
        } as any;
        await chrome.storage.local.set({ lastBlueprint: failedBlueprint });
        this.broadcast({
          type: 'BLUEPRINT_GENERATED',
          data: { blueprint: failedBlueprint },
        });
        await this.notifyTab(tab?.id, {
          type: 'BLUEPRINT_GENERATED',
          data: { blueprint: failedBlueprint },
        });
      }
    } else {
      console.warn('[Background] No events captured, clearing lastBlueprint');
      await chrome.storage.local.remove('lastBlueprint');
      this.broadcast({
        type: 'BLUEPRINT_GENERATED',
        data: { blueprint: null },
      });
      await this.notifyTab(tab?.id, {
        type: 'BLUEPRINT_GENERATED',
        data: { blueprint: null },
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'Recording Empty',
        message: 'No interactions were captured. Please try again.',
      });
    }

    // Close offscreen document after everything is done
    if (!skipVideo) {
      try {
        const existingContexts = await (chrome.runtime as any).getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
        });
        if (existingContexts.length > 0) {
          console.log('[Background] Closing offscreen document');
          await chrome.offscreen.closeDocument();
        }
      } catch (closeError) {
        console.error('[Background] Failed to close offscreen:', closeError);
      }
    }

    this.recordingEvents = [];
    await chrome.storage.session.remove('currentRecording');
    await chrome.storage.local.remove([
      'currentRecordingId',
      `no_video_${tempId}`,
    ]);
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
