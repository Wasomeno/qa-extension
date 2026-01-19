import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { pinnedIssuesService } from '@/services/pinned-issues';
import { getIssues, Issue } from '@/api/issue';
import { PinnedIssueMeta } from '@/types/issues';

export type PinnedIssue = Issue & { pinnedMeta: PinnedIssueMeta };

export const usePinnedIssues = () => {
  const [pinnedMap, setPinnedMap] = useState<Record<string, PinnedIssueMeta>>(
    {}
  );
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  useEffect(() => {
    // Initial load
    pinnedIssuesService.getAll().then(data => {
      setPinnedMap(data);
      setIsStorageLoaded(true);
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes['pinned_issues']) {
        setPinnedMap(changes['pinned_issues'].newValue || {});
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const pinnedEntries = Object.entries(pinnedMap);

  // Fetch all pinned issues in one batch
  const allIids = pinnedEntries
    .map(([key]) => {
      const parts = key.split('-');
      // Format: "projectId-iid" or legacy "iid"
      return parts.length === 2 ? parts[1] : parts[0];
    })
    .join(',');

  const { data: fetchedIssues, isLoading: isFetching } = useQuery({
    queryKey: ['pinned-issues-batch', allIids],
    queryFn: () => getIssues({ issue_ids: allIids }),
    enabled: isStorageLoaded && allIids.length > 0,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const isLoading = !isStorageLoaded || (allIids.length > 0 && isFetching);

  const pinnedIssues: PinnedIssue[] = (fetchedIssues?.data || [])
    .map(issue => ({
      ...issue,
      pinnedMeta: pinnedMap[`${issue.project_id}-${issue.iid}`],
    }))
    .filter(issue => !!issue.pinnedMeta) // Filter out issues that might have matched ID but wrong project (if any) or aren't in map
    .sort((a, b) => {
      return (
        new Date(b.pinnedMeta.pinnedAt).getTime() -
        new Date(a.pinnedMeta.pinnedAt).getTime()
      );
    });

  const togglePin = async (issue: Issue) => {
    const key = `${issue.project_id}-${issue.iid}`;
    if (pinnedMap[key]) {
      await pinnedIssuesService.remove(issue.iid, issue.project_id);
    } else {
      await pinnedIssuesService.add(issue.iid, issue.project_id);
    }
  };

  const updatePinMeta = async (
    issueIid: number,
    projectId: number,
    meta: Partial<PinnedIssueMeta>
  ) => {
    await pinnedIssuesService.update(issueIid, projectId, meta);
  };

  const isPinned = (issueIid: number, projectId: number) =>
    !!pinnedMap[`${projectId}-${issueIid}`];

  return {
    pinnedIssues,
    isLoading,
    togglePin,
    updatePinMeta,
    isPinned,
  };
};
