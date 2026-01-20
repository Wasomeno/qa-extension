import React, { useState } from 'react';
import { Check, ChevronsUpDown, Filter } from 'lucide-react';

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

export interface FilterableProject {
  id: number | string;
  name: string;
  avatar_url?: string;
  avatarUrl?: string; // Handle both cases for now
}

interface ProjectFilterProps {
  projects: FilterableProject[];
  selectedProjectIds: (number | string)[];
  onSelect: (projectId: number | string) => void;
  className?: string;
  portalContainer?: HTMLDivElement | null;
  singleSelect?: boolean;
}

export function ProjectFilter({
  projects,
  selectedProjectIds,
  onSelect,
  className,
  portalContainer,
  singleSelect,
}: ProjectFilterProps) {
  const [open, setOpen] = useState(false);

  const selectedCount = selectedProjectIds.length;
  const selectedProject = singleSelect && selectedCount > 0 
    ? projects.find(p => selectedProjectIds.includes(p.id)) 
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-[250px] justify-between', className)}
        >
          <div className="flex items-center gap-2 truncate">
            <Filter className="h-4 w-4 shrink-0 opacity-50" />
            {singleSelect && selectedProject ? (
              <span className="truncate">{selectedProject.name}</span>
            ) : selectedCount === 0 ? (
              <span>Filter projects...</span>
            ) : (
              <span>
                {selectedCount} project{selectedCount === 1 ? '' : 's'} selected
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start" container={portalContainer}>
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => {
                    onSelect(project.id);
                    if (singleSelect) {
                        setOpen(false);
                    }
                    // Keep open for multiple selections otherwise
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedProjectIds.includes(project.id)
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center gap-2 truncate">
                    {(project.avatar_url || project.avatarUrl) && (
                      <img
                        src={project.avatar_url || project.avatarUrl}
                        alt=""
                        className="h-4 w-4 rounded-full border border-gray-200"
                      />
                    )}
                    <span className="truncate">{project.name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}