import { useState, useEffect } from 'react';
import { storageService } from '@/services/storage';

export const useIssuePinning = () => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedCount, setPinnedCount] = useState(0);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      const list = await storageService.getPinnedIssues();
      const ids = new Set(list.map(p => p.id));
      setPinnedIds(ids);
      setPinnedCount(ids.size);

      unsub = storageService.onChanged('pinnedIssues', v => {
        const arr = (v as any[]) || [];
        const s = new Set(arr.map((p: any) => p.id));
        setPinnedIds(s);
        setPinnedCount(s.size);
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const togglePin = async (id: string, item: any) => {
    if (pinnedIds.has(id)) {
      await storageService.unpinIssue(id);
      return;
    }

    if (pinnedCount >= 5) {
      return; // Max 5 pinned items
    }

    await storageService.pinIssue(id);

    // Persist GitLab reference for detail fetching
    const projectId = item?.project?.id;
    const iid = (item?.number ??
      (item as any)?.iid ??
      (item as any)?.gitlabIssueIid) as number | undefined;
    const webUrl = (item as any)?.webUrl || (item as any)?.web_url;

    if (projectId && typeof iid === 'number') {
      await storageService.updatePinnedRef(id, { projectId, iid, webUrl });
    }

    try {
      await storageService.upsertPinnedSnapshot(
        id,
        Object.assign({}, item as any, { lastSyncedAt: Date.now() }) as any
      );
    } catch {
      // Ignore snapshot errors
    }
  };

  return {
    pinnedIds,
    pinnedCount,
    togglePin,
  };
};