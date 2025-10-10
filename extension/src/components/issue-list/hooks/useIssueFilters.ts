import { useState, useEffect } from 'react';
import { useDebounce } from '@/utils/useDebounce';
import { storageService } from '@/services/storage';
import useAuth from '@/hooks/useAuth';
import type { IssueFilterState } from '../types';

export const useIssueFilters = () => {
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [filtersReady, setFiltersReady] = useState(false);

  const debouncedSearch = useDebounce(search, 500);

  // Load saved project filters
  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setSelectedProjectIds([]);
      setFiltersReady(false);
      return;
    }

    let isActive = true;
    setFiltersReady(false);
    setSelectedProjectIds([]);

    storageService.getIssueFilters()
      .then(filters => {
        if (!isActive) return;
        const selection = filters[userId];
        const ids = Array.isArray(selection?.projectIds)
          ? selection.projectIds.map(String)
          : [];

        setSelectedProjectIds(ids);
      })
      .catch(() => {
        // Ignore errors
      })
      .finally(() => {
        if (isActive) {
          setFiltersReady(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  // Save project filters when they change
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    if (selectedProjectIds.length > 0) {
      storageService.updateIssueFilter(userId, {
        projectIds: selectedProjectIds,
        updatedAt: Date.now(),
      }).catch(() => {
        // Ignore save errors
      });
    } else {
      storageService.updateIssueFilter(userId, null).catch(() => {
        // Ignore save errors
      });
    }
  }, [selectedProjectIds, user?.id]);

  const filters: IssueFilterState = {
    search: debouncedSearch,
    selectedProjectIds,
    selectedAssigneeIds,
    selectedLabels,
    selectedStatuses,
    sort,
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev => {
      const next = prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id];

      // Clear labels when no projects selected
      if (next.length === 0) {
        setSelectedLabels([]);
      }

      return next;
    });
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssigneeIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleLabel = (name: string) => {
    setSelectedLabels(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedProjectIds([]);
    setSelectedAssigneeIds([]);
    setSelectedLabels([]);
    setSelectedStatuses([]);
    setSort('newest');
  };

  return {
    filters,
    search,
    setSearch,
    sort,
    setSort,
    toggleProject,
    toggleAssignee,
    toggleLabel,
    toggleStatus,
    resetFilters,
    filtersReady,
  };
};
