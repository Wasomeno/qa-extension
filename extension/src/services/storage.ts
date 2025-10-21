/**
 * Browser storage management service for Gitlab Companion
 */

import { AuthData, UserData, IssueData } from '@/types/messages';

export interface PinnedIssueRef {
  id: string;
  order: number;
}

interface AssigneeRef {
  avatarUrl: string;
  id: string;
  name: string;
  username: string;
}

interface AuthorRef {
  id: string;
  name: string;
  username: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

export interface IssueFilterSelection {
  projectIds: string[];
  updatedAt: number;
}

// Main type
export interface IssueDataRef {
  assignee: AssigneeRef;
  author: AuthorRef;
  createdAt: string; // ISO 8601 datetime string
  id: string; // note: provided as a string in the sample
  labels: string[]; // array of label IDs (strings in the sample)
  lastSyncedAt: number; // epoch ms
  number: number;
  project: ProjectRef;
  title: string;
}

export type PinnedIssueSnapshot = IssueDataRef;
export type PinnedDone = 'open' | 'done';
export type PendingActionType = 'update' | 'assign' | 'label' | 'resolve';
export interface PendingAction<T = any> {
  id: string;
  action: PendingActionType;
  payload: T;
  tries: number;
  lastTriedAt?: number;
}

export interface ExtensionSettings {
  notificationSettings: {
    desktop: boolean;
    sound: boolean;
    slack: boolean;
  };
  theme: 'light' | 'dark' | 'auto';
  shortcuts: {
    createIssue: string;
  };
  defaultProject?: string;
  apiEndpoint: string;
}

export type Session = {
  user: UserData | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

export interface StorageData {
  session?: Session;
  user?: UserData;
  auth?: AuthData;
  settings: ExtensionSettings;
  drafts: IssueData[];
  cache: {
    projects: any[];
    lastSync: number;
  };
  pendingOAuthSession?: string;
  // Pinned triage feature
  pinnedIssues?: PinnedIssueRef[];
  pinnedDoneState?: Record<string, PinnedDone>;
  pendingActions?: PendingAction[];
  pinnedRefs?: Record<
    string,
    { projectId: string | number; iid: number; webUrl?: string }
  >;
  pinnedSnapshots?: Record<string, PinnedIssueSnapshot>;
  // Recording index removed
  issueFilters?: Record<string, IssueFilterSelection>;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  notificationSettings: {
    desktop: true,
    sound: true,
    slack: false,
  },
  theme: 'auto',
  shortcuts: {
    createIssue: 'Ctrl+Shift+I',
  },
  apiEndpoint: process.env.BASE_API_URL,
};

function isPromiseLike<T>(value: any): value is PromiseLike<T> {
  return (
    !!value && typeof value === 'object' && typeof value.then === 'function'
  );
}

async function storageGet(
  keys?: string | string[] | object | null
): Promise<Record<string, any>> {
  try {
    const result = chrome.storage.local.get(keys as any);
    if (isPromiseLike(result)) {
      return (await result) as Record<string, any>;
    }
    return await new Promise<Record<string, any>>((resolve, reject) => {
      try {
        chrome.storage.local.get(keys as any, items => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
            return;
          }
          resolve(items || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    throw error;
  }
}

async function storageSet(items: Record<string, any>): Promise<void> {
  try {
    const result = chrome.storage.local.set(items);
    if (isPromiseLike(result)) {
      await result;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.set(items, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    throw error;
  }
}

async function storageRemove(keys: string | string[]): Promise<void> {
  try {
    const result = chrome.storage.local.remove(keys);
    if (isPromiseLike(result)) {
      await result;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.remove(keys, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    throw error;
  }
}

async function storageClear(): Promise<void> {
  try {
    const result = chrome.storage.local.clear();
    if (isPromiseLike(result)) {
      await result;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.clear(() => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    throw error;
  }
}

class StorageService {
  private cache = new Map<string, any>();
  private listeners = new Map<string, Set<(value: any) => void>>();
  private onChangedBound:
    | ((
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: 'sync' | 'local' | 'managed' | 'session'
      ) => void)
    | null = null;

  constructor() {
    // Ensure cross-context bridge is active even if initialize() isn't called
    this.installChangeBridge();
  }

  /**
   * Get data from storage with caching
   */
  async get<T extends keyof StorageData>(
    key: T
  ): Promise<StorageData[T] | undefined> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const result = await storageGet(key);
      const value = result[key];

      // Cache the result
      if (value !== undefined) {
        this.cache.set(key, value);
      }

      return value;
    } catch (error) {
      console.error(`Failed to get ${key} from storage:`, error);
      return undefined;
    }
  }

  /**
   * Set data in storage with caching and notifications
   */
  async set<T extends keyof StorageData>(
    key: T,
    value: StorageData[T]
  ): Promise<void> {
    try {
      await storageSet({ [key]: value });

      // Update cache
      this.cache.set(key, value);

      // Notify listeners
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.forEach(listener => listener(value));
      }
    } catch (error) {
      console.error(`Failed to set ${key} in storage:`, error);
      throw error;
    }
  }

  /**
   * Remove data from storage
   */
  async remove<T extends keyof StorageData>(key: T): Promise<void> {
    try {
      await storageRemove(key as string);
      this.cache.delete(key);

      // Notify listeners
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.forEach(listener => listener(undefined));
      }
    } catch (error) {
      console.error(`Failed to remove ${key} from storage:`, error);
      throw error;
    }
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    try {
      await storageClear();
      this.cache.clear();

      // Notify all listeners
      this.listeners.forEach((listeners, key) => {
        listeners.forEach(listener => listener(undefined));
      });
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }

  /**
   * Get all storage data
   */
  async getAll(): Promise<Partial<StorageData>> {
    try {
      const result = await storageGet(null);

      // Update cache
      Object.entries(result).forEach(([key, value]) => {
        this.cache.set(key, value);
      });

      return result as Partial<StorageData>;
    } catch (error) {
      console.error('Failed to get all storage data:', error);
      return {};
    }
  }

  /**
   * Initialize storage with default values
   */
  async initialize(): Promise<void> {
    try {
      const existing = await this.getAll();

      // Set defaults for missing values
      if (!existing.settings) {
        await this.set('settings', DEFAULT_SETTINGS);
      } else {
        // Merge with defaults to ensure all properties exist
        const mergedSettings = { ...DEFAULT_SETTINGS, ...existing.settings };
        await this.set('settings', mergedSettings);
      }

      if (!existing.drafts) {
        await this.set('drafts', []);
      }

      if (!existing.cache) {
        await this.set('cache', { projects: [], lastSync: 0 });
      }

      // Seed pinned triage defaults
      if (!existing.pinnedIssues) {
        await this.set('pinnedIssues', [] as PinnedIssueRef[]);
      }
      if (!existing.pinnedDoneState) {
        await this.set('pinnedDoneState', {} as Record<string, PinnedDone>);
      }
      if (!existing.pendingActions) {
        await this.set('pendingActions', [] as PendingAction[]);
      }
      // Migrate deprecated pinnedMeta → pinnedRefs if present
      if ((existing as any).pinnedMeta && !(existing as any).pinnedRefs) {
        const old = (existing as any).pinnedMeta as Record<
          string,
          {
            source?: string;
            projectId?: string | number;
            iid?: number;
            webUrl?: string;
          }
        >;
        const migrated: Record<
          string,
          { projectId: string | number; iid: number; webUrl?: string }
        > = {};
        Object.entries(old || {}).forEach(([k, v]) => {
          if (v && v.projectId != null && typeof v.iid === 'number') {
            migrated[k] = {
              projectId: v.projectId,
              iid: v.iid,
              webUrl: v.webUrl,
            };
          }
        });
        await this.set('pinnedRefs', migrated);
        await this.remove('pinnedMeta' as any);
      }
      if (!existing.pinnedRefs) {
        await this.set('pinnedRefs', {} as Record<string, any>);
      }
      if (!existing.pinnedSnapshots) {
        await this.set('pinnedSnapshots', {} as Record<string, any>);
      }

      if (!existing.issueFilters) {
        await this.set(
          'issueFilters',
          {} as Record<string, IssueFilterSelection>
        );
      }

      // Session migration: if session missing but legacy auth/user exist, synthesize session
      if (!existing.session) {
        const auth = existing.auth as AuthData | undefined;
        const user = existing.user as UserData | undefined;
        if (auth?.jwtToken || auth?.refreshToken || user) {
          const session: Session = {
            user: user || null,
            accessToken: auth?.jwtToken || null,
            refreshToken: auth?.refreshToken || null,
            expiresAt: auth?.expiresAt || null,
          };
          await this.set('session', session);
        }
      }

      // Install cross-context change bridge once
      this.installChangeBridge();
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * Cross-context change bridge using chrome.storage.onChanged
   * Ensures that updates from any context notify local listeners and cache.
   */
  private installChangeBridge() {
    if (this.onChangedBound) return;
    this.onChangedBound = (changes, areaName) => {
      if (areaName !== 'local') return;
      for (const [key, change] of Object.entries(changes)) {
        const newValue = (change as chrome.storage.StorageChange).newValue;
        const oldValue = this.cache.get(key);
        // Update cache only if different to avoid redundant notifications
        const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);
        if (changed) {
          this.cache.set(key, newValue);
          const listeners = this.listeners.get(key);
          if (listeners) {
            listeners.forEach(listener => {
              try {
                listener(newValue);
              } catch {}
            });
          }
        }
      }
    };
    try {
      chrome.storage.onChanged.addListener(this.onChangedBound!);
    } catch (e) {
      console.warn('Failed to install storage change bridge:', e);
    }
  }

  /**
   * Listen for changes to specific storage keys
   */
  onChanged<T extends keyof StorageData>(
    key: T,
    callback: (value: StorageData[T] | undefined) => void
  ): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const listeners = this.listeners.get(key)!;
    listeners.add(callback);

    // Return unsubscribe function
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Get user authentication data
   */
  async getAuth(): Promise<AuthData | undefined> {
    return this.get('auth');
  }

  /**
   * Set user authentication data
   */
  async setAuth(auth: AuthData): Promise<void> {
    return this.set('auth', auth);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // Prefer session model if present
      const session = await this.getSession();
      const auth = session ? undefined : await this.getAuth();
      const token = session?.accessToken || auth?.jwtToken;
      const expiresAt = session?.expiresAt || auth?.expiresAt;
      if (!token) return false;
      if (expiresAt && Date.now() > expiresAt) return false;
      return true;
    } catch (error) {
      console.error('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Get user data
   */
  async getUser(): Promise<UserData | undefined> {
    return this.get('user');
  }

  /**
   * Set user data
   */
  async setUser(user: UserData): Promise<void> {
    return this.set('user', user);
  }

  // -------- Session helpers --------

  async getSession(): Promise<Session | undefined> {
    return this.get('session');
  }

  async setSession(session: Session): Promise<void> {
    await this.set('session', session);
    // Also backfill legacy keys for compatibility
    const auth: AuthData = {
      jwtToken: session.accessToken || undefined,
      refreshToken: session.refreshToken || undefined,
      expiresAt: session.expiresAt || undefined,
    };
    if (session.user) await this.set('user', session.user);
    await this.set('auth', auth);
  }

  /**
   * Get extension settings
   */
  async getSettings(): Promise<ExtensionSettings> {
    const settings = await this.get('settings');
    return settings || DEFAULT_SETTINGS;
  }

  /**
   * Update extension settings
   */
  async updateSettings(updates: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    return this.set('settings', updated);
  }

  /**
   * Get draft issues
   */
  async getDrafts(): Promise<IssueData[]> {
    const drafts = await this.get('drafts');
    return drafts || [];
  }

  /**
   * Add a draft issue
   */
  async addDraft(draft: IssueData): Promise<void> {
    const drafts = await this.getDrafts();
    drafts.push(draft);
    return this.set('drafts', drafts);
  }

  /**
   * Update a draft issue
   */
  async updateDraft(index: number, updates: Partial<IssueData>): Promise<void> {
    const drafts = await this.getDrafts();
    if (index >= 0 && index < drafts.length) {
      drafts[index] = { ...drafts[index], ...updates };
      return this.set('drafts', drafts);
    }
  }

  /**
   * Delete a draft issue
   */
  async deleteDraft(index: number): Promise<void> {
    const drafts = await this.getDrafts();
    if (index >= 0 && index < drafts.length) {
      drafts.splice(index, 1);
      return this.set('drafts', drafts);
    }
  }

  /**
   * Get cached data
   */
  async getCache(): Promise<StorageData['cache']> {
    const cache = await this.get('cache');
    return cache || { projects: [], lastSync: 0 };
  }

  /**
   * Update cache
   */
  async updateCache(updates: Partial<StorageData['cache']>): Promise<void> {
    const current = await this.getCache();
    const updated = { ...current, ...updates };
    return this.set('cache', updated);
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    used: number;
    quota: number;
    percentage: number;
  }> {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES;

      return {
        used: usage,
        quota: quota,
        percentage: (usage / quota) * 100,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { used: 0, quota: 0, percentage: 0 };
    }
  }

  /**
   * Export all data for backup
   */
  async exportData(): Promise<string> {
    const data = await this.getAll();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from backup
   */
  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      // Validate data structure
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid data format');
      }

      // Clear existing data
      await this.clear();

      // Import new data
      for (const [key, value] of Object.entries(data)) {
        await chrome.storage.local.set({ [key]: value });
      }

      // Reinitialize cache
      this.cache.clear();
      await this.getAll();
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  // ---------- Pinned triage helpers ----------

  async getIssueFilters(): Promise<Record<string, IssueFilterSelection>> {
    return (await this.get('issueFilters')) || {};
  }

  async setIssueFilters(
    filters: Record<string, IssueFilterSelection>
  ): Promise<void> {
    await this.set('issueFilters', filters);
  }

  async updateIssueFilter(
    userId: string,
    selection: IssueFilterSelection | null
  ): Promise<void> {
    const filters = await this.getIssueFilters();
    if (selection) {
      filters[userId] = selection;
    } else {
      delete filters[userId];
    }
    await this.setIssueFilters(filters);
  }

  // ---------- Pinned triage helpers ----------

  async getPinnedIssues(): Promise<PinnedIssueRef[]> {
    return (await this.get('pinnedIssues')) || [];
  }

  async setPinnedIssues(items: PinnedIssueRef[]): Promise<void> {
    // Normalize order to 0..n
    const sorted = [...items]
      .sort((a, b) => a.order - b.order)
      .map((p, idx) => ({ id: p.id, order: idx }));
    await this.set('pinnedIssues', sorted);
  }

  async pinIssue(id: string): Promise<PinnedIssueRef[]> {
    const current = await this.getPinnedIssues();
    if (current.find(p => p.id === id)) return current;
    if (current.length >= 5) return current;
    const nextOrder =
      current.length > 0 ? Math.max(...current.map(p => p.order)) + 1 : 0;
    const updated = [...current, { id, order: nextOrder }];
    await this.setPinnedIssues(updated);
    return updated;
  }

  async unpinIssue(id: string): Promise<PinnedIssueRef[]> {
    const current = await this.getPinnedIssues();
    const updated = current.filter(p => p.id !== id);
    await this.setPinnedIssues(updated);
    return updated;
  }

  async reorderPinnedIssues(idsInOrder: string[]): Promise<PinnedIssueRef[]> {
    const updated = idsInOrder.map((id, idx) => ({ id, order: idx }));
    await this.setPinnedIssues(updated);
    return updated;
  }

  async getPinnedDoneState(): Promise<Record<string, PinnedDone>> {
    return (await this.get('pinnedDoneState')) || {};
  }

  async setPinnedDoneState(state: Record<string, PinnedDone>): Promise<void> {
    await this.set('pinnedDoneState', state);
  }

  async enqueuePendingAction<T = any>(action: PendingAction<T>): Promise<void> {
    const existing = ((await this.get('pendingActions')) ||
      []) as PendingAction[];
    existing.push(action);
    await this.set('pendingActions', existing);
  }

  async dequeuePendingActions(
    predicate: (a: PendingAction) => boolean
  ): Promise<void> {
    const existing = ((await this.get('pendingActions')) ||
      []) as PendingAction[];
    const remaining = existing.filter(a => !predicate(a));
    await this.set('pendingActions', remaining);
  }

  async getPinnedRefs(): Promise<
    Record<string, { projectId: string | number; iid: number; webUrl?: string }>
  > {
    return (await this.get('pinnedRefs')) || {};
  }

  async setPinnedRefs(
    refs: Record<
      string,
      { projectId: string | number; iid: number; webUrl?: string }
    >
  ): Promise<void> {
    await this.set('pinnedRefs', refs);
  }

  async updatePinnedRef(
    id: string,
    updates: Partial<{
      projectId: string | number;
      iid: number;
      webUrl?: string;
    }>
  ): Promise<void> {
    const current = await this.getPinnedRefs();
    current[id] = { ...(current[id] || {}), ...updates } as any;
    await this.setPinnedRefs(current);
  }

  async getPinnedSnapshots(): Promise<Record<string, PinnedIssueSnapshot>> {
    return (await this.get('pinnedSnapshots')) || {};
  }

  async getParsedPinnedSnapshots(): Promise<PinnedIssueSnapshot[]> {
    const snapshots = await this.get('pinnedSnapshots');
    if (!snapshots) return [];
    const parsedSnapshot = Object.keys(snapshots).map(key => snapshots[key]);
    return parsedSnapshot || [];
  }

  async setPinnedSnapshots(
    snapshots: Record<string, PinnedIssueSnapshot>
  ): Promise<void> {
    await this.set('pinnedSnapshots', snapshots);
  }

  async upsertPinnedSnapshot(
    id: string,
    updates: Partial<PinnedIssueSnapshot>
  ): Promise<void> {
    const current = (await this.getPinnedSnapshots()) || {};
    const prev = current[id] || { id, lastSyncedAt: 0 };
    const merged: PinnedIssueSnapshot = {
      ...prev,
      ...updates,
      id,
      lastSyncedAt: updates.lastSyncedAt ?? Date.now(),
    } as PinnedIssueSnapshot;
    current[id] = merged;
    await this.setPinnedSnapshots(current);
  }

  async deletePinnedSnapshot(id: string): Promise<void> {
    const current = (await this.getPinnedSnapshots()) || {};
    if (current[id]) {
      delete current[id];
      await this.setPinnedSnapshots(current);
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;
