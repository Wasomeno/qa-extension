import { MessageType } from '@/types/messages';

export type StartOAuthResult = { success: true; authUrl: string; sessionId: string } | { success: false; error: string };

/**
 * Minimal auth helper focused on OAuth start and logout via background.
 * Keeps logic simple: background owns the flow; UI asks it to start and opens the URL.
 */
export const authService = {
  async startGitLabOAuth(): Promise<StartOAuthResult> {
    return new Promise<StartOAuthResult>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: MessageType.AUTH_START }, (reply) => {
          const err = chrome.runtime.lastError;
          if (err) return resolve({ success: false, error: String(err.message || err) });
          const r = (reply || {}) as any;
          if (r && r.success && r.data?.authUrl) {
            resolve({ success: true, authUrl: r.data.authUrl, sessionId: r.data.sessionId });
          } else {
            resolve({ success: false, error: r?.error || 'Failed to start sign-in' });
          }
        });
      } catch (e: any) {
        resolve({ success: false, error: e?.message || 'Background not reachable' });
      }
    });
  },
};

export default authService;

