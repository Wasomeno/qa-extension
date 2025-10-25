/**
 * Utilities for managing Merge Request presets (last used values)
 * Stored in localStorage for quick reuse
 */

export interface MRPreset {
  projectId?: string;
  projectName?: string;
  sourceBranch?: string;
  targetBranch?: string;
  assigneeIds?: number[];
  reviewerIds?: number[];
  removeSourceBranch?: boolean;
  squash?: boolean;
  slackChannelId?: string;
  slackUserIds?: string[];
  timestamp?: number; // When this preset was saved
}

const STORAGE_KEY = 'qa_extension_mr_presets';
const PRESET_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get last used MR preset for a specific project
 */
export function getLastUsedPreset(projectId?: string): MRPreset | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const presets: Record<string, MRPreset> = JSON.parse(stored);

    if (!projectId) {
      // No project specified, return the most recent preset
      const allPresets = Object.values(presets);
      if (allPresets.length === 0) return null;

      const mostRecent = allPresets.reduce((latest, current) => {
        return (current.timestamp || 0) > (latest.timestamp || 0)
          ? current
          : latest;
      });

      return mostRecent;
    }

    const preset = presets[projectId];
    if (!preset) return null;

    // Check if preset is expired
    const age = Date.now() - (preset.timestamp || 0);
    if (age > PRESET_TTL) {
      // Clean up expired preset
      delete presets[projectId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
      return null;
    }

    return preset;
  } catch (error) {
    console.error('Failed to load MR preset:', error);
    return null;
  }
}

/**
 * Save MR preset for a specific project
 */
export function saveLastUsedPreset(projectId: string, preset: MRPreset): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const presets: Record<string, MRPreset> = stored ? JSON.parse(stored) : {};

    presets[projectId] = {
      ...preset,
      projectId,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Failed to save MR preset:', error);
  }
}

/**
 * Clear all MR presets
 */
export function clearAllPresets(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear MR presets:', error);
  }
}

/**
 * Clear preset for a specific project
 */
export function clearPreset(projectId: string): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const presets: Record<string, MRPreset> = JSON.parse(stored);
    delete presets[projectId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Failed to clear preset:', error);
  }
}
