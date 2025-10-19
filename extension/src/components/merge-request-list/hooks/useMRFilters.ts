import { useState, useCallback, useEffect } from 'react';
import { storageService } from '@/services/storage';
import type { MRFilters } from '../types';

const STORAGE_KEY = 'mrListFilters';

export const useMRFilters = () => {
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MRFilters>({
    search: '',
    projectIds: [],
    state: 'opened',
  });

  // Load persisted filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const stored = await storageService.get(STORAGE_KEY as any);
        if (stored) {
          const parsed = stored as Partial<MRFilters>;
          setFilters({
            search: parsed.search || '',
            projectIds: parsed.projectIds || [],
            state: parsed.state || 'opened',
          });
          setSearch(parsed.search || '');
        }
      } catch (e) {
        console.warn('Failed to load MR filters from storage:', e);
      } finally {
        setFiltersReady(true);
      }
    };

    loadFilters();
  }, []);

  // Persist filters when they change
  useEffect(() => {
    if (!filtersReady) return;

    const persistFilters = async () => {
      try {
        await storageService.set(STORAGE_KEY as any, filters);
      } catch (e) {
        console.warn('Failed to persist MR filters:', e);
      }
    };

    persistFilters();
  }, [filters, filtersReady]);

  // Debounced search update
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search }));
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const toggleProject = useCallback((projectId: string) => {
    setFilters(prev => {
      const exists = prev.projectIds.includes(projectId);
      return {
        ...prev,
        projectIds: exists
          ? prev.projectIds.filter(id => id !== projectId)
          : [...prev.projectIds, projectId],
      };
    });
  }, []);

  const toggleState = useCallback((state: 'opened' | 'closed' | 'merged' | 'all') => {
    setFilters(prev => ({ ...prev, state }));
  }, []);

  return {
    filters,
    search,
    setSearch,
    toggleProject,
    toggleState,
    filtersReady,
  };
};
