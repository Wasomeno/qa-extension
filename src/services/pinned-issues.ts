import { storageService } from './storage';
import { PinnedIssueMeta } from '@/types/issues';

const PINNED_ISSUES_KEY = 'pinned_issues';

export const pinnedIssuesService = {
  getAll: async (): Promise<Record<string, PinnedIssueMeta>> => {
    return (await storageService.get(PINNED_ISSUES_KEY)) || {};
  },

  add: async (
    issueIid: number,
    projectId: number,
    meta?: Partial<PinnedIssueMeta>
  ) => {
    const current = await pinnedIssuesService.getAll();
    const key = `${projectId}-${issueIid}`;
    const newMeta: PinnedIssueMeta = {
      pinnedAt: new Date().toISOString(),
      pinColor: 'default',
      projectId,
      ...meta,
    };
    await storageService.set(PINNED_ISSUES_KEY, {
      ...current,
      [key]: newMeta,
    });
  },

  remove: async (issueIid: number, projectId: number) => {
    const current = await pinnedIssuesService.getAll();
    const key = `${projectId}-${issueIid}`;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [key]: removed, ...rest } = current;
    await storageService.set(PINNED_ISSUES_KEY, rest);
  },

  update: async (
    issueIid: number,
    projectId: number,
    meta: Partial<PinnedIssueMeta>
  ) => {
    const current = await pinnedIssuesService.getAll();
    const key = `${projectId}-${issueIid}`;
    if (!current[key]) return;

    await storageService.set(PINNED_ISSUES_KEY, {
      ...current,
      [key]: { ...current[key], ...meta },
    });
  },
};
