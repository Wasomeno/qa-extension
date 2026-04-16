import { useState, useMemo, useCallback, useEffect } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortField<T> = keyof T | string;

export interface SortConfig<T> {
  field: SortField<T>;
  direction: SortDirection;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface DataTableOptions<T> {
  initialSort?: SortConfig<T>;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  searchFields?: string[];
}

export interface UseDataTableReturn<T> {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  debouncedSearchQuery: string;

  filterValue: string;
  setFilterValue: (value: string) => void;
  filterOptions: FilterOption[];
  setFilterOptions: (options: FilterOption[]) => void;

  sortConfig: SortConfig<T>;
  setSortConfig: (config: SortConfig<T>) => void;
  handleSort: (field: SortField<T>) => void;
  toggleSortDirection: () => void;

  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;

  filteredData: T[];
  paginatedData: T[];
  totalItems: number;

  resetFilters: () => void;
}

// Helper function to get searchable text from an item
function getSearchableText(item: Record<string, any>, searchFields?: string[]): string {
  if (searchFields && searchFields.length > 0) {
    return searchFields
      .map(field => {
        const value = item[field];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        return JSON.stringify(value);
      })
      .join(' ');
  }
  
  // Default: search through string fields only
  return Object.entries(item)
    .filter(([_, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => {
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return value.toString();
      return '';
    })
    .join(' ');
}

export function useDataTable<T extends Record<string, any>>(
  data: T[],
  options: DataTableOptions<T> = {}
): UseDataTableReturn<T> {
  const {
    initialSort,
    initialPageSize = 12,
    searchFields,
  } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [filterValue, setFilterValue] = useState('all');
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);

  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(
    initialSort || { field: 'created_at', direction: 'desc' }
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const handleSort = useCallback(
    (field: SortField<T>) => {
      setSortConfig(prev => {
        if (prev.field === field) {
          return {
            field,
            direction: prev.direction === 'asc' ? 'desc' : 'asc',
          };
        }
        return { field, direction: 'desc' };
      });
      setCurrentPage(1);
    },
    []
  );

  const toggleSortDirection = useCallback(() => {
    setSortConfig(prev => ({
      ...prev,
      direction: prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  }, []);

  const filteredData = useMemo(() => {
    let result = [...(data || [])];

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(item => {
        const searchableText = getSearchableText(item, searchFields);
        return searchableText.toLowerCase().includes(query);
      });
    }

    if (filterValue && filterValue !== 'all') {
      result = result.filter(item => {
        const projectValue = item.project_id ?? item.projectId;
        return projectValue?.toString() === filterValue ||
               (filterValue === 'unassigned' && !projectValue);
      });
    }

    if (sortConfig.field) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.field as keyof T];
        let bValue = b[sortConfig.field as keyof T];

        if (sortConfig.field === 'created_at' || sortConfig.field === 'createdAt') {
          const aDate = new Date(aValue as string | number).getTime();
          const bDate = new Date(bValue as string | number).getTime();
          const comparison = aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        const aStr = String(aValue ?? '');
        const bStr = String(bValue ?? '');
        const comparison = aStr.localeCompare(bStr);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, debouncedSearchQuery, filterValue, sortConfig, searchFields]);

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredData.slice(start, end);
  }, [filteredData, currentPage, pageSize]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setFilterValue('all');
    setCurrentPage(1);
    if (initialSort) {
      setSortConfig(initialSort);
    }
  }, [initialSort]);

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,

    filterValue,
    setFilterValue,
    filterOptions,
    setFilterOptions,

    sortConfig,
    setSortConfig,
    handleSort,
    toggleSortDirection,

    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize: handleSetPageSize,
    totalPages,

    filteredData,
    paginatedData,
    totalItems,

    resetFilters,
  };
}
