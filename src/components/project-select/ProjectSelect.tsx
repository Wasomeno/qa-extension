import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useGetProjects } from '@/hooks/use-get-projects';
import { useDebounce } from '@/utils/useDebounce';
import { GitLabProject } from '@/types/project';
import { formatProjectName } from '@/utils/project-formatter';
import { getProjectById } from '@/api/project';

export interface ProjectSelectProps {
  /** Current selected ID(s). Use `null` for "Unassigned", `[]` for nothing selected (or "All" in multi). */
  value: number | string | (number | string)[] | null;
  /** Called with the full project object when selected. Called with `null` for "Unassigned". */
  onSelect: (project: GitLabProject | null) => void;
  /**
   * Multi-select mode: called with the full array of currently selected project objects
   * whenever the selection changes. Allows callers to compute diffs easily.
   */
  onSelectMultiple?: (projects: GitLabProject[]) => void;
  /** Single or multi-select mode. Default: 'single' */
  mode?: 'single' | 'multi';
  /** Compact badge style (e.g. recording item). Default: 'default' */
  size?: 'default' | 'compact';
  /** Portal container for the dropdown (for Shadow DOM). */
  portalContainer?: HTMLElement | null;
  /** Extra options to add to the list. */
  extraOptions?: {
    /** Adds an "Unassigned" option at the top. When selected, calls onSelect(null). */
    unassigned?: boolean;
    /** Adds an "All Projects" option that deselects everything. */
    allProjects?: boolean;
  };
  /** Extra CSS classes for the trigger button. */
  className?: string;
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Whether to stop click propagation on the trigger. Useful inside clickable list items. */
  stopPropagation?: boolean;
  /**
   * Project name to display when the project isn't loaded in the projects list.
   * Use this when you have a project_id and project_name but not the full project object.
   */
  projectName?: string;
}

const isMultiValue = (v: unknown): v is (number | string)[] =>
  Array.isArray(v);

export const ProjectSelect: React.FC<ProjectSelectProps> = ({
  value,
  onSelect,
  onSelectMultiple,
  mode = 'single',
  size = 'default',
  portalContainer,
  extraOptions,
  className,
  placeholder = 'Select a project...',
  stopPropagation,
  projectName,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const // Track previous selection to compute diff for onSelectMultiple
  prevSelectedProjectsRef = useRef<GitLabProject[]>([]);
  const debouncedSearch = useDebounce(searchQuery, 500);

  // State for the fetched project when it's not in the loaded list
  const [fetchedSelectedProject, setFetchedSelectedProject] = useState<GitLabProject | null>(null);
  const [isFetchingSelected, setIsFetchingSelected] = useState(false);

  const { data: projects = [], isFetching } = useGetProjects({
    search: debouncedSearch,
  });

  // Compute selected IDs for multi mode
  const selectedIds = useMemo((): (number | string)[] => {
    if (mode === 'single') {
      if (value === null || value === undefined) return [];
      // Handle GitLabProject object or numeric/string ID
      if (typeof value === 'object' && 'id' in value) {
        return [String((value as GitLabProject).id)];
      }
      return [value as number | string];
    }
    if (isMultiValue(value)) return value;
    return [];
  }, [value, mode]);

  // Fetch selected project by ID if not in the loaded list
  useEffect(() => {
    if (mode !== 'single' || selectedIds.length === 0) {
      setFetchedSelectedProject(null);
      return;
    }

    const selectedId = String(selectedIds[0]);
    if (!/^\d+$/.test(selectedId)) {
      setFetchedSelectedProject(null);
      return;
    }

    // Check if project is already in the loaded list
    const foundInList = projects.find(p => p.id.toString() === selectedId);
    if (foundInList) {
      setFetchedSelectedProject(null);
      return;
    }

    // Check if we already fetched this project
    if (fetchedSelectedProject?.id.toString() === selectedId) {
      return;
    }

    // Fetch the project by ID
    let cancelled = false;
    setIsFetchingSelected(true);
    getProjectById(selectedId)
      .then(response => {
        if (!cancelled && response.data?.project) {
          setFetchedSelectedProject(response.data.project);
        }
      })
      .catch(error => {
        console.error('Failed to fetch project by ID:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetchingSelected(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedIds, projects, fetchedSelectedProject?.id]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [projects, searchQuery]);

  // Find selected project(s) for display (single mode)
  const selectedProject = useMemo((): GitLabProject | null => {
    if (mode !== 'single' || selectedIds.length === 0) return null;
    
    // If projects are loaded, find the matching project
    if (projects.length > 0) {
      const found = projects.find(p => p.id.toString() === String(selectedIds[0]));
      if (found) return found;
    }
    
    // Check if we fetched the project by ID
    if (fetchedSelectedProject && fetchedSelectedProject.id.toString() === String(selectedIds[0])) {
      return fetchedSelectedProject;
    }
    
    return null;
  }, [mode, selectedIds, projects, fetchedSelectedProject]);

  // For external display: allow a displayName prop to be passed when selectedProject
  // couldn't be resolved from the projects list. This handles persisted selections.
  // The displayName can be passed as part of the value object when value is an object.
  const valueAsObject = useMemo((): { id?: number | string; name?: string } | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as { id?: number | string; name?: string };
    }
    return null;
  }, [value]);

  // Build the list with extra options
  const flatList = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      project: GitLabProject | null;
    }> = [];

    if (extraOptions?.unassigned) {
      list.push({ id: '__unassigned__', label: 'Unassigned', project: null });
    }

    if (extraOptions?.allProjects) {
      list.push({ id: '__all__', label: 'All Projects', project: null });
    }

    projects.forEach(p => {
      list.push({
        id: p.id.toString(),
        label: formatProjectName(p),
        project: p,
      });
    });

    return list;
  }, [projects, extraOptions]);

  // Whether an item is selected
  const isItemSelected = (id: string) => selectedIds.includes(id);

  // Trigger click propagation control
  const handleTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  const handleTriggerPointerDown = (e: React.PointerEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatList[highlightedIndex];
      if (item) selectItem(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectItem = (item: (typeof flatList)[number]) => {
    if (item.id === '__unassigned__') {
      onSelect(null);
    } else if (item.id === '__all__') {
      prevSelectedProjectsRef.current = [];
      onSelectMultiple?.([]);
      if (mode === 'single') onSelect(null);
    } else if (item.project) {
      if (mode === 'single') {
        onSelect(item.project);
      } else {
        // Multi-select toggle — compute new full array
        const current = (selectedIds as string[]).filter(
          id => id !== '__unassigned__' && id !== '__all__'
        );
        const alreadySelected = current.includes(item.id);
        const currentProjects = projects.filter(p =>
          current.includes(p.id.toString())
        );
        const newProjects = alreadySelected
          ? currentProjects.filter(p => p.id.toString() !== item.id)
          : [...currentProjects, item.project];
        prevSelectedProjectsRef.current = newProjects;
        onSelectMultiple?.(newProjects);
      }
    }

    if (mode === 'single') {
      setOpen(false);
    }
    setSearchQuery('');
  };

  // Compute trigger label
  const triggerLabel = useMemo(() => {
    if (isFetching && selectedIds.length === 0) {
      return size === 'compact' ? null : 'Loading...';
    }

    // Show loading while fetching the selected project by ID
    if (isFetchingSelected && selectedIds.length > 0 && !selectedProject) {
      return size === 'compact' ? null : 'Loading...';
    }

    // Selected ID exists but project not yet found in internal list (still fetching)
    if (isFetching && selectedIds.length > 0 && !selectedProject) {
      return size === 'compact' ? null : 'Loading...';
    }

    if (mode === 'single') {
      // Handle "All Projects" case - when value is null but allProjects option exists
      if (selectedIds.length === 0 && extraOptions?.allProjects) {
        return 'All Projects';
      }
      if (selectedProject) return formatProjectName(selectedProject);
      
      // Fallback: if we have a selection but couldn't find the project in the loaded list,
      // check if value itself has name/path_with_namespace property (passed directly as an object)
      const valueAsObj = value as unknown as { id?: number | string; name?: string; path_with_namespace?: string } | null;
      if (valueAsObj && typeof valueAsObj === 'object' && 'name' in valueAsObj && valueAsObj.name) {
        // Format using formatProjectName to show "GROUP / ProjectName"
        return formatProjectName(valueAsObj);
      }
      
      // Use projectName prop if provided (for cases where we have id + name but not full project)
      if (projectName && selectedIds.length > 0) {
        return projectName;
      }
      
      return placeholder;
    }

    if (mode === 'multi') {
      const realCount = selectedIds.filter(
        id => id !== '__unassigned__' && id !== '__all__'
      ).length;
      if (realCount === 0) {
        if (extraOptions?.allProjects) return 'All Projects';
        return placeholder;
      }
      return `${realCount} project${realCount === 1 ? '' : 's'} selected`;
    }

    return placeholder;
  }, [
    value,
    selectedIds,
    selectedProject,
    isFetching,
    isFetchingSelected,
    mode,
    size,
    extraOptions,
    placeholder,
    projectName,
  ]);

  // Open popover focus management
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        asChild
        onClick={handleTriggerClick}
        onPointerDown={handleTriggerPointerDown}
      >
        {size === 'compact' ? (
          <button
            type="button"
            className={cn(
              'h-6 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors flex items-center gap-1',
              (isFetching || isFetchingSelected) && 'opacity-60',
              className
            )}
          >
            {(isFetching || isFetchingSelected) ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <span className="truncate max-w-[120px]">{triggerLabel}</span>
                <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-60" />
              </>
            )}
          </button>
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isFetching || isFetchingSelected}
            className={cn(
              'w-full justify-between text-left font-normal bg-white border-theme-border rounded-xl',
              'focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 hover:text-gray-900 transition-all',
              (isFetching || isFetchingSelected) && 'opacity-60',
              className
            )}
          >
            <span
              className={cn(
                'truncate',
                triggerLabel && triggerLabel !== placeholder
                  ? 'text-gray-900'
                  : 'text-gray-500'
              )}
            >
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        className={cn('p-0', size === 'compact' ? 'w-[200px]' : 'w-[300px]')}
        align="start"
        container={portalContainer}
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            placeholder={size === 'compact' ? 'Search...' : 'Search projects...'}
            value={searchQuery}
            onValueChange={setSearchQuery}
            onKeyDown={handleKeyDown}
          />
          <CommandList className="max-h-[300px]">
            {isFetching ? (
              <div className="p-2 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                    <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                    <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
            <>
            <CommandEmpty>
              No project found.
            </CommandEmpty>
            <CommandGroup>
              {flatList.map((item, index) => {
                const isSelected = isItemSelected(item.id);
                const isHighlighted = index === highlightedIndex;

                return (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    onSelect={() => selectItem(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-2 w-full pr-2',
                        isHighlighted && 'bg-accent'
                      )}
                    >
                      {item.id === '__all__' || item.id === '__unassigned__' ? (
                        <>
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4 shrink-0',
                              isSelected ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span
                            className={cn(
                              'truncate',
                              isSelected ? 'text-blue-700 font-medium' : ''
                            )}
                          >
                            {item.label}
                          </span>
                        </>
                      ) : item.project ? (
                        <>
                          {item.project.avatar_url && (
                            <img
                              src={item.project.avatar_url}
                              alt=""
                              className="h-4 w-4 rounded-full border border-gray-200 shrink-0"
                            />
                          )}
                          <Check
                            className={cn(
                              'h-4 w-4 shrink-0',
                              isSelected ? 'opacity-100 text-blue-600' : 'opacity-0'
                            )}
                          />
                          <span
                            className={cn(
                              'truncate flex-1',
                              isSelected ? 'text-blue-700 font-medium' : ''
                            )}
                          >
                            {item.label}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
